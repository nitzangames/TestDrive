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
// Enforce a minimum turn radius on a closed polyline. For each point with
// local curvature > 1/minRadius, push it toward the midpoint of its
// neighbours by an amount proportional to how far over the limit it is.
// Iterates until either all points are within the limit or maxIters runs
// out. Reports the worst residual curvature so we can see whether the
// constraint actually holds.
//
// Curvature is computed via the Menger formula κ = 2|sin α| / |chord| where
// α is the turning angle and chord = |prev → next|.
function enforceMinTurnRadius(pts, minRadius, maxIters) {
  const N = pts.length;
  if (N < 3) return 0;
  const limitK = 1 / minRadius;
  const dx = new Float64Array(N);
  const dz = new Float64Array(N);
  let worst = 0;
  for (let iter = 0; iter < maxIters; iter++) {
    worst = 0;
    let anyOver = false;
    for (let i = 0; i < N; i++) {
      const prev = pts[(i - 1 + N) % N];
      const curr = pts[i];
      const next = pts[(i + 1) % N];
      const ax = curr.x - prev.x, az = curr.z - prev.z;
      const bx = next.x - curr.x, bz = next.z - curr.z;
      const aLen = Math.hypot(ax, az);
      const bLen = Math.hypot(bx, bz);
      const cLen = Math.hypot(next.x - prev.x, next.z - prev.z);
      if (aLen < 0.01 || bLen < 0.01 || cLen < 0.01) { dx[i] = 0; dz[i] = 0; continue; }
      const cross = ax * bz - az * bx;
      const sinA = cross / (aLen * bLen);
      const K = 2 * Math.abs(sinA) / cLen;
      if (K > worst) worst = K;
      if (K > limitK) {
        anyOver = true;
        // How aggressively to push toward the chord midpoint. Capped at
        // 0.3 per pass so the loop doesn't collapse on a single iteration.
        const factor = Math.min(0.3, (K / limitK - 1) * 0.15);
        const midX = (prev.x + next.x) * 0.5;
        const midZ = (prev.z + next.z) * 0.5;
        dx[i] = (midX - curr.x) * factor;
        dz[i] = (midZ - curr.z) * factor;
      } else {
        dx[i] = 0; dz[i] = 0;
      }
    }
    if (!anyOver) break;
    for (let i = 0; i < N; i++) { pts[i].x += dx[i]; pts[i].z += dz[i]; }
  }
  return worst;
}

// Compute signed local curvature at each polyline point (positive for LEFT
// turns, negative for RIGHT), convert to a banking angle (radians), and
// smooth the bank signal so transitions in/out of corners are gradual.
// Lateral convention: in pointSegment, lateral > 0 is the LEFT of the
// tangent direction. For a banked road we want the OUTSIDE of the curve
// raised — for a RIGHT turn that's the LEFT side (lateral > 0) → bank > 0
// with the formula bankedY = roadY + lateral * tan(bank).
//
// BANK_FACTOR maps curvature (1/radius) to bank radians. A 150 m radius
// curve gets ~5.7° of bank; a 100 m radius gets ~8.6° but caps at
// MAX_BANK to stop hairpins from becoming wall-of-death banking.
function computeBankAngles(pts, factor = 12, maxBank = 0.13 /* ~7.5° */) {
  const N = pts.length;
  const banks = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const prev = pts[(i - 1 + N) % N];
    const curr = pts[i];
    const next = pts[(i + 1) % N];
    const ux = curr.x - prev.x, uz = curr.z - prev.z;
    const vx = next.x - curr.x, vz = next.z - curr.z;
    const uLen = Math.hypot(ux, uz);
    const vLen = Math.hypot(vx, vz);
    if (uLen < 0.01 || vLen < 0.01) continue;
    const cross = ux * vz - uz * vx;   // <0 for right turns under our XZ convention
    const dot = ux * vx + uz * vz;
    const turnAngle = Math.atan2(cross, dot);   // signed
    const arc = (uLen + vLen) * 0.5;
    const kSigned = turnAngle / arc;
    // For a right turn kSigned < 0, we want bank > 0 (raise the LEFT
    // outside-of-curve side). Sign flip:
    let bank = -kSigned * factor;
    if (bank > maxBank) bank = maxBank;
    if (bank < -maxBank) bank = -maxBank;
    banks[i] = bank;
  }
  // Smooth banking so transitions are not a hard step at each corner.
  // 30 passes of weighted 3-tap gives a long, gentle ramp-up.
  const sb = new Float64Array(N);
  for (let p = 0; p < 30; p++) {
    for (let i = 0; i < N; i++) {
      sb[i] = (banks[(i - 1 + N) % N] + banks[i] * 2 + banks[(i + 1) % N]) * 0.25;
    }
    for (let i = 0; i < N; i++) banks[i] = sb[i];
  }
  return banks;
}

// Measure the tightest turn radius along a closed polyline. Uses a wider
// stencil than adjacent points so local point-distribution noise doesn't
// dominate — for each i, compute Menger curvature of (P[i-step], P[i],
// P[i+step]) where step ≈ 5 m of arc.
function measureWorstTurnRadius(pts) {
  const N = pts.length;
  if (N < 5) return Infinity;
  // Estimate spacing from first segment.
  const spacing = Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z) || 1;
  const step = Math.max(1, Math.round(5 / spacing));
  let worstK = 0;
  for (let i = 0; i < N; i++) {
    const a = pts[(i - step + N) % N];
    const b = pts[i];
    const c = pts[(i + step) % N];
    const ux = b.x - a.x, uz = b.z - a.z;
    const vx = c.x - b.x, vz = c.z - b.z;
    const uLen = Math.hypot(ux, uz);
    const vLen = Math.hypot(vx, vz);
    const chord = Math.hypot(c.x - a.x, c.z - a.z);
    if (uLen < 0.01 || vLen < 0.01 || chord < 0.01) continue;
    const sinAng = Math.abs(ux * vz - uz * vx) / (uLen * vLen);
    const K = 2 * sinAng / chord;
    if (K > worstK) worstK = K;
  }
  return worstK > 0 ? 1 / worstK : Infinity;
}

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

// Same 3-tap Laplacian as above but on the Y profile only. Run AFTER the
// grade clamp to soften the piecewise-linear slope changes that the clamp
// leaves behind (those tiny slope discontinuities are what the wheels feel
// as a bounce when crossing them). It's a low-pass filter so it can only
// reduce slopes; the 8% grade cap stays valid without re-running the clamp.
function laplacianSmoothYClosed(pts, passes) {
  const N = pts.length;
  const sy = new Float64Array(N);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < N; i++) {
      const prev = pts[(i - 1 + N) % N];
      const next = pts[(i + 1) % N];
      sy[i] = (prev.y + pts[i].y * 2 + next.y) * 0.25;
    }
    for (let i = 0; i < N; i++) pts[i].y = sy[i];
  }
}

// Walk the closed polyline by arc-length and emit points at uniform
// intervals. Used to undo Catmull-Rom's oversampling near sharp A* corners
// (8 t-samples between two close control points end up clustered in arc
// length, which makes the chord-based curvature formula explode at those
// points). Resampling at ~4 m spacing gives the curvature-limiter a fair
// chance and also makes downstream segment lengths predictable.
function resampleClosedByArc(pts, targetSpacing) {
  const N = pts.length;
  if (N < 3) return pts.slice();
  // Cumulative arc length around the loop. arc[N] = total loop length.
  const arc = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    arc[i + 1] = arc[i] + Math.hypot(pts[j].x - pts[i].x, pts[j].z - pts[i].z);
  }
  const total = arc[N];
  const count = Math.max(8, Math.round(total / targetSpacing));
  const step = total / count;
  const out = new Array(count);
  let i = 0;
  for (let k = 0; k < count; k++) {
    const s = k * step;
    while (arc[i + 1] < s && i < N - 1) i++;
    const a = arc[i], b = arc[i + 1];
    const t = b > a ? (s - a) / (b - a) : 0;
    const pa = pts[i];
    const pb = pts[(i + 1) % N];
    out[k] = {
      x: pa.x + (pb.x - pa.x) * t,
      y: pa.y + (pb.y - pa.y) * t,
      z: pa.z + (pb.z - pa.z) * t,
    };
  }
  return out;
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

  // 3pre. Subsample the raw A* output before Catmull-Rom so the spline
  //       interpolates through sparser control points (~600 m apart). A*
  //       at 100 m grid can produce sharp 90° corners over one cell;
  //       keeping every 6th point and letting Catmull-Rom span the gaps
  //       smooths those out at the source instead of trying to patch the
  //       resulting curve after the fact. Always include the endpoint
  //       (which is the next waypoint).
  const SUBSAMPLE = 10;
  const sparse = [];
  for (let i = 0; i < raw.length; i += SUBSAMPLE) sparse.push(raw[i]);
  // Make sure we don't drop the last raw point (often the next waypoint).
  if (raw.length > 0 && (raw.length - 1) % SUBSAMPLE !== 0) sparse.push(raw[raw.length - 1]);

  // 3. Closed Catmull-Rom smoothing of the sparse control points.
  let smoothed = catmullRomClosed(sparse);

  // 3a. Catmull-Rom oversamples in arc length near sharp A* corners (its
  //     8 t-samples cluster between two close control points). Resample
  //     to uniform ~4 m spacing so downstream smoothing operates on an
  //     evenly-distributed polyline.
  smoothed = resampleClosedByArc(smoothed, 4);

  // 3b. Heavy Laplacian smoothing. With uniform spacing each pass is a
  //     clean low-pass filter on the curve. 80 passes shrinks the loop a
  //     few percent and washes out tight A* corners into long sweeping
  //     arcs that the car can navigate at MAX_SPEED with comfortable
  //     steering input.
  laplacianSmoothXZClosed(smoothed, 60);

  // 3c. One more resample — Laplacian on a closed curve gently compresses
  //     points around tight bends; resampling redistributes them so the
  //     downstream sub-edge split has uniform sub-edge lengths and the
  //     chord-based curvature measurement is honest.
  smoothed = resampleClosedByArc(smoothed, 4);

  // 3d. Compute per-point bank angles from local curvature, smooth them
  //     so the transition into/out of a corner is gradual, and attach to
  //     each polyline point. The chunk worker and the wheel-pose sampler
  //     both consult `bank` via queryRoadAt.
  const banks = computeBankAngles(smoothed);
  for (let i = 0; i < smoothed.length; i++) smoothed[i].bank = banks[i];

  // 3e. Measure the worst residual turn radius for logging.
  const worstR = measureWorstTurnRadius(smoothed);

  // 4. Cap road grade at MAX_GRADE (8%). Treats the polyline as circular so
  //    the loop stays closed in Y.
  const worstGrade = clampGradeClosed(smoothed);

  // 4a. Smooth the Y profile to soften the piecewise-linear slope changes
  //     the grade clamp leaves behind. Low-pass only — slopes are reduced
  //     never increased — so the 8% cap stays satisfied without re-running
  //     the clamp. This is what kills the bouncing-over-tiny-kinks feel.
  laplacianSmoothYClosed(smoothed, 12);

  // Re-clamp above water (smoothing can drag some points below).
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
  let spawnX = spawnNode.x;
  let spawnZ = spawnNode.z;
  if (spawnNode.edges.length > 0) {
    const e = edges[spawnNode.edges[0]];
    const reverse = e.nodeB === spawnNode.id;
    const p0 = reverse ? e.polyline[e.polyline.length - 1] : e.polyline[0];
    const p1 = reverse ? e.polyline[e.polyline.length - 2] : e.polyline[1];
    headingY = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    // US-style: drive on the right. Offset the spawn point 3.5 m to the
    // driver's right of the polyline forward direction so the player
    // starts in the right lane. Driver's-right perpendicular for a
    // tangent (tx, tz) is (-tz, tx) (matches ai-traffic.js).
    const tx = p1.x - p0.x, tz = p1.z - p0.z;
    const tl = Math.hypot(tx, tz) || 1;
    const rx = -tz / tl;
    const rz =  tx / tl;
    const LANE_OFFSET = 3.5;
    spawnX += rx * LANE_OFFSET;
    spawnZ += rz * LANE_OFFSET;
  }

  if (typeof console !== 'undefined') {
    console.log('[loop] waypoints:', WAYPOINT_COUNT,
                'A* failures:', aStarFailures,
                'smoothed points:', smoothed.length,
                'sub-edges:', edges.length,
                'worst grade:', (worstGrade * 100).toFixed(2) + '%',
                'tightest turn radius:', worstR === Infinity ? '∞' : worstR.toFixed(1) + 'm');
  }

  const spatialIndex = new SpatialIndex(edges, 200);
  return {
    nodes,
    edges,
    spawn: { x: spawnX, y: spawnNode.y, z: spawnZ, headingY },
    spatialIndex,
  };
}
