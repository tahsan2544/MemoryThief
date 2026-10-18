import * as THREE from 'three';
import { CharacterAnimator } from '../character/animator.js';
import { createRivenVale } from '../character/rivenVale.js';

/**
 * Third-person character controller for Riven Vale.
 *
 * Deliberately small and readable: camera-relative intent → smoothed velocity
 * → per-axis sweep against the collision world → ground probe. No physics
 * engine, no slippery drift.
 *
 * Feel targets (tuned for a 16 m wide street grid):
 *   walk 3.4 m/s · sprint 6.7 m/s · jump ≈ 1.4 m · turn ~12 rad/s smoothing
 *   acceleration 14 / deceleration 18 (ground) so stops are crisp
 */

const TWO_PI = Math.PI * 2;

function angleLerp(from, to, k) {
  let d = (to - from) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return from + d * k;
}

export class PlayerController {
  constructor({ input, getColliders, cameraRig, settings }) {
    this.input = input;
    this.getColliders = getColliders;
    this.cameraRig = cameraRig;
    this.settings = settings;

    this.rig = createRivenVale();
    this.animator = new CharacterAnimator(this.rig);

    this.position = new THREE.Vector3(0, 0, 0); // logical feet position
    this.renderY = 0; // smoothed height for the mesh/camera (hides step pops)
    this.velocity = new THREE.Vector3();
    this.grounded = true;
    this.coyote = 0; // seconds since leaving the ground
    this.facing = 0;
    this.active = false;
    this.frozen = false;
    this.crouching = false;

    this.walkSpeed = 3.4;
    this.runSpeed = 6.7;
    this.jumpSpeed = 7.7;
    this.gravity = 21;
    this.maxFall = 48;

    this._wishX = 0;
    this._wishZ = 0;

    // Phase 7 — presentation callbacks wired from main.js:
    //   onStep(isRun)  fires on each stride heel-strike (footstep audio)
    //   onLand()       fires when a fall touches down (landing thud)
    this.onStep = null;
    this.onLand = null;
    this._lastPhase = 0;
  }

  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  /** Drop the character at a road point (used at boot and by tests). */
  spawn(x, z, yaw = 0) {
    const colliders = this.getColliders();
    const y = colliders ? colliders.groundAt(x, z, 0.18) : 0;
    this.position.set(x, y, z);
    this.renderY = y;
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.coyote = 0;
    this.facing = yaw;
    this.animator.reset();
    this.rig.group.position.set(x, y, z);
    this.rig.group.rotation.y = yaw;
    this.cameraRig.setYaw(yaw + Math.PI); // camera starts behind the character
    this.cameraRig.reset();
    this.cameraRig.snapPivot?.(x, y, z);
    return this.position;
  }

  /**
   * @param {number} dt
   * @param {string[]} pressed key codes consumed this frame
   * @param {{frozen?: boolean}} opts
   */
  update(dt, pressed, opts = {}) {
    if (!this.active) return;
    const colliders = this.getColliders();
    if (!colliders) return;

    const input = this.input;
    const frozen = opts.frozen || this.frozen;

    // ---- intent (camera-relative) --------------------------------------
    let ix = 0;
    let iz = 0;
    if (!frozen) {
      if (input.isDown('KeyW')) iz += 1;
      if (input.isDown('KeyS')) iz -= 1;
      if (input.isDown('KeyD')) ix += 1;
      if (input.isDown('KeyA')) ix -= 1;
    }
    const mag = Math.hypot(ix, iz);
    if (mag > 1e-4) {
      ix /= mag;
      iz /= mag;
    }

    const sprinting =
      !frozen && (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && mag > 1e-4;
    // Phase 8: hold Ctrl to crouch / sneak — slower, lower profile, and you
    // cannot sprint out of a crouch.
    const crouching = !frozen && !sprinting &&
      (input.isDown('ControlLeft') || input.isDown('ControlRight'));
    this.crouching = crouching;
    const walkNow = crouching ? this.walkSpeed * 0.45 : this.walkSpeed;
    const maxSpeed = sprinting ? this.runSpeed : walkNow;

    const b = this.cameraRig.basis;
    const wishX = (b.fx * iz + b.rx * ix) * maxSpeed;
    const wishZ = (b.fz * iz + b.rz * ix) * maxSpeed;
    this._wishX = wishX;
    this._wishZ = wishZ;

    // ---- acceleration ---------------------------------------------------
    const moving = mag > 1e-4;
    let rate;
    if (!this.grounded) rate = 5;
    else if (moving) rate = 14;
    else rate = 18;
    const k = 1 - Math.exp(-rate * dt);
    this.velocity.x += (wishX - this.velocity.x) * k;
    this.velocity.z += (wishZ - this.velocity.z) * k;

    // ---- jump / gravity -------------------------------------------------
    if (!frozen && pressed?.includes('Space') && (this.grounded || this.coyote > 0)) {
      this.velocity.y = this.jumpSpeed;
      this.grounded = false;
      this.coyote = 0;
    }
    if (!this.grounded) {
      this.velocity.y = Math.max(-this.maxFall, this.velocity.y - this.gravity * dt);
      this.coyote = Math.max(0, this.coyote - dt);
    }

    // ---- horizontal sweep (per axis -> natural wall sliding) ------------
    const feet = this.position.y;
    const dx = this.velocity.x * dt;
    const dz = this.velocity.z * dt;
    let [px, pz] = colliders.moveAxis(this.position.x, this.position.z, dx, 0, feet);
    [px, pz] = colliders.moveAxis(px, pz, 0, dz, feet);
    this.position.x = px;
    this.position.z = pz;

    // ---- vertical -------------------------------------------------------
    this.position.y += this.velocity.y * dt;
    const ground = colliders.groundAt(this.position.x, this.position.z, this.position.y);

    if (this.grounded) {
      const step = ground - this.position.y;
      if (step < -0.08) {
        // walked off a ledge — brief coyote window to still catch a jump
        this.grounded = false;
        this.coyote = 0.14;
      } else {
        this.position.y = ground;
        if (this.velocity.y < 0) this.velocity.y = 0;
      }
    } else if (this.velocity.y <= 0 && this.position.y <= ground) {
      this.position.y = ground;
      this.velocity.y = 0;
      this.grounded = true;
      this.animator.onLand();
      this.onLand?.();
    }

    // ---- facing ---------------------------------------------------------
    const speed = this.speed;
    if (speed > 0.6) {
      this.facing = angleLerp(this.facing, Math.atan2(this.velocity.x, this.velocity.z), 1 - Math.exp(-12 * dt));
    } else if (moving) {
      this.facing = angleLerp(this.facing, Math.atan2(wishX, wishZ), 1 - Math.exp(-14 * dt));
    }

    // ---- presentation ---------------------------------------------------
    this.renderY += (this.position.y - this.renderY) * (1 - Math.exp(-18 * dt));
    if (Math.abs(this.position.y - this.renderY) > 0.6) this.renderY = this.position.y;

    this.rig.group.position.set(this.position.x, this.renderY, this.position.z);
    this.rig.group.rotation.y = this.facing;

    this.animator.update(dt, {
      speed,
      maxSpeed: this.runSpeed,
      walkSpeed: this.walkSpeed,
      grounded: this.grounded,
      vy: this.velocity.y,
      crouch: crouching,
    });

    // ---- footstep events (Phase 7) --------------------------------------
    // The animator's stride phase advances 0..2π per full cycle; each half
    // cycle is one footfall, so we fire onStep at every π crossing while the
    // character is actually striding on the ground.
    if (this.grounded && speed > 0.7 && this.animator.blend > 0.15) {
      const ph = this.animator.phase;
      const half = Math.PI;
      const crossed = Math.floor(ph / half) !== Math.floor(this._lastPhase / half) || ph < this._lastPhase;
      if (crossed) this.onStep?.(speed > this.walkSpeed * 1.15);
    }
    this._lastPhase = this.animator.phase;
  }

  /** Head-height point the camera orbits around. */
  cameraTarget(out) {
    out.set(this.position.x, this.renderY + 0.05, this.position.z);
    return out;
  }

  /** Sustain the extraction (glove raised) pose while channeling. */
  setChannel(on) {
    this.animator.setChannel(on);
  }

  /** Fire a one-shot arm gesture (reach / point) when interacting. */
  gesture(name = 'reach') {
    this.animator.fireGesture(name);
  }

  snapshot() {
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const c = this.animator.c;
    return {
      pos: [this.position.x, this.position.y, this.position.z],
      renderY: this.renderY,
      vel: [this.velocity.x, this.velocity.y, this.velocity.z],
      speed: this.speed,
      grounded: this.grounded,
      crouch: this.crouching,
      facing: this.facing,
      state: this.animator.state,
      active: this.active,
      // live gait channels — proof the rig is actually articulating
      gait: {
        knees: [r3(c.kneeL), r3(c.kneeR)],
        elbows: [r3(c.elbowL), r3(c.elbowR)],
        torso: [r3(c.torsoX), r3(c.torsoY)],
        turn: r3(this.animator.turn),
      },
    };
  }

  dispose() {
    this.rig.dispose();
    this.rig.group.removeFromParent();
  }
}
