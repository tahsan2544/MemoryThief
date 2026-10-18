/**
 * Keyboard + pointer-lock mouse input for the development inspection camera.
 *
 * Deliberately independent of the future gameplay camera/character controller:
 * this is a debug tool first, so it grabs everything it needs and exposes a
 * very small API (`isDown`, `consumeMouse`, `consumeWheel`, `consumePressed`).
 */

export class Input {
  constructor(target) {
    this.target = target;
    this.down = new Set();
    this.pressed = [];
    this.mouseX = 0;
    this.mouseY = 0;
    this.wheel = 0;
    this.locked = false;
    this._enabled = true;

    this._onKeyDown = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (KEYS_BLOCKED.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.push(e.code);
    };
    this._onKeyUp = (e) => this.down.delete(e.code);
    this._onBlur = () => this.down.clear();
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      this.mouseX += e.movementX || 0;
      this.mouseY += e.movementY || 0;
    };
    this._onWheel = (e) => {
      if (!this.locked) return;
      this.wheel += e.deltaY;
      e.preventDefault();
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.target;
      this.onLockChange?.(this.locked);
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onLockChange);
    target.addEventListener('wheel', this._onWheel, { passive: false });
  }

  requestLock() {
    if (this.locked) return;
    const p = this.target.requestPointerLock?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  exitLock() {
    if (this.locked) document.exitPointerLock?.();
  }

  isDown(code) {
    return this.down.has(code);
  }

  consumeMouse() {
    const v = { x: this.mouseX, y: this.mouseY };
    this.mouseX = 0;
    this.mouseY = 0;
    return v;
  }

  consumeWheel() {
    const v = this.wheel;
    this.wheel = 0;
    return v;
  }

  consumePressed() {
    const v = this.pressed;
    this.pressed = [];
    return v;
  }

  /* ------------------------ test injection (headless) ------------------- *
   * Used by scripts/smoke.mjs: real pointer lock is unreliable in headless
   * Edge, so tests drive the same state the event handlers write to.
   */

  /** Hold or release a key programmatically. */
  setKey(code, down) {
    if (down) {
      if (!this.down.has(code)) {
        this.down.add(code);
        this.pressed.push(code);
      }
    } else {
      this.down.delete(code);
    }
  }

  /** Queue a single key press without holding it. */
  injectPress(code) {
    this.pressed.push(code);
  }

  /** Accumulate mouse delta as if the pointer were locked. */
  simulateMouse(dx, dy) {
    this.mouseX += dx;
    this.mouseY += dy;
  }

  clearAll() {
    this.down.clear();
    this.pressed.length = 0;
    this.mouseX = 0;
    this.mouseY = 0;
    this.wheel = 0;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    this.target.removeEventListener('wheel', this._onWheel);
  }
}

const KEYS_BLOCKED = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Tab',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'F5', // camera-mode toggle, must not reload the page
]);
