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

// Two separate bands:
//   * COLOR fade: short — asphalt stays visible only out to the road edge
//     plus a narrow gravel-shoulder transition.
//   * TERRAIN fade: long — the Y blend extends much further so mountains
//     taper smoothly into the road instead of cutting at the corridor edge.
export const COLOR_TRANSITION_WIDTH = 6;
export const TERRAIN_TRANSITION_WIDTH = 50;
export const TRANSITION_WIDTH = TERRAIN_TRANSITION_WIDTH; // back-compat for callers
export const TOTAL_BAND = ROAD_HALF_WIDTH + TERRAIN_TRANSITION_WIDTH;

function smoothFade(a, fullWidth, fadeWidth) {
  if (a >= fullWidth + fadeWidth) return 0;
  if (a <= fullWidth) return 1;
  const r = (a - fullWidth) / fadeWidth;
  return 1 - r * r * (3 - 2 * r);
}

// Road influence weight for the Y / wheel-pose blend. 1 in corridor, smooth
// to 0 over the full TERRAIN_TRANSITION_WIDTH band. The wheel sampler in
// shell/main.js uses this to match the visible carved surface.
export function roadInfluence(lat) {
  return smoothFade(Math.abs(lat), ROAD_HALF_WIDTH, TERRAIN_TRANSITION_WIDTH);
}

// Tighter weight for asphalt colouring so the dark band stays a reasonable
// road width visually even though the Y blend extends far beyond it.
function roadColorInfluence(lat) {
  return smoothFade(Math.abs(lat), ROAD_HALF_WIDTH, COLOR_TRANSITION_WIDTH);
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
    const wY = roadInfluence(q.lateralOffset);
    if (wY <= 0) continue;
    const wC = roadColorInfluence(q.lateralOffset);

    const y = positions[i + 1];
    positions[i + 1] = q.roadY * wY + y * (1 - wY);

    if (wC > 0) {
      const r0 = colors[i + 0], g0 = colors[i + 1], b0 = colors[i + 2];
      colors[i + 0] = ASPHALT_R * wC + r0 * (1 - wC);
      colors[i + 1] = ASPHALT_G * wC + g0 * (1 - wC);
      colors[i + 2] = ASPHALT_B * wC + b0 * (1 - wC);
    }
    modified = true;
  }

  if (modified) {
    pos.needsUpdate = true;
    col.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }
}
