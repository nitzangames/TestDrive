// Dashed white centre line. Built once at boot from the same polyline data
// the carve uses, placed just above the carved asphalt. Lives in the scene
// for the lifetime of the loop — no per-frame work.
//
// Dashing is by polyline-segment count, not absolute arc length. The
// polyline has fairly uniform spacing (Catmull-Rom + Laplacian → ~1-1.5 m
// per segment) so the visible dashes look regular.

import { ROAD_OFFSET_Y } from './shared.js';

const CENTER_HALF_WIDTH = 0.18;   // m → 36 cm wide painted line
const CENTER_Y_OFFSET   = 0.07;   // m above carved road surface (slightly higher than edge lines)
const CENTER_COLOR      = 0xffffff;

// Polyline points end up ~6 m apart after Catmull-Rom + Laplacian smoothing,
// so VISIBLE=1, GAP=3 gives roughly 6 m dash + 18 m gap — close to the
// standard 3:1 gap-to-dash ratio of US road centre markings.
const VISIBLE_SEG = 1;
const GAP_SEG     = 3;
const PERIOD      = VISIBLE_SEG + GAP_SEG;

export function buildRoadCenterLine(THREE, graph) {
  const group = new THREE.Group();
  group.name = 'RoadCenterLine';
  // DoubleSide so back-face culling can't hide the strip when the polyline
  // tangent flips relative to camera (matches lines.js).
  const material = new THREE.MeshBasicMaterial({ color: CENTER_COLOR, side: THREE.DoubleSide });

  const positions = [];
  const indices = [];
  let vertCount = 0;
  let globalSegIdx = 0;            // continues across sub-edge boundaries

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
      const px = tz / tl;
      const pz = -tx / tl;
      const p = poly[i];
      const yLift = p.y + ROAD_OFFSET_Y + CENTER_Y_OFFSET;
      // Inner strip vertex then outer (centerline is at lateral 0; the
      // strip straddles it ±CENTER_HALF_WIDTH).
      positions.push(p.x + px * -CENTER_HALF_WIDTH, yLift, p.z + pz * -CENTER_HALF_WIDTH);
      positions.push(p.x + px *  CENTER_HALF_WIDTH, yLift, p.z + pz *  CENTER_HALF_WIDTH);
    }
    for (let i = 0; i < n - 1; i++) {
      const visible = (globalSegIdx % PERIOD) < VISIBLE_SEG;
      globalSegIdx++;
      if (!visible) continue;
      const aIn  = segStart + i * 2;
      const aOut = aIn + 1;
      const bIn  = segStart + (i + 1) * 2;
      const bOut = bIn + 1;
      indices.push(aIn, aOut, bIn);
      indices.push(bIn, aOut, bOut);
    }
    vertCount += n * 2;
  }

  if (positions.length === 0) return group;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geom.setIndex(indices);
  geom.computeBoundingSphere();
  group.add(new THREE.Mesh(geom, material));
  return group;
}
