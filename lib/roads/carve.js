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
// Color fade is wider than just the asphalt edge so the transition from
// dark road to biome colour matches the Y blend visually instead of looking
// like an abrupt line where the carve cuts in.
export const COLOR_TRANSITION_WIDTH = 25;
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

// Exposed rock / soil tone applied as a tint when the carve has pulled a
// vertex significantly downward (or upward) from its raw terrain height.
// Without this, a mountain peak that gets cut down to road level keeps its
// snow / mountain-band biome colour at the road's elevation, which reads
// as wrong. EARTH_PER_M is the metres of |ΔY| needed to fully tint to rock.
const ROCK_R = 0.28;
const ROCK_G = 0.24;
const ROCK_B = 0.20;
const EARTH_PER_M = 18;

// Handle the chunk's scatter list (trees / cacti / etc.) so nothing ends up
// either on the asphalt OR floating above / sunken into the carved transition
// band. The worker places scatter at the raw terrain Y, but our carve pulls
// the terrain mesh toward roadY across a wide band:
//   * within ROAD_HALF_WIDTH        → drop the scatter (no trees on the road)
//   * inside the TERRAIN_TRANSITION band (15..65 m lateral) → keep, but blend
//     the scatter's Y toward roadY by the same smoothstep weight the mesh
//     carve uses, so the tree sits on the carved surface
//   * outside the band → leave alone
export function filterChunkScatter(graph, scatterList) {
  if (!scatterList || scatterList.length === 0) return scatterList;
  let writeIdx = 0;
  for (let i = 0; i < scatterList.length; i++) {
    const t = scatterList[i];
    const q = queryRoadAt(graph, t.x, t.z);
    if (q) {
      // Use actual point-to-polyline distance, not the signed lateral,
      // because lateral can be misleading when the foot of perpendicular
      // lands on a polyline endpoint.
      const d = q.dist;
      if (d <= ROAD_HALF_WIDTH) continue;        // tree on the road → drop
      if (d < TOTAL_BAND) {
        const wY = roadInfluence(d);             // same weight as mesh carve
        t.y = q.roadY * wY + t.y * (1 - wY);     // sit on carved surface
      }
    }
    scatterList[writeIdx++] = t;
  }
  scatterList.length = writeIdx;
  return scatterList;
}

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
    const newY = q.roadY * wY + y * (1 - wY);
    positions[i + 1] = newY;

    // Cut-depth tint: how much did we shift this vertex's Y? More shift
    // → more of the underlying rock/soil exposed → tint toward EARTH.
    const cutAmount = Math.min(1, Math.abs(newY - y) / EARTH_PER_M);

    if (wC > 0 || cutAmount > 0) {
      let r0 = colors[i + 0], g0 = colors[i + 1], b0 = colors[i + 2];
      // First apply earth tint based on cut depth (uniformly within the
      // Y-influence band; outside the band wY is 0 so cutAmount is 0).
      if (cutAmount > 0) {
        r0 = ROCK_R * cutAmount + r0 * (1 - cutAmount);
        g0 = ROCK_G * cutAmount + g0 * (1 - cutAmount);
        b0 = ROCK_B * cutAmount + b0 * (1 - cutAmount);
      }
      // Then asphalt on top within the narrower colour band.
      if (wC > 0) {
        r0 = ASPHALT_R * wC + r0 * (1 - wC);
        g0 = ASPHALT_G * wC + g0 * (1 - wC);
        b0 = ASPHALT_B * wC + b0 * (1 - wC);
      }
      colors[i + 0] = r0;
      colors[i + 1] = g0;
      colors[i + 2] = b0;
    }
    modified = true;
  }

  if (modified) {
    pos.needsUpdate = true;
    col.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }
}
