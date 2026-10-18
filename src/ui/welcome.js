/** Welcome screen — the title card the city greets you with, once the world is
 *  ready and before play begins. Shown on boot only; starting is a deliberate
 *  click (which doubles as the browser gesture that unlocks WebAudio). */

const el = {
  overlay: () => document.getElementById('welcome'),
  start: () => document.getElementById('welcome-start'),
};

let open = false;

export function isWelcomeOpen() {
  return open;
}

export function showWelcome() {
  const overlay = el.overlay();
  if (!overlay || open) return open;
  open = true;
  overlay.classList.remove('hidden');
  el.start()?.focus();
  return open;
}

export function hideWelcome() {
  if (!open) return false;
  open = false;
  el.overlay()?.classList.add('hidden');
  return true;
}

export function initWelcome(onStart) {
  el.start()?.addEventListener('click', () => {
    if (!open) return;
    hideWelcome();
    onStart?.();
  });
}
