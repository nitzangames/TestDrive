// Road graph generation. Deterministic from seed.
// Public entry point: buildRoadGraph(opts) — added in Task 7.
// This file is built up across Task 6, Task 7.

import { triangulate } from './delaunay.js';
import { SpatialIndex } from './spatial-index.js';
import { findRoadPath } from './pathfind.js';

const WORLD_SIZE = 64000;        // matches FlightSim terrain.WORLD_SIZE
const NODE_GRID_CELL = 2000;     // ~2 km cells → ~1024 candidates; after slope/spacing filters ~150-250 nodes
const NODE_MIN_SPACING = 800;    // Poisson-disk separation (slightly larger than half a cell)
const MAX_SLOPE_DEG = 18;        // reject candidates on steep ground

// 32-bit mulberry32 PRNG. Deterministic. From the standard reference.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Approximate slope (degrees) by sampling ±50 m on both axes.
function slopeDegAt(x, z, terrainHeightFn) {
  const h0 = terrainHeightFn(x, z);
  const hX = terrainHeightFn(x + 50, z);
  const hZ = terrainHeightFn(x, z + 50);
  const dydx = (hX - h0) / 50;
  const dydz = (hZ - h0) / 50;
  const slope = Math.sqrt(dydx * dydx + dydz * dydz);
  return Math.atan(slope) * 180 / Math.PI;
}

export function generateNodeCandidates({ seed, terrainHeightFn, isOnWater }) {
  const rng = mulberry32(seed);
  const half = WORLD_SIZE / 2;
  const accepted = [];

  // Jittered grid of candidates across the world.
  for (let cz = -half; cz < half; cz += NODE_GRID_CELL) {
    for (let cx = -half; cx < half; cx += NODE_GRID_CELL) {
      const jx = (rng() - 0.5) * NODE_GRID_CELL * 0.8;
      const jz = (rng() - 0.5) * NODE_GRID_CELL * 0.8;
      const x = cx + NODE_GRID_CELL / 2 + jx;
      const z = cz + NODE_GRID_CELL / 2 + jz;

      if (slopeDegAt(x, z, terrainHeightFn) > MAX_SLOPE_DEG) continue;
      if (isOnWater(x, z)) continue;
      // Reject candidates below or right at the water plane (lib/terrain
      // /water.js puts the water surface at y=0); roads built from such
      // a node would start under water.
      if (terrainHeightFn(x, z) < 1) continue;

      let tooClose = false;
      for (const n of accepted) {
        const dx = n.x - x, dz = n.z - z;
        if (dx * dx + dz * dz < NODE_MIN_SPACING * NODE_MIN_SPACING) { tooClose = true; break; }
      }
      if (tooClose) continue;

      accepted.push({ id: accepted.length, x, y: terrainHeightFn(x, z), z, edges: [] });
    }
  }
  return accepted;
}

// Internal export for Task 7's pruning step.
export const _internals = { mulberry32, slopeDegAt, WORLD_SIZE, NODE_MIN_SPACING };

// Cap straight-line distance between nodes; longer pairs aren't even worth
// running A* on. The A* path itself can be up to MAX_PATH_OVERAGE (in
// pathfind.js) times this.
const MAX_EDGE_LENGTH = 9000;
const EXTRA_EDGE_RATIO = 0.25;

function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

function unionFind(n) {
  const p = new Array(n);
  for (let i = 0; i < n; i++) p[i] = i;
  function find(i) { while (p[i] !== i) { p[i] = p[p[i]]; i = p[i]; } return i; }
  function union(a, b) { const ra = find(a), rb = find(b); if (ra === rb) return false; p[ra] = rb; return true; }
  return { find, union };
}

export function buildRoadGraph({ seed, terrainHeightFn, isOnWater }) {
  const nodes = generateNodeCandidates({ seed, terrainHeightFn, isOnWater });

  // Triangulate to get candidate edges.
  const candidates = triangulate(nodes);

  // For each candidate, run slope-aware A* to find an actual buildable path.
  // A* returns null when no path exists (e.g. blocked by water or only
  // through impassable >32° slopes), which serves as the edge-rejection
  // signal. Drop too-long-straight-line edges first (saves A* time).
  let tooLongCount = 0, noPathCount = 0;
  const paths = [];
  for (const [i, j] of candidates) {
    const a = nodes[i], b = nodes[j];
    if (dist(a, b) > MAX_EDGE_LENGTH) { tooLongCount++; continue; }
    const polyline = findRoadPath(a, b, terrainHeightFn, isOnWater);
    if (!polyline) { noPathCount++; continue; }
    let pathLen = 0;
    for (let k = 1; k < polyline.length; k++) {
      pathLen += Math.hypot(polyline[k].x - polyline[k - 1].x,
                            polyline[k].z - polyline[k - 1].z);
    }
    paths.push({ i, j, len: pathLen, polyline });
  }
  paths.sort((a, b) => a.len - b.len);
  if (typeof console !== 'undefined') {
    console.log('[roads] candidates:', candidates.length, 'paths:', paths.length,
                'rejected: tooLong=' + tooLongCount + ' noPath=' + noPathCount);
  }

  // MST via Kruskal on actual path lengths.
  const uf = unionFind(nodes.length);
  const mstEdges = [];
  const nonMstEdges = [];
  for (const e of paths) {
    if (uf.union(e.i, e.j)) mstEdges.push(e);
    else nonMstEdges.push(e);
  }

  // Add ~25% extra shortest non-MST edges for loops.
  const extraCount = Math.floor(mstEdges.length * EXTRA_EDGE_RATIO);
  const extras = nonMstEdges.slice(0, extraCount);

  const allEdges = [...mstEdges, ...extras].map((e, id) => ({
    id, nodeA: e.i, nodeB: e.j, polyline: e.polyline, length: e.len,
  }));

  // Wire edge ids into nodes.
  for (const e of allEdges) {
    nodes[e.nodeA].edges.push(e.id);
    nodes[e.nodeB].edges.push(e.id);
  }

  // Spawn: connected node nearest origin (skip nodes whose candidate edges were
  // all pruned — they're isolated and have no road geometry).
  let spawnNode = null;
  let spawnDist = Infinity;
  for (const n of nodes) {
    if (n.edges.length === 0) continue;
    const d = Math.hypot(n.x, n.z);
    if (d < spawnDist) { spawnDist = d; spawnNode = n; }
  }
  if (!spawnNode) spawnNode = nodes[0]; // fallback (shouldn't happen with MST)
  let headingY = 0;
  if (spawnNode.edges.length > 0) {
    // Use the polyline's actual outgoing direction (paths can curve at the
    // node) rather than the straight line to the other node.
    const e = allEdges[spawnNode.edges[0]];
    const reverse = e.nodeB === spawnNode.id;
    const p0 = reverse ? e.polyline[e.polyline.length - 1] : e.polyline[0];
    const p1 = reverse ? e.polyline[e.polyline.length - 2] : e.polyline[1];
    headingY = Math.atan2(p1.x - p0.x, p1.z - p0.z);
  }

  const spatialIndex = new SpatialIndex(allEdges, 200);
  return {
    nodes,
    edges: allEdges,
    spawn: { x: spawnNode.x, y: spawnNode.y, z: spawnNode.z, headingY },
    spatialIndex,
  };
}
