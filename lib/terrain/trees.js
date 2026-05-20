// Conifer base mesh: a 6-sided cone on a short trunk. ~12 tris.
// Tints are stored as instance attribute; the chunk manager builds InstancedMesh
// with one instance per tree descriptor returned from buildChunkBuffers.

// Per-biome billboard color + silhouette shape. Used by chunk-build for LOD-1
// billboards AND by chunk-manager for LOD-0 overlay billboards (which fade IN
// as the close-up tree shrinks OUT during the LOD 1→0 transition).
//   shape: 0 = pointy triangle  1 = rounded diamond  2 = column  3 = short rect
export const BILLBOARD_BIOME_STYLE = {
  forest:   { color: [0.20, 0.45, 0.20], shape: 0 },
  autumn:   { color: [0.62, 0.32, 0.16], shape: 1 },
  desert:   { color: [0.46, 0.55, 0.32], shape: 2 },
  arctic:   { color: [0.86, 0.90, 0.95], shape: 0 },
  volcanic: { color: [0.28, 0.18, 0.14], shape: 3 },
};

const TINT_PALETTE = [
  [0.18, 0.42, 0.18],   // dark green
  [0.30, 0.58, 0.30],   // lighter green
];

export function buildConiferGeometry(THREE) {
  // Trunk is 2.4 m tall but its base sits 1.2 m below the placement origin so it
  // extends into the ground. This hides the small gap that appears when the tree's
  // sampled height differs slightly from the interpolated terrain mesh under it.
  const trunkGeom = new THREE.CylinderGeometry(0.18, 0.25, 2.4, 5);
  // No translate: cylinder is centered at y=0, so it spans y=-1.2 (underground)
  // to y=+1.2 (where the cone sits).
  const coneGeom = new THREE.ConeGeometry(1.4, 4.2, 6);
  coneGeom.translate(0, 1.2 + 2.1, 0);
  // Merge the two into one BufferGeometry
  const merged = mergeGeometries(THREE, [trunkGeom, coneGeom]);
  // Color attribute: trunk vertices brown, cone vertices green.
  // (Per-instance color variation would require a custom shader because instanceColor
  // multiplies all vertices uniformly — that's deferred. v1 ships one green.)
  const trunkVCount = trunkGeom.attributes.position.count;
  const totalVCount = merged.attributes.position.count;
  const colors = new Float32Array(totalVCount * 3);
  for (let i = 0; i < trunkVCount; i++) {
    colors[i * 3] = 0.29; colors[i * 3 + 1] = 0.20; colors[i * 3 + 2] = 0.13;
  }
  for (let i = trunkVCount; i < totalVCount; i++) {
    colors[i * 3] = 0.24; colors[i * 3 + 1] = 0.50; colors[i * 3 + 2] = 0.24;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // Real-trees scale: bump the whole tree 4x so they read as proper trees
  // (15-20m tall) against the new 5x-scaled terrain instead of as bushes.
  merged.applyMatrix4(new THREE.Matrix4().makeScale(4, 4, 4));
  trunkGeom.dispose(); coneGeom.dispose();
  return merged;
}

export function mergeGeometries(THREE, geoms) {
  const out = new THREE.BufferGeometry();
  let totalV = 0, totalI = 0;
  for (const g of geoms) {
    totalV += g.attributes.position.count;
    if (g.index) totalI += g.index.count; else totalI += g.attributes.position.count;
  }
  const pos = new Float32Array(totalV * 3);
  const norm = new Float32Array(totalV * 3);
  const idx = new Uint32Array(totalI);
  let vOff = 0, iOff = 0;
  for (const g of geoms) {
    const gPos = g.attributes.position.array;
    const gNorm = g.attributes.normal ? g.attributes.normal.array : null;
    pos.set(gPos, vOff * 3);
    if (gNorm) norm.set(gNorm, vOff * 3);
    if (g.index) {
      const gIdx = g.index.array;
      for (let i = 0; i < gIdx.length; i++) idx[iOff + i] = gIdx[i] + vOff;
      iOff += gIdx.length;
    } else {
      for (let i = 0; i < gPos.length / 3; i++) idx[iOff + i] = i + vOff;
      iOff += gPos.length / 3;
    }
    vOff += gPos.length / 3;
  }
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (norm.some(v => v !== 0)) out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  if (!out.attributes.normal) out.computeVertexNormals();
  return out;
}

// Build an InstancedMesh from a tree descriptor list returned by buildChunkBuffers.
// Each descriptor: { x, y, z, scale, tint, rotation }. Tint is stored but not yet
// applied (would need a custom shader; v1 ships one green).
export function buildTreeInstancedMesh(THREE, geometry, material, trees) {
  const im = new THREE.InstancedMesh(geometry, material, trees.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < trees.length; i++) {
    const t = trees[i];
    p.set(t.x, t.y, t.z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rotation);
    s.set(t.scale, t.scale, t.scale);
    m.compose(p, q, s);
    im.setMatrixAt(i, m);
  }
  im.instanceMatrix.needsUpdate = true;
  im.frustumCulled = false; // chunk-level culling handled by chunk manager
  return im;
}

// A simple billboard quad — vertical plane, base at y=0, top at y=5.5. Each instance
// is rotated around Y in the vertex shader to face the camera horizontally.
export function buildBillboardGeometry(THREE) {
  const g = new THREE.PlaneGeometry(3.5, 5.5);
  g.translate(0, 2.75, 0);
  return g;
}

// Material for distant scatter billboards. Y-axis-aligned billboarding (rotates around Y
// to face the camera) + a procedural silhouette mask via discard. Cheap, no texture.
//
// Per-instance attributes drive variety:
//   aColor (vec3) — tint
//   aShape (float) — 0 = pointy triangle (conifer / icespike)
//                    1 = rounded diamond  (autumn maple canopy)
//                    2 = vertical column  (cactus)
//                    3 = short, fat rect  (vent)
// fadeMode = 'far'  → visible inside [uBBFadeStart, uBBFadeEnd], fades out beyond
//                     (default; LOD-1 chunks use this — billboards far from camera)
// fadeMode = 'near' → INVERTED: invisible up to uBBFadeStart, fades IN by uBBFadeEnd
//                     (LOD-0 chunks overlay this on tree positions so the
//                      billboard fills in where the tree is still shrunk; the
//                      tree's grow-fade is [600, 750], the billboard's inverse
//                      cross-fade keeps the silhouette unbroken through LOD 1→0)
export function buildBillboardMaterial(THREE, opts = {}) {
  const fadeMode = opts.fadeMode || 'far';
  const fadeStart = opts.fadeStart != null ? opts.fadeStart : (fadeMode === 'near' ? 600 : 1300);
  const fadeEnd   = opts.fadeEnd   != null ? opts.fadeEnd   : (fadeMode === 'near' ? 750 : 1500);
  const fadeExpr = fadeMode === 'near'
    ? 'smoothstep(uBBFadeStart, uBBFadeEnd, length(toCam))'
    : '1.0 - smoothstep(uBBFadeStart, uBBFadeEnd, length(toCam))';
  return new THREE.ShaderMaterial({
    transparent: false,         // discard handles cutout; no blending needed
    side: THREE.DoubleSide,
    uniforms: {
      uBBFadeStart: { value: fadeStart },
      uBBFadeEnd:   { value: fadeEnd },
    },
    vertexShader: `
      uniform float uBBFadeStart;
      uniform float uBBFadeEnd;
      attribute vec3 aColor;
      attribute float aShape;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vShape;
      void main() {
        vUv = uv;
        vColor = aColor;
        vShape = aShape;
        // Instance world position (translation column of instanceMatrix).
        vec3 instOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        // Y-billboard: rotate local position around Y so the +Z normal faces the camera.
        vec3 toCam = cameraPosition - instOrigin;
        float angle = atan(toCam.x, toCam.z);
        float c = cos(angle), s = sin(angle);
        // We also want to honor the per-instance Y-rotation and scale stored in instanceMatrix
        // — extract scale Y, leave the rest to the billboard.
        float scaleY = length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2]));
        vec3 scaled = vec3(position.x * scaleY, position.y * scaleY, position.z * scaleY);
        vec3 rotated = vec3(
          scaled.x * c + scaled.z * s,
          scaled.y,
          -scaled.x * s + scaled.z * c
        );
        // Distance shrink-fade. Direction (far vs near edge) chosen at material
        // build time — see fadeMode comment on buildBillboardMaterial.
        float fade = ${fadeExpr};
        rotated *= fade;
        vec4 worldPos = vec4(instOrigin + rotated, 1.0);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vShape;
      void main() {
        float halfW;
        // Branch on shape mode. Per-instance float is constant across the
        // primitive so this is effectively a static branch for each draw.
        if (vShape < 0.5) {
          // pointy triangle (conifer / icespike)
          halfW = 0.5 * (1.0 - vUv.y);
        } else if (vShape < 1.5) {
          // rounded diamond (autumn maple)
          halfW = 0.5 * sqrt(max(0.0, 1.0 - pow(2.0 * vUv.y - 1.0, 2.0)));
        } else if (vShape < 2.5) {
          // vertical column (cactus): full width over the bottom 80%, taper at top
          halfW = vUv.y < 0.85 ? 0.22 : 0.22 * (1.0 - (vUv.y - 0.85) / 0.15);
        } else {
          // short fat rectangle (vent): only bottom 40% of the quad
          halfW = vUv.y < 0.40 ? 0.35 : 0.0;
        }
        if (abs(vUv.x - 0.5) > halfW) discard;
        // Slightly darker toward base for a hint of shading.
        float shade = mix(0.62, 1.0, vUv.y);
        gl_FragColor = vec4(vColor * shade, 1.0);
      }
    `,
  });
}

// Build an InstancedMesh of billboard quads from a placement list.
// Each list item may carry { color: [r,g,b], shape: 0..3 } — defaults to
// conifer green / pointy-triangle when missing. Color/shape are attached as
// per-instance attributes on a CLONED geometry so different chunks (different
// biomes) don't stomp each other.
export function buildBillboardInstancedMesh(THREE, geometry, material, list) {
  const geom = geometry.clone();
  const im = new THREE.InstancedMesh(geom, material, list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();          // identity — billboarding is in the shader
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const colors = new Float32Array(list.length * 3);
  const shapes = new Float32Array(list.length);
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    p.set(t.x, t.y, t.z);
    s.set(t.scale, t.scale, t.scale);
    m.compose(p, q, s);
    im.setMatrixAt(i, m);
    const col = t.color || [0.20, 0.45, 0.20];
    colors[i * 3]     = col[0];
    colors[i * 3 + 1] = col[1];
    colors[i * 3 + 2] = col[2];
    shapes[i] = t.shape || 0;
  }
  im.instanceMatrix.needsUpdate = true;
  geom.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
  geom.setAttribute('aShape', new THREE.InstancedBufferAttribute(shapes, 1));
  im.frustumCulled = false;
  return im;
}
