// Single-loop road generator. Picks ~14 waypoint anchors around a big circle,
// runs slope-aware A* between each adjacent pair, concatenates the polylines,
// then closed-Catmull-Rom smooths the whole thing into a continuous tangent-
// continuous (C1) curve in both XZ and Y.
//
// Output is a graph object compatible with the existing carve/collision code:
// the loop is split into many small sub-edges so the spatial index can
// efficiently filter by location. Conceptually it's one road; mechanically
// it's a closed cycle of ~200 short sub-edges.

import { SpatialIndex } from './spatial-index.js';
import { findRoadPath } from './pathfind.js';

const WORLD_SIZE = 64000;
const RING_RADIUS = 20000;             // m — base radius of the loop
const RING_RADIUS_JITTER = 0.25;       // ±25 % of RING_RADIUS per waypoint
const RING_ANGLE_JITTER = 0.4;         // rad — ±~23° angular jitter
const WAYPOINT_COUNT = 14;
const WAYPOINT_MAX_TRIES = 60;
const WAYPOINT_MIN_SLOPE_DEG = 20;     // candidate slope ceiling
const WAYPOINT_MIN_Y = 2;              // keep waypoints above water plane (+ buffer)

const SMOOTH_SAMPLES_PER_SEGMENT = 8;  // Catmull-Rom samples between each pair of control points
const SUB_EDGE_POINTS = 20;            // polyline points per spatial-indexable sub-edge
const MAX_GRADE = 0.08;                // 8% — max longitudinal road grade after smoothing
const GRADE_CLAMP_PASSES = 80;         // iterative clamp passes (closed-loop aware)

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function slopeDegAt(x, z, terrainHeightFn) {
  const h0 = terrainHeightFn(x, z);
  const hX = terrainHeightFn(x + 50, z);
  const hZ = terrainHeightFn(x, z + 50);
  const dydx = (hX - h0) / 50;
  const dydz = (hZ - h0) / 50;
  return Math.atan(Math.hypot(dydx, dydz)) * 180 / Math.PI;
}

function pickWaypoint(i, rng, terrainHeightFn, isOnWater) {
  const baseAngle = (i / WAYPOINT_COUNT) * Math.PI * 2;
  for (let attempt = 0; attempt < WAYPOINT_MAX_TRIES; attempt++) {
    const angle = baseAngle + (rng() - 0.5) * 2 * RING_ANGLE_JITTER;
    const r = RING_RADIUS * (1 + (rng() - 0.5) * 2 * RING_RADIUS_JITTER);
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    if (Math.abs(x) > WORLD_SIZE / 2 - 1000) continue;
    if (Math.abs(z) > WORLD_SIZE / 2 - 1000) continue;
    if (isOnWater(x, z)) continue;
    const y = terrainHeightFn(x, z);
    if (y < WAYPOINT_MIN_Y) continue;
    if (slopeDegAt(x, z, terrainHeightFn) > WAYPOINT_MIN_SLOPE_DEG) continue;
    return { x, y, z };
  }
  // Last-resort fallback: nominal circle position; clamp Y above water.
  const baseAngle2 = (i / WAYPOINT_COUNT) * Math.PI * 2;
  const fx = Math.cos(baseAngle2) * RING_RADIUS;
  const fz = Math.sin(baseAngle2) * RING_RADIUS;
  return { x: fx, y: Math.max(WAYPOINT_MIN_Y, terrainHeightFn(fx, fz)), z: fz };
}

// Closed Catmull-Rom (uniform parameterisation, tension = 0.5). Indices wrap
// modulo N so the resulting curve is closed and tangent-continuous at the
// join. Samples SMOOTH_SAMPLES_PER_SEGMENT points per control-point pair.
function catmullRomClosed(pts) {
  const N = pts.length;
  if (N < 4) return pts.slice();
  const out = [];
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % N];
    const p3 = pts[(i + 2) % N];
    for (let j = 0; j < SMOOTH_SAMPLES_PER_SEGMENT; j++) {
      const t = j / SMOOTH_SAMPLES_PER_SEGMENT;
      const t2 = t * t, t3 = t2 * t;
      const c0 = -0.5 * t3 + t2 - 0.5 * t;
      const c1 = 1.5 * t3 - 2.5 * t2 + 1;
      const c2 = -1.5 * t3 + 2 * t2 + 0.5 * t;
      const c3 = 0.5 * t3 - 0.5 * t2;
      const x = c0 * p0.x + c1 * p1.x + c2 * p2.x + c3 * p3.x;
      const y = c0 * p0.y + c1 * p1.y + c2 * p2.y + c3 * p3.y;
      const z = c0 * p0.z + c1 * p1.z + c2 * p2.z + c3 * p3.z;
      out.push({ x, y, z });
    }
  }
  return out;
}

// Iterative weighted 3-tap Laplacian on XZ, with circular wrap so the loop
// stays closed. Each pass: pts[i].xz ← (prev + 2·curr + next) / 4. Modest
// shrinkage per pass (~1-2% area for a closed convex curve), but rounds out
// the sharp corners A* leaves behind after grid-aligned pathfinding.
function laplacianSmoothXZClosed(pts, passes) {
  const N = pts.length;
  const sx = new Float64Array(N);
  const sz = new Float64Array(N);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < N; i++) {
      const prev = pts[(i - 1 + N) % N];
      const next = pts[(i + 1) % N];
      sx[i] = (prev.x + pts[i].x * 2 + next.x) * 0.25;
      sz[i] = (prev.z + pts[i].z * 2 + next.z) * 0.25;
    }
    for (let i = 0; i < N; i++) { pts[i].x = sx[i]; pts[i].z = sz[i]; }
  }
}

function pathLen(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  }
  return s;
}

// Clamp the Y profile so no consecutive polyline pair exceeds MAX_GRADE.
// One-sided forward + backward sweep: each sweep is O(N) and only LOWERS
// points (caps upward climbs from either direction). For a closed loop this
// converges in ~5 passes regardless of the violating stretch length, because
// the propagation hops a whole step per sweep instead of accumulating by
// half-excess. The valleys stay put, the peaks get cut down — which also
// matches what real road engineering does (cuts and fills) and what we
// actually want visually: roads do not crest mountains, they go around them.
// Returns the largest residual |grade| for logging.
function clampGradeClosed(pts) {
  const N = pts.length;
  if (N < 2) return 0;
  const d = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    d[i] = Math.hypot(pts[j].x - pts[i].x, pts[j].z - pts[i].z);
  }
  for (let pass = 0; pass < GRADE_CLAMP_PASSES; pass++) {
    let modified = false;
    for (let k = 0; k < N; k++) {
      const i = k, j = (k + 1) % N;
      if (d[i] < 0.01) continue;
      const cap = pts[i].y + MAX_GRADE * d[i];
      if (pts[j].y > cap) { pts[j].y = cap; modified = true; }
    }
    for (let k = N - 1; k >= 0; k--) {
      const i = k, j = (k + 1) % N;
      if (d[i] < 0.01) continue;
      const cap = pts[j].y + MAX_GRADE * d[i];
      if (pts[i].y > cap) { pts[i].y = cap; modified = true; }
    }
    if (!modified) break;
  }
  let worst = 0;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    if (d[i] < 0.01) continue;
    const g = Math.abs(pts[j].y - pts[i].y) / d[i];
    if (g > worst) worst = g;
  }
  return worst;
}

export function buildLoopRoad({ seed, terrainHeightFn, isOnWater }) {
  const rng = mulberry32(seed);

  // 1. Pick waypoints around the ring.
  const waypoints = [];
  for (let i = 0; i < WAYPOINT_COUNT; i++) {
    waypoints.push(pickWaypoint(i, rng, terrainHeightFn, isOnWater));
  }

  // 2. A* between adjacent waypoints (wrapping at the end), accumulate raw polyline.
  const raw = [];
  let aStarFailures = 0;
  for (let i = 0; i < WAYPOINT_COUNT; i++) {
    const A = waypoints[i];
    const B = waypoints[(i + 1) % WAYPOINT_COUNT];
    // Long inter-waypoint pairs (~9 km for a 20 km radius / 14 waypoints) need
    // a generous detour buffer + cost ceiling: A* may need to skirt mountains
    // or lakes, racking up slope penalty. Without this most pairs fail.
    const path = findRoadPath(A, B, terrainHeightFn, isOnWater, {
      buffer: 4000,
      maxOverage: 12,
    });
    if (!path || path.length < 2) {
      aStarFailures++;
      // Fallback: just push the endpoints so the loop still closes.
      raw.push({ x: A.x, y: A.y, z: A.z });
      continue;
    }
    for (let j = 0; j < path.length - 1; j++) raw.push(path[j]);
  }

  // 3. Closed Catmull-Rom smoothing of the entire loop.
  const smoothed = catmullRomClosed(raw);

  // 3a. Iterative Laplacian XZ smoothing to round out tight corners that
  //     fall out of A*'s grid-aligned output. 6 passes of a 3-tap window;
  //     causes slight shrinkage but keeps the loop closed.
  laplacianSmoothXZClosed(smoothed, 6);

  // 4. Cap road grade at MAX_GRADE (8%). Treats the polyline as circular so
  //    the loop stays closed in Y. Then re-clamp above the water plane
  //    (clamping can push some points below if a long climb gets flattened).
  const worstGrade = clampGradeClosed(smoothed);
  for (const p of smoothed) if (p.y < 0.5) p.y = 0.5;

  // 5. Split into many small sub-edges for the spatial index. Each sub-edge
  //    shares an endpoint with its neighbours so the loop is a closed cycle.
  const M = smoothed.length;
  const numSub = Math.max(2, Math.ceil(M / SUB_EDGE_POINTS));
  const nodes = [];
  const edges = [];
  for (let i = 0; i < numSub; i++) {
    nodes.push({ id: i, x: 0, y: 0, z: 0, edges: [] });
  }
  for (let i = 0; i < numSub; i++) {
    const startIdx = Math.floor((i * M) / numSub);
    const endIdx = Math.floor(((i + 1) * M) / numSub);
    // Sub-edge polyline: points [startIdx .. endIdx], inclusive of the next
    // sub-edge's first point so adjacent sub-edges share a vertex.
    const polyline = [];
    for (let j = startIdx; j <= endIdx; j++) {
      polyline.push(smoothed[j % M]);
    }
    const nodeA = i;
    const nodeB = (i + 1) % numSub;
    nodes[nodeA].x = polyline[0].x; nodes[nodeA].y = polyline[0].y; nodes[nodeA].z = polyline[0].z;
    edges.push({ id: i, nodeA, nodeB, polyline, length: pathLen(polyline) });
  }
  for (const e of edges) {
    nodes[e.nodeA].edges.push(e.id);
    nodes[e.nodeB].edges.push(e.id);
  }

  // 6. Spawn at the node nearest origin; heading from the outgoing polyline's first segment.
  let spawnNode = nodes[0];
  let spawnDist = Math.hypot(spawnNode.x, spawnNode.z);
  for (const n of nodes) {
    const d = Math.hypot(n.x, n.z);
    if (d < spawnDist) { spawnDist = d; spawnNode = n; }
  }
  let headingY = 0;
  if (spawnNode.edges.length > 0) {
    const e = edges[spawnNode.edges[0]];
    const reverse = e.nodeB === spawnNode.id;
    const p0 = reverse ? e.polyline[e.polyline.length - 1] : e.polyline[0];
    const p1 = reverse ? e.polyline[e.polyline.length - 2] : e.polyline[1];
    headingY = Math.atan2(p1.x - p0.x, p1.z - p0.z);
  }

  if (typeof console !== 'undefined') {
    console.log('[loop] waypoints:', WAYPOINT_COUNT,
                'A* failures:', aStarFailures,
                'smoothed points:', smoothed.length,
                'sub-edges:', edges.length,
                'worst grade:', (worstGrade * 100).toFixed(2) + '%');
  }

  const spatialIndex = new SpatialIndex(edges, 200);
  return {
    nodes,
    edges,
    spawn: { x: spawnNode.x, y: spawnNode.y, z: spawnNode.z, headingY },
    spatialIndex,
  };
}
