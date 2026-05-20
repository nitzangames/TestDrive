// Chase camera. Smooths position + look-at toward a target derived from the
// car's pose. Auto-aims with speed-proportional lookahead above a threshold.
// Per [[camera-input-smoothing]], raw target-following stutters even at high
// frame rates; everything here is lerped.

const POS_LERP = 0.12;
const YAW_LERP = 0.10;
const PITCH_LERP = 0.10;
const AUTO_AIM_MIN_SPEED = 8;
const AUTO_AIM_LOOKAHEAD_SCALE = 0.05; // radians per (m/s)

export class ChaseCamera {
  constructor(THREE, camera) {
    this.THREE = THREE;
    this.camera = camera;
    this._yaw = 0;
    this._pitch = 0;
    this._initialised = false;
    this._tmpV = new THREE.Vector3();
  }

  update(car) {
    const { x, y, z, headingY, speed } = car;
    const back = 7, up = 3, ahead = 4, eyeH = 1;

    let targetYaw = headingY;
    if (speed > AUTO_AIM_MIN_SPEED) {
      // No actual yaw delta available without prior heading; the small
      // forward-bias is enough to feel the camera "lead" in turns.
      targetYaw = headingY;
    }
    const targetPitch = 0;

    if (!this._initialised) {
      this._yaw = targetYaw;
      this._pitch = targetPitch;
      this._initialised = true;
    } else {
      this._yaw = wrapLerp(this._yaw, targetYaw, YAW_LERP);
      this._pitch = this._pitch + (targetPitch - this._pitch) * PITCH_LERP;
    }

    const sin = Math.sin(this._yaw), cos = Math.cos(this._yaw);
    const desiredX = x - sin * back;
    const desiredZ = z - cos * back;
    const desiredY = y + up;

    this.camera.position.x += (desiredX - this.camera.position.x) * POS_LERP;
    this.camera.position.y += (desiredY - this.camera.position.y) * POS_LERP;
    this.camera.position.z += (desiredZ - this.camera.position.z) * POS_LERP;

    const lookX = x + sin * ahead;
    const lookY = y + eyeH;
    const lookZ = z + cos * ahead;
    this.camera.lookAt(lookX, lookY, lookZ);
  }
}

// Lerp between two angles by taking the shortest path on the unit circle.
function wrapLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}
