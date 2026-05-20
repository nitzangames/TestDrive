// Maple: brown trunk + broad red-orange canopy. Geometry-only.
import { mergeGeometries } from '../terrain/trees.js';

export function buildMapleGeometry(THREE) {
  // Slim trunk
  const trunk = new THREE.CylinderGeometry(0.22, 0.28, 2.8, 5);
  trunk.translate(0, 0.2, 0);
  // Canopy: two stacked spheres for a fluffy silhouette
  const canopyLow = new THREE.IcosahedronGeometry(1.6, 0);
  canopyLow.translate(0, 2.4, 0);
  const canopyHigh = new THREE.IcosahedronGeometry(1.1, 0);
  canopyHigh.translate(0.2, 3.4, -0.1);
  const merged = mergeGeometries(THREE, [trunk, canopyLow, canopyHigh]);

  const trunkColor = new THREE.Color(0.30, 0.20, 0.13);
  const leafColor  = new THREE.Color(0.85, 0.42, 0.18);   // autumn maple orange
  const pos = merged.attributes.position.array;
  const vCount = merged.attributes.position.count;
  const colors = new Float32Array(vCount * 3);
  for (let i = 0; i < vCount; i++) {
    const y = pos[i*3 + 1];
    const c = (y < 1.6) ? trunkColor : leafColor;
    colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // Real-trees scale: 4x so maples read as proper trees against the
  // 5x-scaled terrain, matching the conifer scaling.
  merged.applyMatrix4(new THREE.Matrix4().makeScale(4, 4, 4));
  merged.computeVertexNormals();
  return merged;
}
