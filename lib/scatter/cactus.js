// Saguaro cactus: tall central column with 1–2 arms. ~12 tris total.
// Geometry-only — placement is handled by the existing terrain scatter system,
// not the canyon-segment placement from CanyonRun3D's cacti.js.

import { mergeGeometries } from '../terrain/trees.js';   // reuse existing util

export function buildCactusGeometry(THREE) {
  const green = new THREE.Color(0.16, 0.42, 0.20);
  // Trunk: tall central column. Base at y=-1 sinks 1m into the ground to
  // hide the seam (same trick as the conifer trunk). Top at y=6 — the
  // trunk towers above both arms so the silhouette reads as a saguaro
  // rather than a tuning fork.
  const trunk = new THREE.CylinderGeometry(0.55, 0.55, 7.0, 8);
  trunk.translate(0, 2.5, 0);
  // Left arm — horizontal stub then a shorter vertical riser. Riser top
  // sits at y=4, ~2m below the trunk crown.
  const armL = new THREE.CylinderGeometry(0.34, 0.34, 1.6, 6);
  armL.rotateZ(Math.PI / 2); armL.translate(-0.85, 2.2, 0);
  const armLUp = new THREE.CylinderGeometry(0.34, 0.34, 1.6, 6);
  armLUp.translate(-1.55, 3.0, 0);
  // Right arm — slightly lower attachment + shorter riser so the cactus
  // isn't bilaterally symmetric (real saguaros are wonky).
  const armR = new THREE.CylinderGeometry(0.32, 0.32, 1.3, 6);
  armR.rotateZ(-Math.PI / 2); armR.translate(0.7, 1.7, 0);
  const armRUp = new THREE.CylinderGeometry(0.32, 0.32, 1.2, 6);
  armRUp.translate(1.25, 2.3, 0);
  // Joint + crown spheres — soften the cylinder seams at each bend and
  // cap the open tops. Radii slightly larger than the cylinder they cap
  // so the sphere reads as a swell, not a flat plug.
  const topCap = new THREE.SphereGeometry(0.58, 8, 6);
  topCap.translate(0, 6.0, 0);
  const lElbow = new THREE.SphereGeometry(0.38, 8, 6);
  lElbow.translate(-1.55, 2.2, 0);
  const lTip   = new THREE.SphereGeometry(0.36, 8, 6);
  lTip.translate(-1.55, 3.8, 0);
  const rElbow = new THREE.SphereGeometry(0.36, 8, 6);
  rElbow.translate(1.25, 1.7, 0);
  const rTip   = new THREE.SphereGeometry(0.34, 8, 6);
  rTip.translate(1.25, 2.9, 0);
  const merged = mergeGeometries(THREE,
    [trunk, armL, armLUp, armR, armRUp, topCap, lElbow, lTip, rElbow, rTip]);
  // Solid green vertex colors
  const vCount = merged.attributes.position.count;
  const colors = new Float32Array(vCount * 3);
  for (let i = 0; i < vCount; i++) {
    colors[i*3] = green.r; colors[i*3+1] = green.g; colors[i*3+2] = green.b;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  merged.computeVertexNormals();
  return merged;
}
