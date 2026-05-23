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

// Car-car following. When a car is within FOLLOW_DISTANCE behind another
// car in the same lane / same direction, it caps its speed to the leader's
// effective speed (with a tiny gap factor). Eased over time via FOLLOW_LERP
// so cars decelerate smoothly instead of snapping to leader speed.
const FOLLOW_DISTANCE = 25;        // m gap at which following kicks in
const FOLLOW_LERP     = 0.08;

// Sphere approximation of the 1.8 × 4.0 m car footprint. A real car is much
// longer than it is wide, but a tight sphere is fine for arcade collision
// — picks up real side-swipes without firing on near-misses in the next
// lane (which would be ~7 m away centre-to-centre).
const CAR_COLLISION_RADIUS = 1.0;

// Spawn / recycle distances are arc-length, signed in the PLAYER's forward
// direction along the polyline (+ = ahead of the player). Same-direction
// cars get TWO valid ranges (well ahead OR well behind, never in the
// immediate "surprise" zone around the player). Opposing cars only spawn
// well ahead, far enough that the ~90 m/s closing speed still gives the
// player ~4 s to react.
const SAMEDIR_AHEAD_MIN   =  150;
const SAMEDIR_AHEAD_MAX   =  550;
const SAMEDIR_BEHIND_MIN  = -350;
const SAMEDIR_BEHIND_MAX  = -120;
const SAMEDIR_BEHIND_PROB =  0.4;  // fraction of same-direction spawns that go behind
const OPPOSING_MIN        =  400;
const OPPOSING_MAX        =  800;
// Minimum arc-length spacing between cars in the same lane/direction at
// spawn time, to avoid two cars materialising on top of each other.
const MIN_SPACING_SAMEDIR  = 80;
const MIN_SPACING_OPPOSING = 110;
const SPAWN_MAX_ATTEMPTS   = 8;
const RECYCLE_AHEAD       = 1000;
const RECYCLE_BEHIND      = -400;

const POOL_SIZE       = 36;
const ACTIVE_TARGET   = 22;
// Lower → more oncoming, less same-direction. 0.35 means ~35% of new
// spawns drive the same way as the player, ~65% are oncoming.
const SAME_DIR_RATIO  = 0.35;

// How long to wait after construction before the FIRST car spawns. Gives
// the player a moment to orient themselves on the empty road. Set via
// `arm()` from the controller.
const DEFAULT_ARM_DELAY = 2.0;     // s

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

    // Spawn-arming. Until `arm()` is called and the timer elapses, no new
    // cars are added — gives the player a clean road to settle into.
    this._armedAt = Infinity;
    this._armDelay = DEFAULT_ARM_DELAY;
    this._elapsed = 0;

    // Crash callback set from outside. Fires once on first player↔AI contact.
    this.onCrash = null;
    this._crashed = false;
  }

  arm(delay = DEFAULT_ARM_DELAY) {
    this._armedAt = this._elapsed;
    this._armDelay = delay;
  }

  // Recycle every active car, clear the crashed flag, and re-arm with the
  // default empty-road delay. Used by the game-over restart path so the
  // player respawns in a clean piece of road.
  reset() {
    for (const c of this.active) {
      c.model.visible = false;
      this.pool.push(c.model);
    }
    this.active.length = 0;
    this._crashed = false;
    this.arm();
  }

  update(dt, physics) {
    this._elapsed += dt;
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

    // 2. Spawn new cars near the player until we hit ACTIVE_TARGET. Skip
    //    entirely until armed and the arm-delay has elapsed. Each spawn
    //    candidate gets a spacing check against existing cars in the same
    //    lane / direction; if no valid slot is found after SPAWN_MAX_ATTEMPTS
    //    we bail and try again next frame.
    const armed = this._elapsed >= this._armedAt + this._armDelay;
    while (armed && this.active.length < ACTIVE_TARGET && this.pool.length > 0) {
      const sameDir = this.rng() < SAME_DIR_RATIO;
      const direction = sameDir ? this.playerDirSign : -this.playerDirSign;
      const minSpacing = sameDir ? MIN_SPACING_SAMEDIR : MIN_SPACING_OPPOSING;
      const half = this.totalLength * 0.5;

      let spawnS = null;
      for (let att = 0; att < SPAWN_MAX_ATTEMPTS; att++) {
        let delta;
        if (sameDir) {
          if (this.rng() < SAMEDIR_BEHIND_PROB) {
            delta = SAMEDIR_BEHIND_MIN + this.rng() * (SAMEDIR_BEHIND_MAX - SAMEDIR_BEHIND_MIN);
          } else {
            delta = SAMEDIR_AHEAD_MIN  + this.rng() * (SAMEDIR_AHEAD_MAX  - SAMEDIR_AHEAD_MIN);
          }
        } else {
          delta = OPPOSING_MIN + this.rng() * (OPPOSING_MAX - OPPOSING_MIN);
        }
        let candidate = this.playerS + this.playerDirSign * delta;
        candidate = ((candidate % this.totalLength) + this.totalLength) % this.totalLength;
        // Spacing check against existing same-direction cars.
        let tooClose = false;
        for (const c of this.active) {
          if (c.direction !== direction) continue;
          let d = c.s - candidate;
          while (d >  half) d -= this.totalLength;
          while (d < -half) d += this.totalLength;
          if (Math.abs(d) < minSpacing) { tooClose = true; break; }
        }
        if (!tooClose) { spawnS = candidate; break; }
      }
      // Couldn't place this car cleanly; pause spawning until next frame.
      if (spawnS === null) break;

      const model = this.pool.pop();
      model.visible = true;
      const targetSpeed = SPEED_BASE + (this.rng() - 0.5) * 2 * SPEED_JITTER;
      this.active.push({
        model,
        s: spawnS,
        targetSpeed,
        speed: targetSpeed,
        direction,
      });
    }

    // 3. Car-car following: each car caps its speed to the leader's speed
    //    when the leader is within FOLLOW_DISTANCE ahead, eased via
    //    FOLLOW_LERP. Outside of follow range, ease back toward targetSpeed.
    this._applyCarFollowing(dt);

    // 4. Advance each active car and place its model.
    for (const c of this.active) {
      c.s += c.speed * c.direction * dt;
      while (c.s >= this.totalLength) c.s -= this.totalLength;
      while (c.s < 0)                 c.s += this.totalLength;
      this._placeCar(c);
    }
  }

  _applyCarFollowing(dt) {
    const half = this.totalLength * 0.5;
    for (let i = 0; i < this.active.length; i++) {
      const a = this.active[i];
      let cap = a.targetSpeed;
      let bestDelta = Infinity;
      for (let j = 0; j < this.active.length; j++) {
        if (j === i) continue;
        const b = this.active[j];
        if (b.direction !== a.direction) continue;
        // Signed forward distance in a's travel direction.
        let delta = (b.s - a.s) * a.direction;
        if (delta >  half) delta -= this.totalLength;
        if (delta < -half) delta += this.totalLength;
        if (delta > 0 && delta < bestDelta) {
          bestDelta = delta;
          if (delta < FOLLOW_DISTANCE) {
            // Cap to leader's effective speed; slight gap factor so the
            // follower doesn't asymptote to the same speed and clip.
            cap = Math.min(cap, b.speed * 0.95);
          }
        }
      }
      // Smoothly slide current speed toward the cap.
      a.speed += (cap - a.speed) * FOLLOW_LERP;
    }
  }

  resolveCollisions(physics) {
    if (this._crashed) return;
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
      // First contact is a crash. Push out so visuals don't clip, kill the
      // player's forward motion, and tell the controller. Don't fire again.
      physics.x += nx * overlap;
      physics.z += nz * overlap;
      const impactSpeed = physics.speed;
      physics.speed = 0;
      this._crashed = true;
      if (this.onCrash) this.onCrash(impactSpeed);
      break;
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
    // (rx, rz) is the driver's-right perpendicular of polyline forward
    // direction, verified empirically by viewing the chase-camera output.
    // For an opposing car (direction = -1) we mirror to the other side
    // of the road via the `sign` multiplier so oncoming traffic ends up
    // in the LEFT lane from the player's perspective.
    const rx = -sample.tz, rz = sample.tx;
    const sign = c.direction;
    // lateral sign convention (from pointSegment): for a point offset by
    // (rx, rz) (= driver's right), lateral comes out positive. Forward
    // car in the right lane → lateral > 0.
    const lateralSigned = RIGHT_LANE_OFFSET * sign;
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
