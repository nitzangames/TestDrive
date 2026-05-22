// Ambient AI traffic. N cars drive forever around the closed road loop at
// fixed speeds in the right lane (offset perpendicular to the road's
// tangent direction). No collision response with the player, no overtake
// logic, no traffic-light AI — they're scenery that gives the world some
// motion.
//
// Implementation notes:
//   * We concatenate every sub-edge's polyline into ONE flat path with
//     cumulative arc-length, deduplicating each sub-edge's first point
//     (which is shared with the previous sub-edge's last).
//   * Each car holds an `s` (arc-length position) that wraps modulo the
//     loop length. Binary search lands the segment for sampling position
//     and tangent. O(log N) per car per frame.

import { buildCarModel } from '../car/model.js';

// Right-lane centre for a 14 m road (ROAD_HALF_WIDTH = 7). ROAD_HALF_WIDTH / 2.
const RIGHT_LANE_OFFSET = 3.5;
const DEFAULT_BODY_HEIGHT = 0.05;
// Wide speed band so the player overtakes slow cruisers AND gets overtaken
// by faster ones — generates lots of relative motion against the player so
// the world doesn't look frozen-relative-to-the-player.
const SPEED_BASE = 28;          // m/s (~100 km/h)
const SPEED_JITTER = 22;        // ±22 m/s → 6 to 50 m/s
// Approximate bounding sphere radius for player↔AI collision checks.
const CAR_COLLISION_RADIUS = 2.0;

const PALETTE = [
  0x4486ff,  // bright blue
  0x46d166,  // green
  0xefaa44,  // orange
  0xb466e6,  // purple
  0xf2dd66,  // mustard
  0x2a3242,  // dark steel
  0xe16868,  // salmon
];

export class AITraffic {
  constructor({ THREE, scene, graph, count = 6, rng = Math.random }) {
    this.THREE = THREE;
    this.scene = scene;

    // Concatenate all sub-edge polylines into one closed path. Each sub-edge
    // shares its first point with the previous sub-edge's last point, so we
    // skip index 0 on every sub-edge after the first.
    const path = [];
    for (let i = 0; i < graph.edges.length; i++) {
      const poly = graph.edges[i].polyline;
      const start = i === 0 ? 0 : 1;
      for (let j = start; j < poly.length; j++) {
        path.push(poly[j]);
      }
    }
    this.path = path;

    // Cumulative arc length. arc[i] is the distance from path[0] walking
    // forward to path[i].
    const arc = new Float64Array(path.length);
    arc[0] = 0;
    for (let i = 1; i < path.length; i++) {
      arc[i] = arc[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    }
    this.arc = arc;
    this.totalLength = arc[arc.length - 1] || 1;

    // Create N cars, distributed around the loop.
    this.cars = [];
    for (let i = 0; i < count; i++) {
      const bodyColor = PALETTE[i % PALETTE.length];
      const model = buildCarModel(THREE, { bodyColor });
      model.rotation.order = 'YXZ';
      scene.add(model);
      this.cars.push({
        model,
        s: (i / count) * this.totalLength,
        speed: SPEED_BASE + (rng() - 0.5) * 2 * SPEED_JITTER,
      });
    }
  }

  update(dt) {
    for (const c of this.cars) {
      c.s += c.speed * dt;
      while (c.s >= this.totalLength) c.s -= this.totalLength;
      while (c.s < 0) c.s += this.totalLength;
      const sample = this._sampleAt(c.s);
      // Lane offset: rotate tangent 90° clockwise (driver's right) and shift.
      const rx = sample.tz;
      const rz = -sample.tx;
      // Driver's right corresponds to negative `lateral` in the shared
      // convention. Banking lifts +lateral and lowers -lateral, so a car
      // in the right lane on a positive (right-turn) bank sits LOWER than
      // the centerline Y.
      const lateralSigned = -RIGHT_LANE_OFFSET;
      const bankedY = sample.y + lateralSigned * Math.tan(sample.bank);
      c.model.position.set(
        sample.x + rx * RIGHT_LANE_OFFSET,
        bankedY + DEFAULT_BODY_HEIGHT,
        sample.z + rz * RIGHT_LANE_OFFSET,
      );
      const heading = Math.atan2(sample.tx, sample.tz);
      c.model.rotation.y = heading + Math.PI;
      // Lean the body into the bank.
      c.model.rotation.z = sample.bank;
    }
  }

  // Push the player physics object away from any AI car that overlaps with
  // it, scrub some speed off, and slow the AI car it hit. Called once per
  // frame after both the player physics step and traffic.update have run.
  resolveCollisions(physics) {
    const pr = CAR_COLLISION_RADIUS;
    for (const c of this.cars) {
      const cp = c.model.position;
      const dx = physics.x - cp.x;
      const dz = physics.z - cp.z;
      const distSq = dx * dx + dz * dz;
      const minDist = pr * 2;
      if (distSq >= minDist * minDist) continue;
      const dist = Math.sqrt(distSq) || 0.01;
      const overlap = minDist - dist;
      const nx = dx / dist, nz = dz / dist;
      // Positional correction: push the player out along the contact normal.
      physics.x += nx * overlap;
      physics.z += nz * overlap;
      // Energy loss on impact.
      physics.speed *= 0.6;
      // Knock the AI car back along the road too (along its travel
      // direction) so it doesn't just sit inside the player.
      c.s -= overlap * 0.5;
      if (c.s < 0) c.s += this.totalLength;
    }
  }

  // Binary search the arc array for the segment containing s ∈ [0, total).
  _sampleAt(s) {
    const arc = this.arc;
    const path = this.path;
    let lo = 0, hi = arc.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arc[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    const i1 = lo;
    const i0 = Math.max(0, i1 - 1);
    const segA = arc[i0], segB = arc[i1];
    const t = segB > segA ? (s - segA) / (segB - segA) : 0;
    const pA = path[i0], pB = path[i1];
    const dx = pB.x - pA.x;
    const dz = pB.z - pA.z;
    const tlen = Math.hypot(dx, dz) || 1;
    const bankA = pA.bank || 0;
    const bankB = pB.bank || 0;
    return {
      x: pA.x + dx * t,
      y: pA.y + (pB.y - pA.y) * t,
      z: pA.z + dz * t,
      tx: dx / tlen,
      tz: dz / tlen,
      bank: bankA + (bankB - bankA) * t,
    };
  }
}
