// Yellow edge-line strips for the road. Two thin ribbon meshes (one per side)
// are built once at boot from the same polyline data the carve uses, placed
// just above the carved asphalt surface so they read as painted lane
// markings. Not part of the terrain mesh — they're a separate, very cheap
// geometry that lives in the scene for the lifetime of the loop.

import { ROAD_HALF_WIDTH, ROAD_OFFSET_Y } from './shared.js';

const LINE_HALF_WIDTH = 0.15;   // m → 30 cm wide painted line
const LINE_INSET      = 1.0;    // m from the asphalt edge inward
const LINE_Y_OFFSET   = 0.06;   // m above the carved road surface
const LINE_COLOR      = 0xf1c64a; // same warm yellow as the menu button / minimap arrow

// Walk every sub-edge's polyline once (sub-edges share endpoints around the
// closed loop, so duplicate points join cleanly). For each polyline point we
// emit two vertices per side — one nearer the centerline, one nearer the
// shoulder — so each side becomes a 30-cm-wide ribbon. The mesh is built as
// one geometry per side (two draw calls total).
export function buildRoadEdgeLines(THREE, graph) {
  const group = new THREE.Group();
  group.name = 'RoadEdgeLines';
  const material = new THREE.MeshBasicMaterial({ color: LINE_COLOR });

  const innerOffset = ROAD_HALF_WIDTH - LINE_INSET - LINE_HALF_WIDTH;
  const outerOffset = ROAD_HALF_WIDTH - LINE_INSET + LINE_HALF_WIDTH;

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
        // Tangent from prev → next (clamped at sub-edge ends; sub-edges share
        // endpoints so this stays continuous around the loop).
        const a = poly[Math.max(0, i - 1)];
        const b = poly[Math.min(n - 1, i + 1)];
        const tx = b.x - a.x, tz = b.z - a.z;
        const tl = Math.hypot(tx, tz) || 1;
        // Perpendicular in XZ plane: rotate tangent by 90°. side=+1 gives
        // one half-plane, side=-1 the other.
        const px = (tz / tl) * side;
        const pz = (-tx / tl) * side;
        const p = poly[i];
        const yLift = p.y + ROAD_OFFSET_Y + LINE_Y_OFFSET;
        // Inner ribbon vertex (closer to centerline) then outer.
        positions.push(p.x + px * innerOffset, yLift, p.z + pz * innerOffset);
        positions.push(p.x + px * outerOffset, yLift, p.z + pz * outerOffset);
      }
      // Triangle pairs between consecutive polyline points.
      for (let i = 0; i < n - 1; i++) {
        const aIn  = segStart + i * 2;
        const aOut = aIn + 1;
        const bIn  = segStart + (i + 1) * 2;
        const bOut = bIn + 1;
        indices.push(aIn, aOut, bIn);
        indices.push(bIn, aOut, bOut);
      }
      vertCount += n * 2;
    }

    if (positions.length === 0) continue;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geom.setIndex(indices);
    geom.computeBoundingSphere();
    group.add(new THREE.Mesh(geom, material));
  }

  return group;
}
