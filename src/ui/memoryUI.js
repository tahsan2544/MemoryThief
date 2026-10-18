/**
 * Memory Journal + extraction channel HUD.
 *
 * The journal is the reconstruction interface: the list of everything the
 * glove has recorded, the recorded information and clues of the selected
 * fragment, its reliability warning, any contradiction the player can now
 * weigh, and the activation control for replaying a memory at its site.
 * Collected fragments persist because the manager owns the state — closing
 * and reopening this panel only re-renders it.
 *
 * The extraction channel is the small ring HUD shown while the glove is
 * reading a source; movement or Esc cancels it.
 */

const cache = {};
const get = (id) => (cache[id] ??= document.getElementById(id));

const RELIABILITY_LABEL = {
  stable: 'STABLE RECORD',
  suspect: 'SUSPECT — CONTEXT OMITTED',
  manipulated: 'MANIPULATED — DO NOT TRUST',
};
const RELIABILITY_CLASS = {
  stable: 'rel-stable',
  suspect: 'rel-suspect',
  manipulated: 'rel-manipulated',
};

let selectedId = null;
let open = false;
let lastManager = null;
let siteRangeCache = null; // { fragmentId, inRange, sourceName }
let callbacks = { onActivate: null, onDeduce: null, onSelect: null };

export function initMemoryUI(cbs = {}) {
  callbacks = { ...callbacks, ...cbs };
  get('journal-close')?.addEventListener('click', () => closeJournal());
  return { closeJournal };
}

/**
 * Proximity of the selected fragment's recording site, pushed by the game
 * loop so the activate button always reflects the real world. Re-renders
 * only when the answer actually flips.
 */
export function setSiteRange(range) {
  const prev = siteRangeCache;
  const changed =
    (prev?.fragmentId ?? null) !== (range?.fragmentId ?? null) ||
    (prev?.inRange ?? false) !== (range?.inRange ?? false);
  siteRangeCache = range;
  if (open && changed && lastManager) renderJournal(lastManager, { siteRange: range });
}

export function isJournalOpen() {
  return open;
}

export function journalSelection() {
  return selectedId;
}

export function openJournal(manager, { selectId = null } = {}) {
  const el = get('journal');
  if (!el) return false;
  open = true;
  lastManager = manager;
  const list = manager.list();
  if (selectId && list.some((f) => f.id === selectId)) selectedId = selectId;
  else if (!list.some((f) => f.id === selectedId)) selectedId = list[0]?.id ?? null;
  renderJournal(manager, { siteRange: siteRangeCache });
  el.classList.remove('hidden');
  return true;
}

export function closeJournal() {
  const el = get('journal');
  if (!el) return false;
  const wasOpen = open;
  open = false;
  el.classList.add('hidden');
  return wasOpen;
}

export function journalSelect(id, manager) {
  selectedId = id;
  if (open) renderJournal(manager, { siteRange: siteRangeCache });
  callbacks.onSelect?.(id);
}

/** ↑/↓ select, Enter activates, 1/2 weigh a contradiction. */
export function journalHandleKey(code, manager) {
  if (!open) return false;
  const list = manager.list();
  if (!list.length) return code === 'Enter'; // swallow Enter in the empty state
  const idx = Math.max(0, list.findIndex((f) => f.id === selectedId));
  if (code === 'ArrowDown') {
    selectedId = list[(idx + 1) % list.length].id;
    renderJournal(manager, { siteRange: siteRangeCache });
    return true;
  }
  if (code === 'ArrowUp') {
    selectedId = list[(idx - 1 + list.length) % list.length].id;
    renderJournal(manager, { siteRange: siteRangeCache });
    return true;
  }
  if (code === 'Enter') {
    callbacks.onActivate?.(selectedId);
    return true;
  }
  if (code === 'Digit1' || code === 'Digit2') {
    const pair = manager
      .activeContradictions()
      .find((p) => p.a === selectedId || p.b === selectedId);
    if (!pair) return false;
    const believedId = code === 'Digit1' ? pair.a : pair.b;
    callbacks.onDeduce?.(pair.id, believedId);
    return true;
  }
  return false;
}

/**
 * Re-render both panes.
 * @param {MemoryManager} manager
 * @param {{siteRange?: {fragmentId:string, inRange:boolean, sourceName:string}}} opts
 */
export function renderJournal(manager, opts = {}) {
  const listEl = get('journal-list');
  const detailEl = get('journal-detail');
  const countEl = get('journal-count');
  if (!listEl || !detailEl) return;

  const list = manager.list();
  if (countEl) countEl.textContent = `${manager.count()} / ${manager.total()}`;

  // ------------------------------ list pane -------------------------------
  listEl.innerHTML = '';
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'journal-empty';
    empty.textContent =
      'NO FRAGMENTS RECOVERED. Walk up to a person or a marked object and ' +
      'press E to let the glove read them.';
    listEl.appendChild(empty);
  }
  for (const f of list) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'journal-item' + (f.id === selectedId ? ' selected' : '');
    item.innerHTML =
      `<span class="rel-dot ${RELIABILITY_CLASS[f.reliability]}"></span>` +
      `<span class="journal-item-body">` +
      `<b>${escapeHtml(f.title)}</b>` +
      `<i>${escapeHtml(f.sourceName)} · ${escapeHtml(f.district)}</i>` +
      `</span>` +
      `<span class="journal-item-flag">${manager.isReconstructed(f.id) ? 'REPLAYED' : 'NEW'}</span>`;
    item.addEventListener('click', () => journalSelect(f.id, manager));
    listEl.appendChild(item);
  }

  // ----------------------------- detail pane ------------------------------
  const f = list.find((x) => x.id === selectedId) ?? list[0] ?? null;
  detailEl.innerHTML = '';
  if (!f) {
    detailEl.innerHTML = '<div class="journal-empty">Select a fragment to examine its clues.</div>';
    return;
  }
  selectedId = f.id;

  const section = (label, cls = '') => {
    const div = document.createElement('div');
    div.className = `journal-section ${cls}`;
    const h = document.createElement('div');
    h.className = 'journal-section-label';
    h.textContent = label;
    div.appendChild(h);
    detailEl.appendChild(div);
    return div;
  };

  const head = section('');
  head.innerHTML =
    `<div class="journal-detail-title">${escapeHtml(f.title)}</div>` +
    `<div class="journal-detail-meta">SOURCE: ${escapeHtml(f.sourceName)} · ${escapeHtml(f.district).toUpperCase()}` +
    ` · SIGNATURE: ${escapeHtml(String(f.effect ?? 'unknown')).toUpperCase()}</div>`;

  const rel = section('RELIABILITY', `journal-reliability ${RELIABILITY_CLASS[f.reliability]}`);
  rel.innerHTML =
    `<div class="rel-line">${RELIABILITY_LABEL[f.reliability] ?? f.reliability.toUpperCase()}</div>` +
    `<div class="rel-note">${escapeHtml(f.reliabilityNote ?? '')}</div>`;

  const rec = section('RECORDED INFORMATION');
  const recP = document.createElement('div');
  recP.className = 'journal-recorded';
  recP.textContent = f.recorded;
  rec.appendChild(recP);

  const clues = section('CLUES');
  const ul = document.createElement('ul');
  ul.className = 'journal-clues';
  for (const c of f.clues ?? []) {
    const li = document.createElement('li');
    li.textContent = c;
    ul.appendChild(li);
  }
  clues.appendChild(ul);

  // contradiction (only when both legs are held)
  for (const pair of manager.activeContradictions()) {
    if (pair.a !== f.id && pair.b !== f.id) continue;
    const box = section('CONTRADICTION DETECTED', 'journal-contradiction');
    const a = manager.snapshot().collected.find((c) => c.id === pair.a);
    const b = manager.snapshot().collected.find((c) => c.id === pair.b);
    box.innerHTML = `<div class="con-detail">${escapeHtml(pair.detail)}</div>`;
    const row = document.createElement('div');
    row.className = 'con-rows';
    for (const [key, rec2, digit] of [
      ['a', a, '1'],
      ['b', b, '2'],
    ]) {
      const believed = manager.getDeduction(pair.id) === rec2.id;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'con-tag' + (believed ? ' believed' : '');
      btn.innerHTML = `<kbd>${digit}</kbd> ${escapeHtml(rec2.title)} — ${escapeHtml(rec2.source)}` + (believed ? ' ✓ YOUR READ' : '');
      btn.addEventListener('click', () => callbacks.onDeduce?.(pair.id, rec2.id));
      row.appendChild(btn);
      void key;
    }
    box.appendChild(row);
    const note = document.createElement('div');
    note.className = 'con-note';
    note.textContent = manager.getDeduction(pair.id)
      ? 'Deduction recorded. The journal keeps your read of it.'
      : 'Weigh the accounts: tag the record you distrust. Neither memory is proof.';
    box.appendChild(note);
  }

  // consequences
  const cons = (f.consequences ?? []).filter((c) => c.note);
  if (cons.length) {
    const box = section('WHAT THIS FRAGMENT CHANGES');
    const done = manager.isReconstructed(f.id);
    for (const c of cons) {
      const line = document.createElement('div');
      line.className = 'journal-consequence' + (done ? ' confirmed' : '');
      line.textContent = (done ? '✓ ' : '· ') + c.note;
      box.appendChild(line);
    }
  }

  // reconstruction control
  const recon = section('RECONSTRUCTION', 'journal-recon');
  const replayed = manager.isReconstructed(f.id);
  const range = opts.siteRange;
  const inRange = range?.fragmentId === f.id && range.inRange;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'journal-activate' + (inRange ? '' : ' disabled');
  btn.textContent = replayed
    ? inRange
      ? '↻ Replay reconstruction (Enter)'
      : `↻ Replay — return to ${f.sourceName}`
    : inRange
      ? '▶ Activate reconstruction (Enter)'
      : `▶ Activate — return to ${f.sourceName}`;
  btn.addEventListener('click', () => callbacks.onActivate?.(f.id));
  recon.appendChild(btn);
  const reconNote = document.createElement('div');
  reconNote.className = 'recon-note';
  reconNote.textContent = replayed
    ? 'Replays are free; consequences fire only the first time.'
    : 'Consequences (doors, clues, abilities) apply when the memory plays at its site.';
  recon.appendChild(reconNote);
}

/* ------------------------- extraction channel --------------------------- */

let extracting = false;

export function startExtract(label, effect = '') {
  const el = get('extract');
  const labelEl = get('extract-label');
  if (!el) return false;
  extracting = true;
  if (labelEl) labelEl.textContent = `READING — ${label.toUpperCase()}`;
  // the fragment's signature drives a distinct channel animation
  el.dataset.fx = effect ?? '';
  setExtractProgress(0);
  el.classList.remove('hidden');
  return true;
}

export function setExtractProgress(t) {
  const fill = get('extract-fill');
  if (fill) fill.style.setProperty('--p', String(Math.max(0, Math.min(1, t))));
}

export function endExtract() {
  const el = get('extract');
  if (!el) return false;
  const was = extracting;
  extracting = false;
  el.dataset.fx = '';
  el.classList.add('hidden');
  return was;
}

export function isExtracting() {
  return extracting;
}

/* -------------------------------- utils --------------------------------- */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
