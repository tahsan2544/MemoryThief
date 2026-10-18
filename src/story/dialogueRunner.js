/**
 * DialogueRunner — the choice card Phase 5 conversations render into.
 *
 * Pure DOM like the rest of the UI shell. One node is on screen at a time:
 *
 *   open(node)          → shows body + optional choices, fires node.onEnter
 *   choose(index)       → applies the choice's effects, then shows its reply
 *                         (or closes when there is no reply)
 *   handleKey(code)     → Digit1..3 pick, E/Esc leave (Esc always works)
 *
 * Effects never live here: they are handed to the onEffect callback the game
 * installs at init, so StoryState stays the single owner of story truth.
 */

const cache = {};
const get = (id) => (cache[id] ??= document.getElementById(id));

let onEffect = () => {};
let current = null; // { node, phase: 'ask' | 'reply' }
let onClose = () => {};

export function initDialogue(effects = {}) {
  if (effects.onEffect) onEffect = effects.onEffect;
  if (effects.onClose) onClose = effects.onClose;
}

function applyEffects(list) {
  for (const fx of list ?? []) {
    try {
      onEffect(fx);
    } catch (err) {
      console.error('[story] effect failed:', err);
    }
  }
}

function renderChoices() {
  const box = get('dialogue-choices');
  const hint = get('dialogue-hint');
  if (!box) return;
  box.innerHTML = '';
  const choices = current?.phase === 'ask' ? current.node.choices ?? [] : [];

  for (let i = 0; i < choices.length; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dialogue-choice';
    btn.innerHTML = `<kbd>${i + 1}</kbd><span>${choices[i].label}</span>`;
    btn.addEventListener('click', () => choose(i));
    box.appendChild(btn);
  }

  if (hint) {
    hint.innerHTML = choices.length
      ? `<kbd>1</kbd>–<kbd>${choices.length}</kbd> choose · <kbd>Esc</kbd> step away`
      : `<kbd>E</kbd> or <kbd>Esc</kbd> close`;
  }
}

function paint() {
  const el = get('dialogue');
  if (!el || !current) return;
  const { node: n, phase } = current;
  get('dialogue-kicker').textContent = n.kicker ?? 'CONVERSATION';
  get('dialogue-title').textContent = n.title ?? (n.speaker ? `${String(n.speaker).toUpperCase()} — SPEAKING` : 'CONVERSATION');
  get('dialogue-body').textContent = phase === 'reply' ? current.reply.body : n.body;
  renderChoices();
}

/** Open a dialogue node (fires its onEnter effects exactly as displayed). */
export function openDialogue(n) {
  const el = get('dialogue');
  if (!el || !n) return false;
  current = { node: n, phase: 'ask', reply: null };
  applyEffects(n.onEnter);
  paint();
  el.classList.remove('hidden');
  return true;
}

export function isDialogueOpen() {
  const el = get('dialogue');
  return !!el && !el.classList.contains('hidden') && !!current;
}

export function closeDialogue() {
  const el = get('dialogue');
  const was = isDialogueOpen();
  if (el) el.classList.add('hidden');
  current = null;
  if (was) onClose();
  return was;
}

/** Pick a choice by index; returns the reply text shown, or null (closed). */
export function choose(index) {
  if (!current || current.phase !== 'ask') return null;
  const choices = current.node.choices ?? [];
  const c = choices[index];
  if (!c) return null;
  applyEffects(c.effects);
  if (c.reply && c.reply.body) {
    current.phase = 'reply';
    current.reply = c.reply;
    applyEffects(c.reply.onEnter);
    paint();
    return c.reply.body;
  }
  closeDialogue();
  return null;
}

/** @returns {'handled'|'unhandled'} — the game routes keys here while open. */
export function handleKey(code) {
  if (!isDialogueOpen()) return 'unhandled';
  if (code === 'Digit1') {
    choose(0);
    return 'handled';
  }
  if (code === 'Digit2') {
    choose(1);
    return 'handled';
  }
  if (code === 'Digit3') {
    choose(2);
    return 'handled';
  }
  if (code === 'KeyE') {
    // E only leaves once the conversation has no pending questions
    if (current.phase === 'ask' && (current.node.choices ?? []).length) return 'handled';
    closeDialogue();
    return 'handled';
  }
  if (code === 'Escape') {
    closeDialogue();
    return 'handled';
  }
  return 'unhandled';
}

/** Test/read-out snapshot of what is on screen right now. */
export function dialogueSnapshot() {
  const el = get('dialogue');
  const shown = isDialogueOpen();
  return {
    open: shown,
    kicker: get('dialogue-kicker')?.textContent ?? '',
    title: get('dialogue-title')?.textContent ?? '',
    body: get('dialogue-body')?.textContent ?? '',
    phase: current?.phase ?? null,
    choices: shown && current?.phase === 'ask' ? (current.node.choices ?? []).map((c) => c.label) : [],
    hidden: !!el?.classList.contains('hidden'),
  };
}
