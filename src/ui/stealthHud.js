/**
 * Phase 4 — the stealth HUD: state chip, awareness meter, and the reason line.
 *
 * The chip answers "does anyone suspect me right now" at a glance; the bar
 * shows how close the strongest observer is to full suspicion; the reason
 * line says *why* attention is building ("Caught sprinting", "Behind cover
 * — no line of sight"). Everything is change-driven: the DOM only touches
 * itself when the state or the reason actually moves.
 */

const STATE_LABEL = {
  hidden: 'HIDDEN',
  suspicious: 'SUSPICIOUS',
  detected: 'DETECTED',
  searching: 'SEARCHING',
};

let els = null;

function cache() {
  if (els) return els;
  els = {
    root: document.getElementById('stealth'),
    label: document.getElementById('stealth-label'),
    reason: document.getElementById('stealth-reason'),
    fill: document.getElementById('stealth-fill'),
  };
  return els;
}

export function initStealthHud() {
  const e = cache();
  if (!e.root) return null;
  updateStealthHud({ state: 'hidden', reason: 'No one is watching', awareness: 0 });
  return e.root;
}

/**
 * @param {{state:string, reason:string, awareness:number}} view
 */
export function updateStealthHud(view) {
  const e = cache();
  if (!e.root || !view) return;
  e.root.dataset.state = view.state;
  const label = STATE_LABEL[view.state] ?? 'HIDDEN';
  if (e.label && e.label.textContent !== label) e.label.textContent = label;
  if (e.reason && e.reason.textContent !== view.reason) e.reason.textContent = view.reason;
  if (e.fill) {
    const pct = Math.round(Math.max(0, Math.min(1, view.awareness ?? 0)) * 100);
    e.fill.style.width = `${pct}%`;
  }
}

/** Play mode shows the chip; the inspection camera hides it. */
export function setStealthHudVisible(on) {
  const e = cache();
  if (e.root) e.root.classList.toggle('hidden', !on);
}
