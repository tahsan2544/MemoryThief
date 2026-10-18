/**
 * Accessibility options (Phase 6) — preferences that make the interface
 * readable for more people. Kept in their own storage key (`mt.a11y.v1`)
 * so they survive reloads *and* are never erased by a new game.
 *
 * Options:
 *   scale         — interface size: 100% / 115% / 130% (CSS --ui-scale)
 *   reduceFlicker — kills the reconstruction flicker/strobe animations
 *   highContrast  — heavier borders + brighter text on prompts and cards
 *   reduceFx      — hides ambient particles and flattens heavy screen effects
 *                   (Phase 7); clue markers and gameplay information are
 *                   never affected — clues stay visible by design
 *
 * Validation: any malformed stored value falls back to the default, so a
 * corrupt preference file can never break the UI.
 */

const KEY = 'mt.a11y.v1';
const SCALES = [1, 1.15, 1.3];

const DEFAULTS = Object.freeze({ scale: 1, reduceFlicker: false, highContrast: false, reduceFx: false });

let prefs = { ...DEFAULTS };

function sanitize(raw) {
  const out = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  const s = Number(raw.scale);
  if (SCALES.includes(s)) out.scale = s;
  out.reduceFlicker = !!raw.reduceFlicker;
  out.highContrast = !!raw.highContrast;
  out.reduceFx = !!raw.reduceFx;
  return out;
}

function load() {
  try {
    const raw = window.localStorage?.getItem(KEY);
    prefs = raw ? sanitize(JSON.parse(raw)) : { ...DEFAULTS };
  } catch {
    prefs = { ...DEFAULTS };
  }
}

function persist() {
  try {
    window.localStorage?.setItem(KEY, JSON.stringify({ v: 1, ...prefs }));
  } catch {
    /* private mode: preferences simply won't persist */
  }
}

/** Push the current preferences onto the document (idempotent). */
export function applyA11y() {
  const root = document.documentElement;
  root.style.setProperty('--ui-scale', String(prefs.scale));
  document.body.classList.toggle('reduce-flicker', !!prefs.reduceFlicker);
  document.body.classList.toggle('high-contrast', !!prefs.highContrast);
  document.body.classList.toggle('reduce-fx', !!prefs.reduceFx);
  // let gameplay systems (particles, overlays) react without importing each
  // other — main.js listens for this and re-applies its effects
  document.dispatchEvent(new CustomEvent('mt:a11y', { detail: { ...prefs } }));
}

export function a11yPrefs() {
  return { ...prefs };
}

/** Merge a patch, validate, persist, apply. Returns the new preferences. */
export function setA11y(patch = {}) {
  prefs = sanitize({ ...prefs, ...patch });
  persist();
  applyA11y();
  return { ...prefs };
}

export function resetA11y() {
  prefs = { ...DEFAULTS };
  persist();
  applyA11y();
  return { ...prefs };
}

/** Boot: read + apply once, before the first frame paints. */
export function initA11y() {
  load();
  applyA11y();
  return { ...prefs };
}
