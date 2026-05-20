export const CAR_CONSTANTS = {
  MAX_SPEED: 60,                 // m/s
  ACCELERATION: 12,              // m/s^2
  BRAKE_FROM_TURN: 0.55,         // 55% top-speed cut at full lock
  STEER_RATE_LOW: 1.2,           // rad/s at low speed
  STEER_RATE_HIGH: 0.5,          // rad/s at top speed
  CAR_RIDE_HEIGHT: 0.5,          // m above terrain
  CAR_HALF_WIDTH: 0.9,           // m
};

function lerp(a, b, t) { return a + (b - a) * t; }

export class CarPhysics {
  constructor({ terrainHeightFn, spawn = null }) {
    this.terrainHeightFn = terrainHeightFn;
    this.x = spawn ? spawn.x : 0;
    this.z = spawn ? spawn.z : 0;
    this.headingY = spawn ? spawn.headingY : 0;
    this.speed = 0;
    this.y = terrainHeightFn(this.x, this.z) + CAR_CONSTANTS.CAR_RIDE_HEIGHT;
    this.pitch = 0;
    this.roll = 0;
    this.brakeHeld = false;
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
    this.headingY += s * rate * dt;

    const vx = Math.sin(this.headingY) * this.speed;
    const vz = Math.cos(this.headingY) * this.speed;
    this.x += vx * dt;
    this.z += vz * dt;
    this.y = this.terrainHeightFn(this.x, this.z) + C.CAR_RIDE_HEIGHT;

    // Visual pitch/roll targets — sampled but lerped externally if needed.
    const probe = 1.2;
    const cos = Math.cos(this.headingY), sin = Math.sin(this.headingY);
    const fx = this.x + sin * probe, fz = this.z + cos * probe;
    const bx = this.x - sin * probe, bz = this.z - cos * probe;
    const lx = this.x - cos * probe, lz = this.z + sin * probe;
    const rx = this.x + cos * probe, rz = this.z - sin * probe;
    const hF = this.terrainHeightFn(fx, fz), hB = this.terrainHeightFn(bx, bz);
    const hL = this.terrainHeightFn(lx, lz), hR = this.terrainHeightFn(rx, rz);
    const targetPitch = Math.atan2(hB - hF, probe * 2);
    const targetRoll = Math.atan2(hR - hL, probe * 2);
    this.pitch = lerp(this.pitch, targetPitch, 0.15);
    this.roll = lerp(this.roll, targetRoll, 0.15);
  }
}
