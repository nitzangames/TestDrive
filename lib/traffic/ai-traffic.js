// Pool-based ambient AI traffic that spawns near the player rather than
// being distributed around the entire loop. ~30 cars are visible at any
// time; the rest sit in a reuse pool. Cars come in two flavours:
//   * "with" the player (~55%) — same direction along the polyline, right
//     lane (driver's right of polyline forward direction).
//   * "against" the player (~45%) — opposite direction along the polyline,
//     opposing lane (driver's right of polyline BACKWARD direction =
//     driver's left of forward). Player sees them as oncoming traffic.
//
// When a car drifts more than RECYCLE_BEHIND_DIST behind the player OR more
// than RECYCLE_AHEAD_DIST ahead, it goes back into the pool. The pool is
// then drained to maintain ACTIVE_TARGET active cars at all times, each
// spawned within SPAWN_MIN/MAX_DIST of the player.
//
// Player's position along the loop is found via a small-window nearest-path-
// point search (cached previous index), with a full-scan fallback for
// teleports.

import { buildCarModel } from '../car/model.js';

const RIGHT_LANE_OFFSET = 3.5;     // m from centerline (= ROAD_HALF_WIDTH / 2)
const DEFAULT_BODY_HEIGHT = 0.05;

const SPEED_BASE   = 28;           // m/s ≈ 100 km/h
const SPEED_JITTER = 20;           // ±20 → 8 to 48 m/s

const CAR_COLLISION_RADIUS = 2.0;

// Spawn / recycle distances are arc-length, signed in the PLAYER's forward
// direction along the polyline (+ = ahead of the player).
const SPAWN_MIN_AHEAD =  60;       // m — never spawn right on top of player
const SPAWN_MAX_AHEAD = 500;       // m
const SPAWN_BEHIND    = -150;      // m — same-direction cars can spawn behind so the player overtakes them
const RECYCLE_AHEAD   = 800;       // m past spawn range → recycle
const RECYCLE_BEHIND  = -250;      // m behind player → recycle

const POOL_SIZE       = 50;
const ACTIVE_TARGET   = 32;
const SAME_DIR_RATIO  = 0.55;

const PALETTE = [
  0x4486ff, 0x46d166, 0xefaa44, 0xb466e6, 0xf2dd66,
  0x2a3242, 0xe16868, 0xffd166, 0x8ecae6, 0xb56576,
];

export class AITraffic {
  constructor({ THREE, scene, graph, rng = Math.random }) {
    this.THREE = THREE;
    this.scene = scene;
    this.rng = rng;

    // Concatenate every sub-edge's polyline (with deduplicated shared
    // endpoints) into one closed path with cumulative arc length.
    const path = [];
    for (let i = 0; i < graph.edges.length; i++) {
      const poly = graph.edges[i].polyline;
      const start = i === 0 ? 0 : 1;
      for (let j = start; j < poly.length; j++) path.push(poly[j]);
    }
    this.path = path;
    const arc = new Float64Array(path.length);
    for (let i = 1; i < path.length; i++) {
      arc[i] = arc[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    }
    this.arc = arc;
    this.totalLength = arc[arc.length - 1] || 1;

    // Pre-build the pool. All models start hidden in the scene; spawn
    // toggles visible. No per-spawn allocation.
    this.pool = [];
    this.active = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const model = buildCarModel(THREE, { bodyColor: PALETTE[i % PALETTE.length] });
      model.rotation.order = 'YXZ';
      model.visible = false;
      scene.add(model);
      this.pool.push(model);
    }

    this._prevPlayerIdx = 0;
    this.playerS = 0;
    this.playerDirSign = +1;
  }

  update(dt, physics) {
    this._updatePlayerPose(physics);

    // 1. Recycle cars that have wandered out of range.
    for (let i = this.active.length - 1; i >= 0; i--) {
      const c = this.active[i];
      const delta = this._signedDistFromPlayer(c.s);
      if (delta < RECYCLE_BEHIND || delta > RECYCLE_AHEAD) {
        c.model.visible = false;
        this.pool.push(c.model);
        this.active.splice(i, 1);
      }
    }

    // 2. Spawn new cars near the player until we hit ACTIVE_TARGET.
    while (this.active.length < ACTIVE_TARGET && this.pool.length > 0) {
      const model = this.pool.pop();
      const sameDir = this.rng() < SAME_DIR_RATIO;
      const direction = sameDir ? this.playerDirSign : -this.playerDirSign;
      // Same-direction cars can spawn either ahead or behind the player.
      // Opposing cars only spawn ahead (otherwise they'd vanish behind
      // immediately).
      const lo = sameDir ? SPAWN_BEHIND : SPAWN_MIN_AHEAD;
      const hi = SPAWN_MAX_AHEAD;
      const delta = lo + this.rng() * (hi - lo);
      // Convert signed-from-player delta to absolute s.
      let spawnS = this.playerS + this.playerDirSign * delta;
      spawnS = ((spawnS % this.totalLength) + this.totalLength) % this.totalLength;
      model.visible = true;
      this.active.push({
        model,
        s: spawnS,
        speed: SPEED_BASE + (this.rng() - 0.5) * 2 * SPEED_JITTER,
        direction,
      });
    }

    // 3. Advance each active car and place its model.
    for (const c of this.active) {
      c.s += c.speed * c.direction * dt;
      while (c.s >= this.totalLength) c.s -= this.totalLength;
      while (c.s < 0)                 c.s += this.totalLength;
      this._placeCar(c);
    }
  }

  resolveCollisions(physics) {
    const pr = CAR_COLLISION_RADIUS;
    for (const c of this.active) {
      const cp = c.model.position;
      const dx = physics.x - cp.x;
      const dz = physics.z - cp.z;
      const distSq = dx * dx + dz * dz;
      const minDist = pr * 2;
      if (distSq >= minDist * minDist) continue;
      const dist = Math.sqrt(distSq) || 0.01;
      const overlap = minDist - dist;
      const nx = dx / dist, nz = dz / dist;
      physics.x += nx * overlap;
      physics.z += nz * overlap;
      physics.speed *= 0.6;
      c.s -= overlap * 0.5 * c.direction;
    }
  }

  // --- internals ------------------------------------------------------------
  _updatePlayerPose(physics) {
    // Cached small-window nearest-path-point search. Falls back to full scan
    // if the cached window doesn't contain a close-enough point (the player
    // has teleported, the loop generator changed, etc.).
    const path = this.path;
    const N = path.length;
    let bestI = this._prevPlayerIdx;
    let bestDistSq = Infinity;
    const WINDOW = 250;
    const lo = ((this._prevPlayerIdx - WINDOW) + N) % N;
    for (let k = 0; k < WINDOW * 2; k++) {
      const i = (lo + k) % N;
      const dx = path[i].x - physics.x;
      const dz = path[i].z - physics.z;
      const d = dx * dx + dz * dz;
      if (d < bestDistSq) { bestDistSq = d; bestI = i; }
    }
    if (bestDistSq > 40000) { // 200 m — likely teleport, do a full scan
      bestDistSq = Infinity;
      for (let i = 0; i < N; i++) {
        const dx = path[i].x - physics.x;
        const dz = path[i].z - physics.z;
        const d = dx * dx + dz * dz;
        if (d < bestDistSq) { bestDistSq = d; bestI = i; }
      }
    }
    this._prevPlayerIdx = bestI;
    this.playerS = this.arc[bestI];
    // Determine which way the player is going along the polyline.
    const j = (bestI + 1) % N;
    const tx = path[j].x - path[bestI].x;
    const tz = path[j].z - path[bestI].z;
    const vx = Math.sin(physics.headingY);
    const vz = Math.cos(physics.headingY);
    this.playerDirSign = (vx * tx + vz * tz) >= 0 ? +1 : -1;
  }

  // Signed arc-length distance from player to point at arc s, in the
  // player's forward direction. + = ahead, − = behind. Wraps around the loop.
  _signedDistFromPlayer(s) {
    let d = (s - this.playerS) * this.playerDirSign;
    const half = this.totalLength * 0.5;
    while (d >  half) d -= this.totalLength;
    while (d < -half) d += this.totalLength;
    return d;
  }

  _placeCar(c) {
    const sample = this._sampleAt(c.s);
    // rx, rz = perpendicular along driver's right of polyline FORWARD
    // direction. For an opposing car (direction = -1), "their" right is the
    // mirrored world direction, so the world offset is sign-flipped.
    const rx = sample.tz, rz = -sample.tx;
    const sign = c.direction;
    // Signed lateral (under shared.js convention: lateral > 0 = LEFT of
    // polyline tangent). Forward cars on driver's right → lateral < 0.
    const lateralSigned = -RIGHT_LANE_OFFSET * sign;
    const bankedY = sample.y + lateralSigned * Math.tan(sample.bank);
    c.model.position.set(
      sample.x + rx * RIGHT_LANE_OFFSET * sign,
      bankedY + DEFAULT_BODY_HEIGHT,
      sample.z + rz * RIGHT_LANE_OFFSET * sign,
    );
    const heading = Math.atan2(sign * sample.tx, sign * sample.tz);
    c.model.rotation.y = heading + Math.PI;
    // Body lean. For a forward car, rotation.z = +bank tilts toward
    // driver's right (= inside of a right turn) — see the derivation in
    // shared.js. For an opposing car running through the same physical
    // curve, that same physical right turn is a LEFT turn for them, so
    // the lean direction flips: rotation.z = -bank.
    c.model.rotation.z = sample.bank * sign;
  }

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
