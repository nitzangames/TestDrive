// Steel guardrail ribbons just outside the yellow edge lines. Each side of
// the road gets one horizontal beam mesh sitting between RAIL_HEIGHT_LOW
// and RAIL_HEIGHT_HIGH above the carved road surface. Built once at boot
// from the same polyline data the carve uses — no per-frame work.

import { ROAD_HALF_WIDTH, ROAD_OFFSET_Y } from './shared.js';

const RAIL_OUTBOARD     = 0.6;    // m beyond ROAD_HALF_WIDTH (just past the yellow line)
const RAIL_HEIGHT_LOW   = 0.40;   // m above road surface
const RAIL_HEIGHT_HIGH  = 0.85;   // m above road surface
const RAIL_COLOR        = 0xb5b5b8; // brushed steel

export function buildGuardrails(THREE, graph) {
  const group = new THREE.Group();
  group.name = 'Guardrails';
  // Lambert so it picks up the scene's lighting; doubleSide so the inside
  // face (which the player normally sees) renders too.
  const material = new THREE.MeshLambertMaterial({ color: RAIL_COLOR, side: THREE.DoubleSide });

  const railOffset = ROAD_HALF_WIDTH + RAIL_OUTBOARD;

  for (const side of [+1, -1]) {
    const positions = [];
    const indices = [];
    let vertCount = 0;

    for (const edge of graph.edges) {
      const poly = edge.polyline;
      const n = poly.length;
      if (n < 2) continue;
      const segStart = vertCount;

      for (let i = 0; i < n; i++) {
        const a = poly[Math.max(0, i - 1)];
        const b = poly[Math.min(n - 1, i + 1)];
        const tx = b.x - a.x, tz = b.z - a.z;
        const tl = Math.hypot(tx, tz) || 1;
        // side=+1 places the perpendicular along driver's right; the
        // corresponding signed-lateral is -side*offset (driver's right is
        // lateral < 0 under the shared convention).
        const px = (tz / tl) * side;
        const pz = (-tx / tl) * side;
        const p = poly[i];
        const bank = p.bank || 0;
        const lateralSigned = -side * railOffset;
        // Road surface Y at this rail's lateral, then add the rail height.
        const surfaceY = p.y + ROAD_OFFSET_Y + lateralSigned * Math.tan(bank);
        const posX = p.x + px * railOffset;
        const posZ = p.z + pz * railOffset;
        positions.push(posX, surfaceY + RAIL_HEIGHT_LOW, posZ);
        positions.push(posX, surfaceY + RAIL_HEIGHT_HIGH, posZ);
      }
      for (let i = 0; i < n - 1; i++) {
        const aBot = segStart + i * 2;
        const aTop = aBot + 1;
        const bBot = segStart + (i + 1) * 2;
        const bTop = bBot + 1;
        indices.push(aBot, aTop, bBot);
        indices.push(bBot, aTop, bTop);
      }
      vertCount += n * 2;
    }

    if (positions.length === 0) continue;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    geom.computeBoundingSphere();
    group.add(new THREE.Mesh(geom, material));
  }
  return group;
}
