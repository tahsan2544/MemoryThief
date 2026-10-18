import * as THREE from 'three';

/**
 * Third-person follow camera — STEADY variant.
 *
 * Mouse orbits a pivot just above the character's shoulders; WASD is then
 * read off this camera's yaw so "forward" always means "where I'm looking".
 *
 * The camera is deliberately locked-down rather than cinematic:
 *   1. no lens breathing — the field of view never changes with speed, so
 *      the frame does not move unless the player moves it;
 *   2. no look-ahead drift — the camera looks straight at the pivot, so the
 *      character sits in the same place in frame at every speed;
 *   3. tight pivot smoothing, so step-ups and landings barely register;
 *   4. the boom is sphere-tested against the collision world AND clamped to
 *      stand above the ground, so it can never sink under the street or
 *      finish buried inside a building.
 */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

export class ThirdPersonCamera {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('../core/input.js').Input} input
   * @param {import('./collision.js').Colliders} getColliders () => Colliders
   * @param {object} settings live settings (sensitivity / invertY / camDistance)
   */
  constructor(camera, input, getColliders, settings) {
    this.camera = camera;
    this.input = input;
    this.getColliders = getColliders;
    this.settings = settings;

    this.yaw = Math.PI;
    this.pitch = 0.24;
    this.distance = settings.camDistance ?? 4.6;
    this.minDistance = 2.2;
    this.maxDistance = 9;

    this.currentDist = this.distance;
    this.pivot = new THREE.Vector3(0, 1.55, 0);
    this.smoothPivot = new THREE.Vector3(0, 1.55, 0);
    this.lead = 0.8; // constant, tiny — keeps the head from filling the frame

    this.baseFov = 58; // fixed. No speed kick, no lens breathing.

    this._dir = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._basis = { fx: 0, fz: -1, rx: 1, rz: 0 };
    this._collided = false;
  }

  /** Place the camera behind the character looking along `yaw`. */
  setYaw(yaw, pitch = this.pitch) {
    this.yaw = yaw;
    this.pitch = pitch;
  }

  /** Teleport the orbit pivot (no glide) — used on spawn / mode switches. */
  snapPivot(x, y, z) {
    this.pivot.set(x, y + 1.5, z);
    this.smoothPivot.copy(this.pivot);
  }

  /** Basis vectors for camera-relative movement (XZ only, unit length). */
  get basis() {
    return this._basis;
  }

  get boomDistance() {
    return this.currentDist;
  }

  /** True when the last frame had to pull the boom in against geometry. */
  get cameraCollided() {
    return this._collided;
  }

  update(dt, target, speed = 0) {
    const s = this.settings;
    void speed; // kept in the signature: callers pass it, the lens ignores it

    // ---- look -----------------------------------------------------------
    const m = this.input.consumeMouse();
    const sens = 0.0023 * (s.sensitivity ?? 1);
    this.yaw -= m.x * sens;
    this.pitch += m.y * sens * (s.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -0.35, 1.3);

    const wheel = this.input.consumeWheel();
    if (wheel) {
      this.distance = clamp(this.distance * Math.exp(wheel * 0.0012), this.minDistance, this.maxDistance);
    }

    // ---- pivot smoothing ------------------------------------------------
    this.pivot.set(target.x, target.y + 1.5, target.z);
    this.smoothPivot.x = smooth(this.smoothPivot.x, this.pivot.x, 26, dt);
    this.smoothPivot.y = smooth(this.smoothPivot.y, this.pivot.y, 22, dt);
    this.smoothPivot.z = smooth(this.smoothPivot.z, this.pivot.z, 26, dt);

    // ---- desired boom ---------------------------------------------------
    const cosP = Math.cos(this.pitch);
    this._dir.set(Math.sin(this.yaw) * cosP, Math.sin(this.pitch), Math.cos(this.yaw) * cosP).normalize();

    let allowed = this.distance; // wheel-adjusted boom length

    const colliders = this.getColliders();
    if (colliders) {
      const hit = this._sweep(colliders, allowed);
      if (hit < allowed) {
        allowed = Math.max(0.45, hit);
        this._collided = true;
      } else {
        this._collided = false;
      }
    }

    // snap in when a wall intrudes, ease back out when it clears
    const rate = allowed < this.currentDist ? 30 : 6;
    this.currentDist = smooth(this.currentDist, allowed, rate, dt);

    this._desired.copy(this.smoothPivot).addScaledVector(this._dir, this.currentDist);

    // ---- ground clamp ---------------------------------------------------
    // Looking down from a long boom used to sink the lens below the street,
    // where the road slabs and the sky showed through each other. The camera
    // now stands on the terrain: it may look down, but it never goes under it.
    if (colliders) {
      const ground = colliders.baseGround(this._desired.x, this._desired.z);
      const minY = ground + 0.55;
      if (this._desired.y < minY) {
        this._desired.y = minY;
        // and if that position is buried in a wall, retreat towards the pivot
        let guard = 8;
        while (guard-- > 0 && colliders.isPointBlocked(this._desired.x, this._desired.y, this._desired.z)) {
          this.currentDist *= 0.82;
          this._desired.copy(this.smoothPivot).addScaledVector(this._dir, this.currentDist);
          if (this._desired.y < minY) this._desired.y = minY;
        }
        this._collided = true;
      }
    }

    this.camera.position.copy(this._desired);

    // ---- look target: the pivot itself, with a constant small lead ------
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    this._basis.fx = fx;
    this._basis.fz = fz;
    this._basis.rx = -fz;
    this._basis.rz = fx;

    this._look.copy(this.smoothPivot);
    this._look.x += fx * this.lead;
    this._look.z += fz * this.lead;
    this.camera.lookAt(this._look);
  }

  /**
   * March from the pivot towards the boom end and return the free length.
   * Cheap but effective: the city is all axis-aligned boxes and cylinders.
   */
  _sweep(colliders, maxDist) {
    const steps = 16;
    const step = maxDist / steps;
    let free = maxDist;
    for (let i = 1; i <= steps; i++) {
      const d = i * step;
      const x = this.smoothPivot.x + this._dir.x * d;
      const y = this.smoothPivot.y + this._dir.y * d;
      const z = this.smoothPivot.z + this._dir.z * d;
      if (colliders.isPointBlocked(x, y, z)) {
        free = Math.max(0.45, (i - 1) * step - 0.35);
        break;
      }
    }
    return free;
  }

  reset() {
    this.currentDist = this.distance;
  }
}
