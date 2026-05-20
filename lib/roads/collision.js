import { ROAD_HALF_WIDTH, ROAD_OFFSET_Y, JUNCTION_RADIUS } from './geometry.js';
import { CAR_CONSTANTS } from '../car/physics.js';

const SEARCH_RADIUS = 30;          // m — how far to look for candidate edges
const OFF_GRAPH_THRESHOLD = 30;    // m
const IMPACT_SPEED_LOSS = 0.12;    // 12% per impact

// Returns the nearest road segment to (x, z) or null.
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
  // Interpolate road surface Y between the two polyline endpoints of the
  // nearest segment, then lift by ROAD_OFFSET_Y so callers get the actual
  // top surface of the road mesh (matches geometry.js buildRoadRibbon).
  const e = graph.edges[best.edgeId];
  const pA = e.polyline[best.segIndex];
  const pB = e.polyline[best.segIndex + 1];
  const roadY = pA.y + (pB.y - pA.y) * best.t + ROAD_OFFSET_Y;
  return { edgeId: best.edgeId, segIndex: best.segIndex,
           lateralOffset: best.lateral, forwardT: best.t,
           segTangentX: best.tx, segTangentZ: best.tz, dist: d, roadY };
}

// Checks for and resolves a guardrail clamp. Mutates `car` (clamps position
// and adjusts velocity). `nearJunction` is true when the car is inside any
// degree-≥3 node's JUNCTION_RADIUS.
export function resolveCarRoadCollision(graph, car, nearJunction) {
  const q = queryRoadAt(graph, car.x, car.z);
  if (!q) return { collided: false, offGraph: true };
  if (nearJunction) return { collided: false, offGraph: false };

  const limit = ROAD_HALF_WIDTH - CAR_CONSTANTS.CAR_HALF_WIDTH;
  const lat = q.lateralOffset;
  if (Math.abs(lat) <= limit) return { collided: false, offGraph: false };

  // Clamp lateral position. Compute corrected (x, z).
  const e = graph.edges[q.edgeId];
  const a = e.polyline[q.segIndex], b = e.polyline[q.segIndex + 1];
  const sx = a.x + (b.x - a.x) * q.forwardT;
  const sz = a.z + (b.z - a.z) * q.forwardT;
  const nx = -q.segTangentZ, nz = q.segTangentX; // left normal
  const clamped = Math.sign(lat) * limit;
  car.x = sx + nx * clamped;
  car.z = sz + nz * clamped;

  // Project velocity onto tangent (kill lateral component) and apply speed loss.
  const tx = q.segTangentX, tz = q.segTangentZ;
  let vx = Math.sin(car.headingY) * car.speed;
  let vz = Math.cos(car.headingY) * car.speed;
  const vt = vx * tx + vz * tz;
  vx = tx * vt;
  vz = tz * vt;
  car.speed = Math.hypot(vx, vz) * (1 - IMPACT_SPEED_LOSS);
  car.headingY = Math.atan2(vx, vz);

  return { collided: true, offGraph: false };
}

export function isCarOffGraph(graph, car) {
  const q = queryRoadAt(graph, car.x, car.z);
  return !q || q.dist > OFF_GRAPH_THRESHOLD;
}

export function isCarNearAnyJunction(graph, car) {
  const radSq = JUNCTION_RADIUS * JUNCTION_RADIUS;
  for (const n of graph.nodes) {
    if (n.edges.length < 3) continue;
    const dx = n.x - car.x, dz = n.z - car.z;
    if (dx * dx + dz * dz < radSq) return true;
  }
  return false;
}

// Computes (signed-lateral-offset, parametric-t-along-AB, tangent unit) for
// the perpendicular foot of P on segment AB. Lateral sign convention: + is
// the "left" of segment direction in XZ.
function pointSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const lSq = dx * dx + dz * dz;
  let t = lSq > 0 ? ((px - ax) * dx + (pz - az) * dz) / lSq : 0;
  t = Math.max(0, Math.min(1, t));
  const fx = ax + dx * t, fz = az + dz * t;
  const ex = px - fx, ez = pz - fz;
  const distSq = ex * ex + ez * ez;
  const len = Math.sqrt(lSq) || 1;
  const tx = dx / len, tz = dz / len;
  // Lateral sign: cross product (tangent × offset) z-component, in XZ plane
  // i.e. tx * ez - tz * ex. Positive when offset is to the left of tangent.
  const lateral = (tx * ez - tz * ex);
  return { distSq, t, tx, tz, lateral };
}
