// Road graph generation. Deterministic from seed.
// Public entry point: buildRoadGraph(opts) — added in Task 7.
// This file is built up across Task 6, Task 7.

import { triangulate } from './delaunay.js';
import { SpatialIndex } from './spatial-index.js';

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

const MAX_EDGE_LENGTH = 9000;
// Slope is checked over EDGE_SAMPLE_STEP-long sub-segments. Short steps spike
// on terrain noise; longer steps average them out. 200m chunks + 30° max give
// roads that follow valleys but don't pretend the world is a billiard table.
const MAX_EDGE_SLOPE_DEG = 30;
const MAX_EDGE_HEIGHT_DELTA = 500;
const EDGE_SAMPLE_STEP = 200;
const POLYLINE_POINT_STEP = 50;   // re-sample for smoothing
const POLYLINE_SMOOTH_PASSES = 2;
const EXTRA_EDGE_RATIO = 0.25;

function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

function edgeIsBuildable(a, b, terrainHeightFn, isOnWater, reasons) {
  const len = dist(a, b);
  if (len > MAX_EDGE_LENGTH) { if (reasons) reasons.tooLong++; return false; }
  let hMin = Infinity, hMax = -Infinity;
  const steps = Math.ceil(len / EDGE_SAMPLE_STEP);
  let prevH = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    if (isOnWater(x, z)) { if (reasons) reasons.water++; return false; }
    const h = terrainHeightFn(x, z);
    if (h < hMin) hMin = h;
    if (h > hMax) hMax = h;
    if (prevH !== null) {
      const dy = h - prevH;
      const slopeDeg = Math.atan(Math.abs(dy) / EDGE_SAMPLE_STEP) * 180 / Math.PI;
      if (slopeDeg > MAX_EDGE_SLOPE_DEG) { if (reasons) reasons.slope++; return false; }
    }
    prevH = h;
  }
  if (hMax - hMin > MAX_EDGE_HEIGHT_DELTA) { if (reasons) reasons.heightDelta++; return false; }
  return true;
}

function buildPolyline(a, b, terrainHeightFn) {
  const len = dist(a, b);
  const steps = Math.max(2, Math.ceil(len / POLYLINE_POINT_STEP));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    pts.push({ x, y: 0, z });
  }
  // Smooth XZ with 3-tap moving average (endpoints fixed).
  for (let pass = 0; pass < POLYLINE_SMOOTH_PASSES; pass++) {
    const next = pts.map(p => ({ ...p }));
    for (let i = 1; i < pts.length - 1; i++) {
      next[i].x = (pts[i - 1].x + pts[i].x + pts[i + 1].x) / 3;
      next[i].z = (pts[i - 1].z + pts[i].z + pts[i + 1].z) / 3;
    }
    for (let i = 0; i < pts.length; i++) { pts[i].x = next[i].x; pts[i].z = next[i].z; }
  }
  for (const p of pts) p.y = terrainHeightFn(p.x, p.z);
  // Smooth Y too: terrain noise between points produces ramp-y roads that
  // look like roller-coasters. A wider window + more passes flattens the
  // profile. Endpoints are pinned to terrain so the road still meets the
  // ground at junctions.
  const Y_SMOOTH_PASSES = 5;
  for (let pass = 0; pass < Y_SMOOTH_PASSES; pass++) {
    const nextY = pts.map(p => p.y);
    for (let i = 1; i < pts.length - 1; i++) {
      const i0 = Math.max(0, i - 2);
      const i1 = Math.min(pts.length - 1, i + 2);
      let sum = 0, count = 0;
      for (let k = i0; k <= i1; k++) { sum += pts[k].y; count++; }
      nextY[i] = sum / count;
    }
    for (let i = 1; i < pts.length - 1; i++) pts[i].y = nextY[i];
  }
  return pts;
}

function unionFind(n) {
  const p = new Array(n);
  for (let i = 0; i < n; i++) p[i] = i;
  function find(i) { while (p[i] !== i) { p[i] = p[p[i]]; i = p[i]; } return i; }
  function union(a, b) { const ra = find(a), rb = find(b); if (ra === rb) return false; p[ra] = rb; return true; }
  return { find, union };
}

export function buildRoadGraph({ seed, terrainHeightFn, isOnWater }) {
  const nodes = generateNodeCandidates({ seed, terrainHeightFn, isOnWater });

  // Triangulate.
  const candidates = triangulate(nodes);
  // Filter to buildable edges.
  const reasons = { tooLong: 0, water: 0, slope: 0, heightDelta: 0 };
  const buildable = candidates
    .filter(([i, j]) => edgeIsBuildable(nodes[i], nodes[j], terrainHeightFn, isOnWater, reasons))
    .map(([i, j]) => ({ i, j, len: dist(nodes[i], nodes[j]) }))
    .sort((a, b) => a.len - b.len);
  if (typeof console !== 'undefined') {
    console.log('[roads] candidates:', candidates.length, 'buildable:', buildable.length, 'rejected:', JSON.stringify(reasons));
  }

  // MST via Kruskal.
  const uf = unionFind(nodes.length);
  const mstEdges = [];
  const nonMstEdges = [];
  for (const e of buildable) {
    if (uf.union(e.i, e.j)) mstEdges.push(e);
    else nonMstEdges.push(e);
  }

  // Add ~25% extra shortest non-MST edges for loops.
  const extraCount = Math.floor(mstEdges.length * EXTRA_EDGE_RATIO);
  const extras = nonMstEdges.slice(0, extraCount);

  const allEdges = [...mstEdges, ...extras].map((e, id) => {
    const a = nodes[e.i], b = nodes[e.j];
    const polyline = buildPolyline(a, b, terrainHeightFn);
    return { id, nodeA: e.i, nodeB: e.j, polyline, length: e.len };
  });

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
    const e = allEdges[spawnNode.edges[0]];
    const other = e.nodeA === spawnNode.id ? nodes[e.nodeB] : nodes[e.nodeA];
    headingY = Math.atan2(other.x - spawnNode.x, other.z - spawnNode.z);
  }

  const spatialIndex = new SpatialIndex(allEdges, 200);
  return {
    nodes,
    edges: allEdges,
    spawn: { x: spawnNode.x, y: spawnNode.y, z: spawnNode.z, headingY },
    spatialIndex,
  };
}
