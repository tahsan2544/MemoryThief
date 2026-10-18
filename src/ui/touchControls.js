/**
 * Touch controls (Phase 7) — a minimal overlay for phones/tablets that
 * feeds the *same* injection APIs the tests use (`Input.setKey` /
 * `injectPress` / `simulateMouse`), so the controller, camera and UI code
 * never learn that touch exists.
 *
 *   left thumb  — virtual stick: movement keys (WASD, digital at 30 % deflection)
 *   right side  — drag to look (mouse-look deltas)
 *   buttons     — E interact · jump · sprint (hold)
 *
 * Only instantiated when the device actually reports coarse-pointer touch;
 * desktop and headless test browsers get nothing (no DOM, no listeners).
 * Menus/overlays stay keyboard+mouse — documented honestly in the README.
 */

const DEADZONE = 0.3; // stick deflection before a movement key engages
const STICK_RADIUS = 56; // px

export function createTouchControls({ input, canvas }) {
  const supported =
    typeof window !== 'undefined' &&
    (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) &&
    window.matchMedia?.('(pointer: coarse)').matches;

  const state = { supported, visible: false, stickId: null, lookId: null, stickX: 0, stickY: 0 };
  let root = null;
  let onGesture = null;

  if (!supported) {
    return {
      state,
      setVisible() {},
      setGestureHook() {},
      dispose() {},
    };
  }

  /* ------------------------------ markup -------------------------------- */

  root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `
    <div class="touch-stick" id="touch-stick"><div class="touch-knob" id="touch-knob"></div></div>
    <div class="touch-buttons">
      <button class="touch-btn" id="touch-sprint" aria-label="Sprint">»</button>
      <button class="touch-btn" id="touch-jump" aria-label="Jump">^</button>
      <button class="touch-btn primary" id="touch-interact" aria-label="Interact">E</button>
    </div>`;
  document.body.appendChild(root);

  const stick = root.querySelector('#touch-stick');
  const knob = root.querySelector('#touch-knob');
  const btnInteract = root.querySelector('#touch-interact');
  const btnJump = root.querySelector('#touch-jump');
  const btnSprint = root.querySelector('#touch-sprint');

  const gesture = (e) => {
    e.preventDefault();
    onGesture?.();
  };

  /* ------------------------------- stick -------------------------------- */

  function stickCenter() {
    const r = stick.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function applyStick(dx, dy) {
    const len = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(len, STICK_RADIUS);
    const nx = (dx / len) * clamped;
    const ny = (dy / len) * clamped;
    knob.style.transform = `translate(${nx}px, ${ny}px)`;

    // camera-relative: +y (up) = forward (W), +x (right) = strafe right (D)
    const defl = clamped / STICK_RADIUS;
    const px = dx / len;
    const py = dy / len;
    state.stickX = px * defl;
    state.stickY = py * defl;
    input.setKey('KeyW', defl > DEADZONE && py < -0.35);
    input.setKey('KeyS', defl > DEADZONE && py > 0.35);
    input.setKey('KeyA', defl > DEADZONE && px < -0.35);
    input.setKey('KeyD', defl > DEADZONE && px > 0.35);
  }

  function releaseStick() {
    state.stickId = null;
    state.stickX = 0;
    state.stickY = 0;
    knob.style.transform = 'translate(0px, 0px)';
    for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) input.setKey(code, false);
  }

  root.addEventListener(
    'touchstart',
    (e) => {
      gesture(e);
      for (const t of e.changedTouches) {
        const onStick = stick.contains(t.target);
        if (onStick && state.stickId === null) {
          state.stickId = t.identifier;
          const c = stickCenter();
          applyStick(t.clientX - c.x, t.clientY - c.y);
        } else if (!onStick && !e.target.closest?.('.touch-btn') && state.lookId === null) {
          state.lookId = t.identifier;
        }
      }
    },
    { passive: false },
  );

  root.addEventListener(
    'touchmove',
    (e) => {
      gesture(e);
      for (const t of e.changedTouches) {
        if (t.identifier === state.stickId) {
          const c = stickCenter();
          applyStick(t.clientX - c.x, t.clientY - c.y);
        } else if (t.identifier === state.lookId) {
          input.simulateMouse((t.movementX ?? 0) * 1.5, (t.movementY ?? 0) * 1.5);
        }
      }
    },
    { passive: false },
  );

  const endTouch = (e) => {
    gesture(e);
    for (const t of e.changedTouches) {
      if (t.identifier === state.stickId) releaseStick();
      if (t.identifier === state.lookId) state.lookId = null;
    }
  };
  root.addEventListener('touchend', endTouch, { passive: false });
  root.addEventListener('touchcancel', endTouch, { passive: false });

  /* ------------------------------ buttons -------------------------------- */

  const bindButton = (el, down, up) => {
    el.addEventListener('touchstart', (e) => {
      gesture(e);
      down();
    }, { passive: false });
    el.addEventListener('touchend', (e) => {
      gesture(e);
      up();
    }, { passive: false });
    el.addEventListener('touchcancel', (e) => {
      gesture(e);
      up();
    }, { passive: false });
    // let a stray mouse click on the button work too (dev machines w/ touch)
    el.addEventListener('click', (e) => {
      e.preventDefault();
      down();
      setTimeout(up, 90);
    });
  };

  bindButton(btnInteract, () => input.injectPress('KeyE'), () => {});
  bindButton(btnJump, () => input.injectPress('Space'), () => {});
  bindButton(btnSprint, () => input.setKey('ShiftLeft', true), () => input.setKey('ShiftLeft', false));

  /* ------------------------------ visibility ----------------------------- */

  function setVisible(v) {
    v = !!v;
    if (v === state.visible) return;
    state.visible = v;
    root.classList.toggle('on', v);
    if (!v) releaseStick();
    // never leave keys stuck down when the layer hides
    input.setKey('ShiftLeft', false);
  }

  setVisible(false);

  return {
    state,
    setVisible,
    setGestureHook(fn) {
      onGesture = fn;
    },
    dispose() {
      releaseStick();
      root.remove();
    },
  };
}
