// Worker-safe road primitives. No THREE, no DOM, no module-level work.
// Imported by:
//   * lib/roads/collision.js  — main thread car physics + UI sampling
//   * lib/roads/carve.js      — main thread legacy post-process hook (kept
//                                for the brief window before the worker
//                                receives setRoadGraph)
//   * lib/terrain/chunk-build.js — runs in the chunk worker; the height
//                                  carve, biome-colour, and tree placement
//                                  all consult the same road graph here
//                                  so everything is computed in the right
//                                  order in one pass instead of being
//                                  layered on top of pre-built data.

// --- Constants ---------------------------------------------------------------
export const ROAD_HALF_WIDTH        = 7;      // m → 14 m total asphalt corridor
export const ROAD_OFFSET_Y          = 0.05;
export const COLOR_TRANSITION_WIDTH = 2;      // m — asphalt cuts off sharply at the corridor edge
export const TERRAIN_TRANSITION_WIDTH = 50;   // m — terrain Y blend (so the shoulder is FLAT but biome-coloured)
export const TOTAL_BAND             = ROAD_HALF_WIDTH + TERRAIN_TRANSITION_WIDTH;
export const EARTH_PER_M            = 40;     // m of |ΔY| at which exposed-rock tint reaches full (raised so shoulders stay biome-coloured)
export const ASPHALT_R = 0.10, ASPHALT_G = 0.11, ASPHALT_B = 0.13;
export const ROCK_R    = 0.28, ROCK_G    = 0.24, ROCK_B    = 0.20;

const SEARCH_RADIUS = 80;          // m — nearEdges query distance
const SPATIAL_CELL  = 200;         // m — must match the constructor in spatial-index.js

// --- Geometry helpers --------------------------------------------------------
export function smoothFade(a, fullWidth, fadeWidth) {
  if (a >= fullWidth + fadeWidth) return 0;
  if (a <= fullWidth) return 1;
  const r = (a - fullWidth) / fadeWidth;
  return 1 - r * r * (3 - 2 * r);
}

export function roadInfluence(lat) {
  return smoothFade(Math.abs(lat), ROAD_HALF_WIDTH, TERRAIN_TRANSITION_WIDTH);
}

export function roadColorInfluence(lat) {
  return smoothFade(Math.abs(lat), ROAD_HALF_WIDTH, COLOR_TRANSITION_WIDTH);
}

// Signed perpendicular distance, parametric t along AB clamped to [0,1],
// unit tangent (tx, tz), squared distance from P to nearest point on segment.
export function pointSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const lSq = dx * dx + dz * dz;
  let t = lSq > 0 ? ((px - ax) * dx + (pz - az) * dz) / lSq : 0;
  t = Math.max(0, Math.min(1, t));
  const fx = ax + dx * t, fz = az + dz * t;
  const ex = px - fx, ez = pz - fz;
  const distSq = ex * ex + ez * ez;
  const len = Math.sqrt(lSq) || 1;
  const tx = dx / len, tz = dz / len;
  const lateral = (tx * ez - tz * ex);
  return { distSq, t, tx, tz, lateral };
}

// --- Road query --------------------------------------------------------------
// `graph` is a worker-safe shape: { edges: [{id, polyline: [{x,y,z}]}],
// spatialIndex: { cellSize, cells: Map<string, Set<number>>, nearEdges(x,z,r) } }
// Returns the nearest road segment (or null if beyond SEARCH_RADIUS).
export function queryRoadAt(graph, x, z) {
  const ids = graph.spatialIndex.nearEdges(x, z, SEARCH_RADIUS);
  let best = null;
  let bestDist = Infinity;
  for (const id of ids) {
    const e = graph.edges[id];
    for (let i = 0; i < e.polyline.length - 1; i++) {
      const a = e.polyline[i], b = e.polyline[i + 1];
      const r = pointSegment(x, z, a.x, a.z, b.x, b.z);
      if (r.distSq < bestDist) {
        bestDist = r.distSq;
        best = { edgeId: id, segIndex: i, ...r };
      }
    }
  }
  if (!best) return null;
  const d = Math.sqrt(bestDist);
  if (d > SEARCH_RADIUS) return null;
  const e = graph.edges[best.edgeId];
  const pA = e.polyline[best.segIndex];
  const pB = e.polyline[best.segIndex + 1];
  const centerY = pA.y + (pB.y - pA.y) * best.t + ROAD_OFFSET_Y;
  // Banking: each polyline point can carry a `bank` (radians) — the road
  // surface tilts about the centerline with the inside of the curve LOWER.
  // bankedY = centerY + lateral * tan(bank). Defaults to 0 if no bank info.
  const bankA = pA.bank || 0;
  const bankB = pB.bank || 0;
  const bank = bankA + (bankB - bankA) * best.t;
  const roadY = centerY + best.lateral * Math.tan(bank);
  return {
    edgeId: best.edgeId, segIndex: best.segIndex,
    lateralOffset: best.lateral, forwardT: best.t,
    segTangentX: best.tx, segTangentZ: best.tz,
    dist: d, roadY, bank, centerY,
  };
}

// --- Serialization for postMessage to the chunk worker -----------------------
// Strips nodes, spawn, the SpatialIndex class instance — keeps just what
// queryRoadAt needs.
export function serializeRoadGraph(graph) {
  return {
    edges: graph.edges.map(e => ({ id: e.id, polyline: e.polyline })),
    cellSize: graph.spatialIndex.cellSize,
    cells: graph.spatialIndex.cells,        // Map<string, Set<number>> — structured-cloneable
  };
}

export function reconstructRoadGraph(data) {
  const cells = data.cells;                  // already a Map after structured clone
  const cellSize = data.cellSize;
  return {
    edges: data.edges,
    spatialIndex: {
      cellSize,
      cells,
      nearEdges(x, z, radius) {
        const r = Math.ceil(radius / cellSize);
        const cx = Math.floor(x / cellSize);
        const cz = Math.floor(z / cellSize);
        const result = new Set();
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            const bucket = cells.get((cx + dx) + ':' + (cz + dz));
            if (!bucket) continue;
            for (const id of bucket) result.add(id);
          }
        }
        return [...result];
      },
    },
  };
}
