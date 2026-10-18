/**
 * Interaction UI: the floating "hold to inspect" prompt and the read-out card.
 *
 * Pure DOM, no framework — the game shell is plain HTML/CSS. Both elements
 * live in index.html; this module only toggles them and fills in content.
 */

const cache = {};
const get = (id) => (cache[id] ??= document.getElementById(id));

const KIND_LABEL = {
  sign: 'SIGNAGE',
  note: 'FIELD NOTE',
  door: 'MAINTENANCE',
  echo: 'MEMORY ECHO',
};

let visibleLabel = null;
let openId = null;

export function showPrompt(label) {
  const el = get('prompt');
  const text = get('prompt-label');
  if (!el || !text) return;
  if (visibleLabel === label && !el.classList.contains('hidden')) return;
  visibleLabel = label;
  text.textContent = label;
  el.classList.remove('hidden');
}

export function hidePrompt() {
  const el = get('prompt');
  if (!el || el.classList.contains('hidden')) return;
  visibleLabel = null;
  el.classList.add('hidden');
  // clear the text too: a hidden prompt keeps its old label in the DOM,
  // which reads as a live prompt to anything inspecting the element
  const text = get('prompt-label');
  if (text) text.textContent = '';
}

export function isPromptVisible() {
  const el = get('prompt');
  return !!el && !el.classList.contains('hidden');
}

/** Open the read-out card for one interactable record. */
export function openInspect(rec) {
  const el = get('inspect');
  if (!el || !rec) return false;
  const kicker = get('inspect-kicker');
  const title = get('inspect-title');
  const body = get('inspect-body');
  if (kicker) kicker.textContent = KIND_LABEL[rec.kind] ?? 'INSPECT';
  if (title) title.textContent = rec.title;
  if (body) body.textContent = rec.body;
  el.classList.remove('hidden');
  openId = rec.id ?? null;
  return true;
}

export function closeInspect() {
  const el = get('inspect');
  if (!el) return false;
  const wasOpen = !el.classList.contains('hidden');
  el.classList.add('hidden');
  openId = null;
  return wasOpen;
}

export function isInspectOpen() {
  const el = get('inspect');
  return !!el && !el.classList.contains('hidden');
}

export function openInspectId() {
  return openId;
}
