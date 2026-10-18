/** HUD: transient toasts. */

const cache = {};
const get = (id) => (cache[id] ??= document.getElementById(id));

let toastTimer = 0;

export function setHudVisible(visible) {
  const hud = document.getElementById('hud');
  if (hud) hud.classList.toggle('hidden', !visible);
}

export function isHudVisible() {
  const hud = document.getElementById('hud');
  return hud ? !hud.classList.contains('hidden') : false;
}

export function toast(message, ms = 2600) {
  const t = get('toast');
  if (!t) return;
  t.textContent = message;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

