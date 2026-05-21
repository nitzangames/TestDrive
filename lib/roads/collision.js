// Re-exports queryRoadAt from the worker-safe shared module so main thread
// (collision queries, wheel pose sampling) and worker (chunk-build carve)
// share one implementation. Adds the car-physics-specific helpers that the
// shared module deliberately doesn't carry (so the worker doesn't import
// CAR_CONSTANTS / JUNCTION_RADIUS for no reason).
import { JUNCTION_RADIUS } from './geometry.js';
import { CAR_CONSTANTS } from '../car/physics.js';
import { queryRoadAt } from './shared.js';
import { ROAD_HALF_WIDTH } from './shared.js';

export { queryRoadAt };

const OFF_GRAPH_THRESHOLD = 80;    // m
const IMPACT_SPEED_LOSS = 0.12;    // 12% per impact

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

  const e = graph.edges[q.edgeId];
  const a = e.polyline[q.segIndex], b = e.polyline[q.segIndex + 1];
  const sx = a.x + (b.x - a.x) * q.forwardT;
  const sz = a.z + (b.z - a.z) * q.forwardT;
  const nx = -q.segTangentZ, nz = q.segTangentX;
  const clamped = Math.sign(lat) * limit;
  car.x = sx + nx * clamped;
  car.z = sz + nz * clamped;

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
