// Lava vent: short rocky cylinder with a glowing red-orange cap. No animated
// smoke plume in this version (deferred); the static cap reads as "vent" from
// the air.
import { mergeGeometries } from '../terrain/trees.js';

export function buildVentGeometry(THREE) {
  const base = new THREE.CylinderGeometry(1.4, 1.6, 1.0, 8);
  base.translate(0, 0.0, 0);
  const cap = new THREE.CylinderGeometry(1.0, 1.0, 0.2, 8);
  cap.translate(0, 0.6, 0);
  const merged = mergeGeometries(THREE, [base, cap]);
  // Color the cap red-orange; the base dark grey. Identify by vertex Y.
  const pos = merged.attributes.position.array;
  const vCount = merged.attributes.position.count;
  const colors = new Float32Array(vCount * 3);
  for (let i = 0; i < vCount; i++) {
    const y = pos[i*3 + 1];
    if (y > 0.4) {
      colors[i*3] = 1.0; colors[i*3+1] = 0.40; colors[i*3+2] = 0.10;  // hot cap
    } else {
      colors[i*3] = 0.22; colors[i*3+1] = 0.18; colors[i*3+2] = 0.16; // dark rock
    }
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  merged.computeVertexNormals();
  return merged;
}
