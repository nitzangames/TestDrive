// Mesh builders for road ribbon, guardrails, and junction disks.
// All builders return THREE.BufferGeometry.
// Width/height constants are exported so collision can read the same values.

export const ROAD_HALF_WIDTH   = 5;     // m
export const ROAD_OFFSET_Y     = 0.05;  // raise above terrain to avoid z-fight
export const GUARDRAIL_HEIGHT  = 0.8;   // m
export const JUNCTION_RADIUS   = 12;    // m (gap in guardrails, disk size)

// --- Road ribbon -----------------------------------------------------------
export function buildRoadRibbon(THREE, polyline) {
  const n = polyline.length;
  const positions = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const p = polyline[i];
    // Tangent: prev→next (clamped at endpoints).
    const a = polyline[Math.max(0, i - 1)];
    const b = polyline[Math.min(n - 1, i + 1)];
    const tx = b.x - a.x, tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    // Perpendicular in XZ (rotate tangent by 90°): (tz, -tx).
    const px = tz / tl, pz = -tx / tl;
    const yLift = p.y + ROAD_OFFSET_Y;
    positions[(i * 2) * 3 + 0] = p.x + px * ROAD_HALF_WIDTH;
    positions[(i * 2) * 3 + 1] = yLift;
    positions[(i * 2) * 3 + 2] = p.z + pz * ROAD_HALF_WIDTH;
    positions[(i * 2 + 1) * 3 + 0] = p.x - px * ROAD_HALF_WIDTH;
    positions[(i * 2 + 1) * 3 + 1] = yLift;
    positions[(i * 2 + 1) * 3 + 2] = p.z - pz * ROAD_HALF_WIDTH;
    if (i > 0) {
      const prev = polyline[i - 1];
      s += Math.hypot(p.x - prev.x, p.z - prev.z);
    }
    uvs[(i * 2) * 2 + 0] = 0;
    uvs[(i * 2) * 2 + 1] = s / 6; // ~repeat every 6m
    uvs[(i * 2 + 1) * 2 + 0] = 1;
    uvs[(i * 2 + 1) * 2 + 1] = s / 6;
  }
  const indices = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    indices.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

// --- Guardrail (one side) --------------------------------------------------
// `side` is +1 (left of forward direction) or -1 (right).
// Trims the rail near degree-≥3 junction endpoints so the player can transition.
export function buildGuardrail(THREE, polyline, side, trimStart, trimEnd) {
  const n = polyline.length;
  // Compute cumulative arc-length along polyline.
  const arc = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    arc[i] = arc[i - 1] + Math.hypot(polyline[i].x - polyline[i - 1].x, polyline[i].z - polyline[i - 1].z);
  }
  const total = arc[n - 1];
  const startS = trimStart ? JUNCTION_RADIUS : 0;
  const endS = trimEnd ? total - JUNCTION_RADIUS : total;

  // Find first/last index whose s falls within [startS, endS].
  let iStart = 0, iEnd = n - 1;
  for (let i = 0; i < n; i++) { if (arc[i] >= startS) { iStart = i; break; } }
  for (let i = n - 1; i >= 0; i--) { if (arc[i] <= endS) { iEnd = i; break; } }
  if (iEnd - iStart < 1) return null;

  const pts = polyline.slice(iStart, iEnd + 1);
  const m = pts.length;
  const positions = new Float32Array(m * 2 * 3);
  for (let i = 0; i < m; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(m - 1, i + 1)];
    const tx = b.x - a.x, tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    const px = (tz / tl) * side, pz = (-tx / tl) * side;
    const baseX = p.x + px * ROAD_HALF_WIDTH;
    const baseZ = p.z + pz * ROAD_HALF_WIDTH;
    positions[(i * 2) * 3 + 0] = baseX;
    positions[(i * 2) * 3 + 1] = p.y + ROAD_OFFSET_Y;
    positions[(i * 2) * 3 + 2] = baseZ;
    positions[(i * 2 + 1) * 3 + 0] = baseX;
    positions[(i * 2 + 1) * 3 + 1] = p.y + ROAD_OFFSET_Y + GUARDRAIL_HEIGHT;
    positions[(i * 2 + 1) * 3 + 2] = baseZ;
  }
  const indices = [];
  for (let i = 0; i < m - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    // Wind both sides so the rail is visible from either direction.
    indices.push(a, b, c, b, d, c);
    indices.push(c, b, a, c, d, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// --- Junction disk ---------------------------------------------------------
// Terrain-conforming disk centered at (cx, cz) used at degree-≥3 nodes.
export function buildJunctionDisk(THREE, cx, cz, terrainHeightFn, segments = 24) {
  const positions = new Float32Array((segments + 1) * 3);
  positions[0] = cx;
  positions[1] = terrainHeightFn(cx, cz) + ROAD_OFFSET_Y;
  positions[2] = cz;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const x = cx + Math.cos(t) * JUNCTION_RADIUS;
    const z = cz + Math.sin(t) * JUNCTION_RADIUS;
    positions[(i + 1) * 3 + 0] = x;
    positions[(i + 1) * 3 + 1] = terrainHeightFn(x, z) + ROAD_OFFSET_Y;
    positions[(i + 1) * 3 + 2] = z;
  }
  const indices = [];
  for (let i = 0; i < segments; i++) {
    const a = 0;
    const b = i + 1;
    const c = i === segments - 1 ? 1 : i + 2;
    indices.push(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

// --- Shared materials ------------------------------------------------------
// One asphalt material + one guardrail material reused across all road meshes.
export function buildRoadMaterials(THREE) {
  // Procedural asphalt texture: dark grey with a faint yellow center stripe.
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const c = canvas.getContext('2d');
  c.fillStyle = '#1c1f26'; c.fillRect(0, 0, 64, 64);
  // Subtle noise.
  for (let i = 0; i < 300; i++) {
    const x = Math.random() * 64, y = Math.random() * 64;
    c.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.03})`;
    c.fillRect(x, y, 1, 1);
  }
  // Center stripe (UV.x ~ 0.5).
  c.fillStyle = '#f1c64a';
  // Dashed: 8px on, 8px off.
  for (let y = 0; y < 64; y += 16) c.fillRect(31, y, 2, 8);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;

  const road = new THREE.MeshBasicMaterial({ map: tex });
  const guardrail = new THREE.MeshLambertMaterial({ color: 0xb3b8c2 });
  return { road, guardrail };
}
