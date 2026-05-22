// Re-exports queryRoadAt from the worker-safe shared module so main thread
// (collision queries, wheel pose sampling) and worker (chunk-build carve)
// share one implementation. Adds the car-physics-specific helpers that the
// shared module deliberately doesn't carry (so the worker doesn't import
// CAR_CONSTANTS / JUNCTION_RADIUS for no reason).
import { JUNCTION_RADIUS } from './geometry.js';
import { CAR_CONSTANTS } from '../car/physics.js';
import { queryRoadAt } from './shared.js';
import { ROAD_HALF_WIDTH, RAIL_OUTBOARD } from './shared.js';

export { queryRoadAt };

const OFF_GRAPH_THRESHOLD = 80;    // m
const IMPACT_SPEED_LOSS = 0.18;    // % shaved off the player's speed per rail clip

// Guardrail collision. Clamps the car's lateral position to the inside of
// the steel rails (= ROAD_HALF_WIDTH + RAIL_OUTBOARD on each side, minus
// the car's half width so the body doesn't poke through), projects the
// velocity onto the road tangent (killing the lateral component — the car
// slides along the rail instead of bouncing 90° back into the road), and
// scrubs IMPACT_SPEED_LOSS off the speed. Mutates `car` directly.
export function resolveCarRoadCollision(graph, car) {
  const q = queryRoadAt(graph, car.x, car.z);
  if (!q) return { collided: false, offGraph: true };

  const limit = ROAD_HALF_WIDTH + RAIL_OUTBOARD - CAR_CONSTANTS.CAR_HALF_WIDTH;
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
