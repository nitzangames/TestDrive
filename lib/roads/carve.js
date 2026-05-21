// Bake the road graph into each terrain chunk's mesh: vertices inside the
// road corridor are pulled to the road's polyline Y, vertices in a
// transition band are smoothstep-blended, and their per-vertex color is
// shifted toward dark asphalt grey. Outside the band the chunk is untouched.
//
// Called by lib/terrain/chunk-manager.js right after each chunk mesh is
// created (before it's added to the scene), via the chunkPostprocessor
// option threaded through createTerrain().
//
// Vertex grid: LOD 0 is 128x128 over a 256 m chunk = 2 m per vertex, so a
// 10 m road covers ~5 vertices in cross-section. LOD 1/2 chunks (further
// from camera) are coarser; the carve still applies but reads as a wider
// blur.

import { queryRoadAt } from './collision.js';
import { ROAD_HALF_WIDTH } from './geometry.js';

export const TRANSITION_WIDTH = 6;      // m of blend on each side
export const TOTAL_BAND = ROAD_HALF_WIDTH + TRANSITION_WIDTH;

// Returns the road influence weight (1 = pure road, 0 = pure terrain) for a
// given lateral offset from the centerline. Same smoothstep used by the
// chunk-mesh carve, so collision code (4-wheel pose sampling) and visible
// terrain stay in lockstep.
export function roadInfluence(lat) {
  const a = Math.abs(lat);
  if (a >= TOTAL_BAND) return 0;
  if (a <= ROAD_HALF_WIDTH) return 1;
  const r = (a - ROAD_HALF_WIDTH) / TRANSITION_WIDTH;
  return 1 - r * r * (3 - 2 * r);
}

// Asphalt vertex color (linearized sRGB-ish; matches MeshLambertMaterial input).
const ASPHALT_R = 0.10;
const ASPHALT_G = 0.11;
const ASPHALT_B = 0.13;

export function carveChunkMesh(mesh, graph, chunkCx, chunkCz, chunkSize) {
  // Cheap reject: if no road edge passes within this chunk + band, skip.
  const cxMid = (chunkCx + 0.5) * chunkSize;
  const czMid = (chunkCz + 0.5) * chunkSize;
  const chunkHalfDiag = chunkSize * 0.5 * Math.SQRT2;
  const nearby = graph.spatialIndex.nearEdges(cxMid, czMid, chunkHalfDiag + TOTAL_BAND);
  if (nearby.length === 0) return;

  const pos = mesh.geometry.attributes.position;
  const col = mesh.geometry.attributes.color;
  if (!pos || !col) return;
  const positions = pos.array;
  const colors = col.array;

  let modified = false;
  for (let i = 0, n = positions.length; i < n; i += 3) {
    const x = positions[i];
    const z = positions[i + 2];
    const q = queryRoadAt(graph, x, z);
    if (!q) continue;
    const w = roadInfluence(q.lateralOffset);
    if (w <= 0) continue;

    const y = positions[i + 1];
    positions[i + 1] = q.roadY * w + y * (1 - w);

    const r0 = colors[i + 0], g0 = colors[i + 1], b0 = colors[i + 2];
    colors[i + 0] = ASPHALT_R * w + r0 * (1 - w);
    colors[i + 1] = ASPHALT_G * w + g0 * (1 - w);
    colors[i + 2] = ASPHALT_B * w + b0 * (1 - w);
    modified = true;
  }

  if (modified) {
    pos.needsUpdate = true;
    col.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }
}
