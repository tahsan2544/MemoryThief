/**
 * PauseMenu — the Phase 6 pause surface.
 *
 * Resume / Save / Load / Settings / New game, a live checkpoint status
 * line, and — for anything destructive — a deliberate two-step confirmation:
 * the first press opens the confirm box, only the second press acts.
 *
 * Presentation only: every action goes out through callbacks wired in
 * main.js, so this module can never reset the world by itself.
 */

const $ = (id) => document.getElementById(id);

let cbs = null;
let open = false;
let pending = null; // 'new' while the confirm box is showing
let openedAt = 0; // debounce: Esc that OPENS the menu must not also close it

function renderStatus() {
  const el = $('pause-status');
  if (!el || !cbs?.status) return;
  const s = cbs.status();
  if (s.exists && s.savedAt) {
    const t = new Date(s.savedAt);
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    el.textContent = `Checkpoint saved · today ${hh}:${mm}`;
    el.classList.remove('none');
  } else {
    el.textContent =
      s.status === 'corrupt' ? 'Checkpoint unreadable — it will be overwritten by the next save.'
      : s.status === 'outdated' ? 'Checkpoint is from an older build — start a new game to clear it.'
      : s.status === 'future' ? 'Checkpoint is from a newer build — it cannot be loaded here.'
      : 'No checkpoint yet — Save Game writes one.';
    el.classList.toggle('none', s.status === 'missing');
  }
  const load = $('pause-load');
  if (load) load.disabled = !s.exists;
}

function showConfirm(kind) {
  pending = kind;
  const box = $('pause-confirm');
  if (!box) return;
  box.classList.remove('hidden');
  const msg = $('pause-confirm-msg');
  if (msg) {
    msg.textContent =
      kind === 'new'
        ? 'New game erases the saved game — memories, the case, upgrades and your position. This cannot be undone.'
        : 'Erase the checkpoint?';
  }
  box.dataset.confirm = kind;
}

function hideConfirm() {
  pending = null;
  const box = $('pause-confirm');
  box?.classList.add('hidden');
  if (box) delete box.dataset.confirm;
}

/* --------------------------------- api --------------------------------- */

export function initPauseMenu(callbacks) {
  cbs = callbacks;
  const on = (id, fn) => $(id)?.addEventListener('click', fn);

  on('pause-resume', () => cbs?.onResume?.());
  on('pause-save', () => {
    cbs?.onSave?.();
    renderStatus();
  });
  on('pause-load', () => cbs?.onLoad?.());
  on('pause-settings', () => cbs?.onSettings?.());
  on('pause-new', () => showConfirm('new'));
  on('pause-confirm-cancel', () => hideConfirm());
  on('pause-confirm-accept', () => {
    const kind = pending;
    hideConfirm();
    if (kind === 'new') cbs?.onNewGame?.();
  });
  return { open: openPause, close: closePause };
}

export function openPause() {
  if (open) return false;
  const root = $('pause');
  if (!root) return false;
  open = true;
  openedAt = performance.now();
  hideConfirm();
  root.classList.remove('hidden');
  renderStatus();
  return true;
}

export function closePause() {
  if (!open) return false;
  open = false;
  hideConfirm();
  $('pause')?.classList.add('hidden');
  return true;
}

export function isPauseOpen() {
  return open;
}

export function refreshPause() {
  if (open) renderStatus();
}

/** P / Esc close; while open no other key falls through. */
export function pauseHandleKey(code) {
  if (!open) return false;
  if (code === 'KeyP' || code === 'Escape') {
    // a just-opened menu swallows the very Esc that created it (the browser
    // releases pointer lock and the keydown arrives right behind it)
    if (performance.now() - openedAt < 300) return true;
    // Esc at the confirm box cancels the confirm, not the menu
    if (pending) {
      hideConfirm();
      return true;
    }
    closePause();
    cbs?.onClose?.();
    return true;
  }
  return true;
}

export function pauseSnapshot() {
  const box = $('pause-confirm');
  return {
    open,
    confirmVisible: !!box && !box.classList.contains('hidden'),
    confirmKind: box && !box.classList.contains('hidden') ? (box.dataset.confirm ?? null) : null,
    status: $('pause-status')?.textContent ?? '',
    buttons: [...($('pause')?.querySelectorAll('button') ?? [])]
      .filter((b) => !b.classList.contains('hidden'))
      .map((b) => ({ id: b.id, label: b.textContent.trim(), disabled: !!b.disabled })),
    loadDisabled: !!$('pause-load')?.disabled,
  };
}
