export const CAR_CONSTANTS = {
  MAX_SPEED: 60,                 // m/s
  ACCELERATION: 12,              // m/s^2
  BRAKE_FROM_TURN: 0.55,         // 55% top-speed cut at full lock
  STEER_RATE_LOW: 1.2,           // rad/s at low speed
  STEER_RATE_HIGH: 0.5,          // rad/s at top speed
  CAR_HALF_WIDTH: 0.845,         // m (FC RX-7 body width 1.69 m / 2)
  CAR_HALF_LENGTH: 1.225,        // m (FC RX-7 wheelbase 2.45 m / 2)
};

function lerp(a, b, t) { return a + (b - a) * t; }

export class CarPhysics {
  // groundYFn is optional and falls back to terrainHeightFn. Pass a road-aware
  // function to sample asphalt height when the wheel is over a road corridor;
  // the 4-wheel plane fit below uses whatever ground height is returned per
  // wheel, so one wheel can be on tarmac while another is in dirt and the car
  // body tilts accordingly.
  constructor({ terrainHeightFn, groundYFn = null, spawn = null }) {
    this.terrainHeightFn = terrainHeightFn;
    this.groundYFn = groundYFn || terrainHeightFn;
    this.x = spawn ? spawn.x : 0;
    this.z = spawn ? spawn.z : 0;
    this.headingY = spawn ? spawn.headingY : 0;
    this.speed = 0;
    this.pitch = 0;
    this.roll = 0;
    this.brakeHeld = false;
    this._updateGroundPose(); // sets this.y from the 4 wheels at spawn
  }

  // Project 4 wheel-center XZ positions, sample groundYFn at each, then set
  // body Y = average and pitch/roll from front-vs-rear and right-vs-left
  // height differences. Pitch/roll lerped for smoothness.
  _updateGroundPose() {
    const C = CAR_CONSTANTS;
    const sin = Math.sin(this.headingY), cos = Math.cos(this.headingY);
    // Forward = motion direction; right = forward rotated 90° clockwise (driver POV).
    const fx = sin, fz = cos;
    const rx = cos, rz = -sin;
    const hw = C.CAR_HALF_WIDTH, hl = C.CAR_HALF_LENGTH;
    const gy = this.groundYFn;
    const yFR = gy(this.x + rx * hw + fx * hl, this.z + rz * hw + fz * hl);
    const yFL = gy(this.x - rx * hw + fx * hl, this.z - rz * hw + fz * hl);
    const yRR = gy(this.x + rx * hw - fx * hl, this.z + rz * hw - fz * hl);
    const yRL = gy(this.x - rx * hw - fx * hl, this.z - rz * hw - fz * hl);
    this.y = (yFR + yFL + yRR + yRL) * 0.25;
    const yFront = (yFR + yFL) * 0.5;
    const yRear = (yRR + yRL) * 0.5;
    const yRight = (yFR + yRR) * 0.5;
    const yLeft = (yFL + yRL) * 0.5;
    // Pitch: positive = nose up (climbing a +z slope). Three.js applies X
    // rotation first in XYZ order, so positive rotation.x rotates the
    // model's default forward (-Z, before the yaw flip) up toward +Y, which
    // after the +PI yaw still leaves the world-space nose pointed upward.
    const targetPitch = Math.atan2(yFront - yRear, 2 * hl);
    const targetRoll = Math.atan2(yRight - yLeft, 2 * hw);
    this.pitch = lerp(this.pitch, targetPitch, 0.15);
    this.roll = lerp(this.roll, targetRoll, 0.15);
  }

  step(steering, dt) {
    const s = Math.max(-1, Math.min(1, steering));
    const C = CAR_CONSTANTS;
    let effMax = C.MAX_SPEED * (1 - C.BRAKE_FROM_TURN * Math.abs(s));
    if (this.brakeHeld) effMax = Math.min(effMax, 10);

    if (this.speed < effMax) {
      this.speed = Math.min(effMax, this.speed + C.ACCELERATION * dt);
    } else if (this.speed > effMax) {
      this.speed = Math.max(effMax, this.speed - C.ACCELERATION * 2 * dt);
    }

    const speedT = this.speed / C.MAX_SPEED;
    const rate = lerp(C.STEER_RATE_LOW, C.STEER_RATE_HIGH, Math.max(0, Math.min(1, speedT)));
    // Heading DECREASES on positive (right) steering input. The chase camera
    // looks down world +Z (because velocity at heading 0 is +Z), and three.js
    // computes camera right as up × (eye - target) — for a camera at -Z
    // looking +Z this yields world -X. So world +X renders on the LEFT of the
    // screen. Without this sign flip, drag-right rotates velocity toward
    // world +X (screen left) and the car curves the wrong way.
    this.headingY -= s * rate * dt;

    const vx = Math.sin(this.headingY) * this.speed;
    const vz = Math.cos(this.headingY) * this.speed;
    this.x += vx * dt;
    this.z += vz * dt;
    this._updateGroundPose();
  }
}
