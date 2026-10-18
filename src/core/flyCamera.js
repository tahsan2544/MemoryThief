import * as THREE from 'three';

/**
 * Free-flight inspection camera (development tool, NOT the gameplay camera).
 *
 * Mouse-look + WASD flight with speed control, boost and a hard reset.
 * It exists so the city can be reviewed before Riven Vale exists.
 */

const UP = new THREE.Vector3(0, 1, 0);

export class FlyCamera {
  constructor(camera, input) {
    this.camera = camera;
    this.input = input;

    this.yaw = 0;
    this.pitch = 0;
    this.position = new THREE.Vector3(0, 200, 400);
    this.velocity = new THREE.Vector3();
    this.baseSpeed = 90;
    this.minSpeed = 12;
    this.maxSpeed = 520;
    this.sensitivity = 0.0022;
    this.smoothing = 14;

    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._wish = new THREE.Vector3();
    this.home = { pos: new THREE.Vector3(0, 300, 500), look: new THREE.Vector3(0, 20, 0) };
    this.setPose(this.home.pos, this.home.look);
  }

  setPose(pos, target) {
    this.position.set(pos[0], pos[1], pos[2]);
    this.camera.position.copy(this.position);
    const dir = new THREE.Vector3(target[0], target[1], target[2]).sub(this.position).normalize();
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    this.velocity.set(0, 0, 0);
    this.applyRotation();
  }

  setHome(pos, target) {
    this.home.pos.set(pos[0], pos[1], pos[2]);
    this.home.look.set(target[0], target[1], target[2]);
  }

  reset() {
    this.setPose([this.home.pos.x, this.home.pos.y, this.home.pos.z], [
      this.home.look.x,
      this.home.look.y,
      this.home.look.z,
    ]);
  }

  applyRotation() {
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  update(dt) {
    const input = this.input;

    // --- look ---
    if (input.locked) {
      const m = input.consumeMouse();
      this.yaw -= m.x * this.sensitivity;
      this.pitch -= m.y * this.sensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
      this.applyRotation();
    } else {
      input.consumeMouse();
    }

    // --- speed ---
    const wheel = input.consumeWheel();
    if (wheel) {
      const k = Math.exp(-wheel * 0.0012);
      this.baseSpeed = THREE.MathUtils.clamp(this.baseSpeed * k, this.minSpeed, this.maxSpeed);
    }

    // --- movement intent ---
    this._forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this._right.crossVectors(this._forward, UP).normalize();
    this._wish.set(0, 0, 0);

    if (input.isDown('KeyW')) this._wish.add(this._forward);
    if (input.isDown('KeyS')) this._wish.sub(this._forward);
    if (input.isDown('KeyD')) this._wish.add(this._right);
    if (input.isDown('KeyA')) this._wish.sub(this._right);
    if (input.isDown('KeyE') || input.isDown('Space')) this._wish.y += 1;
    if (input.isDown('KeyQ') || input.isDown('ControlLeft')) this._wish.y -= 1;

    if (this._wish.lengthSq() > 0) this._wish.normalize();

    const boost = input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? 4.2 : 1;
    const target = this._wish.multiplyScalar(this.baseSpeed * boost);

    const k = 1 - Math.exp(-this.smoothing * dt);
    this.velocity.lerp(target, k);
    if (this._wish.lengthSq() === 0 && this.velocity.lengthSq() < 0.4) this.velocity.set(0, 0, 0);

    this.position.addScaledVector(this.velocity, dt);

    // Guard: a single NaN would otherwise poison the camera forever.
    if (!Number.isFinite(this.position.x) || !Number.isFinite(this.position.y) || !Number.isFinite(this.position.z)) {
      if (!this._nanWarned) {
        this._nanWarned = true;
        console.warn('[camera] non-finite position — resetting to home', {
          dt,
          velocity: this.velocity.toArray(),
          position: this.position.toArray(),
        });
      }
      this.velocity.set(0, 0, 0);
      this.position.set(this.home.pos.x, this.home.pos.y, this.home.pos.z);
    }

    this.camera.position.copy(this.position);
  }
}
