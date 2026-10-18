/**
 * EquipmentScreen — inventory & equipment (Phase 6).
 *
 * Two columns, one visual language with the rest of the interface:
 *   1. THE GLOVE  — its live stats, with any upgraded value highlighted
 *   2. UPGRADES   — the four purchasable improvements, each explaining what
 *                   it does in plain numbers, with its cost and a buy button
 *
 * Presentation only: data arrives through `cbs.data()` (motes, effects,
 * ownership), purchases go out through `cbs.onBuy(id)`.
 */

import { UPGRADES } from '../progression/upgrades.js';

const $ = (id) => document.getElementById(id);

let cbs = null;
let open = false;

/** Base → current stat rows; `base` doubles as the "unchanged" display. */
function statRows(fx) {
  const rows = [
    { label: 'Extraction channel', base: '1.30 s', now: `${(1.3 * fx.channelScale).toFixed(2)} s`, up: fx.channelScale < 1 },
    { label: 'Extraction noise', base: '12 m radius', now: `${Math.round(12 * fx.noiseScale)} m radius`, up: fx.noiseScale < 1 },
    { label: 'Replay range', base: '14 m', now: `${fx.reconRange} m`, up: fx.reconRange > 14 },
    { label: 'Sight duration', base: '16 s', now: `${Math.round(16 * fx.sightDurationScale)} s`, up: fx.sightDurationScale > 1 },
    { label: 'Sight recharge', base: '45 s', now: `${Math.round(45 * fx.sightCooldownScale)} s`, up: fx.sightCooldownScale < 1 },
  ];
  return rows;
}

function render() {
  const root = $('gear');
  const data = cbs?.data?.();
  if (!root || !data) return;

  const motesEl = $('gear-motes');
  if (motesEl) {
    motesEl.innerHTML =
      `<b>${data.motes.available}</b> AVAILABLE` +
      `<span class="gear-motes-earned">${data.motes.earned} earned · ${data.motes.spent} spent</span>`;
  }
  const how = $('gear-how');
  if (how) how.textContent = 'Motes: +4 per reconstructed memory.';

  // 1 — the glove
  const glove = $('gear-glove');
  if (glove) {
    glove.innerHTML = '';
    const name = document.createElement('div');
    name.className = 'gear-item-name';
    name.textContent = 'MEMORY-GLOVE MK II';
    glove.appendChild(name);
    const sub = document.createElement('div');
    sub.className = 'gear-item-sub';
    sub.textContent = 'Salvage rig — reads the residue people leave in places.';
    glove.appendChild(sub);
    for (const r of statRows(data.effects)) {
      const row = document.createElement('div');
      row.className = `gear-stat${r.up ? ' up' : ''}`;
      row.innerHTML = `<span>${r.label}</span><b>${r.now}</b><i>${r.up ? 'upgraded' : r.base}</i>`;
      glove.appendChild(row);
    }
  }

  // 2 — upgrades
  const grid = $('gear-upgrades');
  if (grid) {
    grid.innerHTML = '';
    for (const u of UPGRADES) {
      const owned = data.owned.includes(u.id);
      const afford = data.motes.available >= u.cost;
      const card = document.createElement('div');
      card.className = `gear-upgrade${owned ? ' owned' : ''}`;
      card.dataset.upgrade = u.id;
      card.innerHTML =
        `<div class="gear-upgrade-head"><span class="gear-upgrade-tag">${u.tagline}</span>` +
        `<span class="gear-upgrade-cost">${owned ? 'OWNED' : `${u.cost} ◆`}</span></div>` +
        `<div class="gear-upgrade-name">${u.name}</div>` +
        `<div class="gear-upgrade-line">${u.line}</div>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gear-buy';
      btn.dataset.buy = u.id;
      btn.textContent = owned ? 'Installed' : `Install — ${u.cost} ◆`;
      btn.disabled = owned || !afford;
      if (!owned && !afford) btn.title = `Needs ${u.cost} motes (${data.motes.available} available)`;
      btn.addEventListener('click', () => cbs?.onBuy?.(u.id));
      card.appendChild(btn);
      grid.appendChild(card);
    }
  }
}

/* --------------------------------- api --------------------------------- */

export function initEquipmentScreen(callbacks) {
  cbs = callbacks;
  $('gear-close')?.addEventListener('click', () => cbs?.onClose?.());
  return { open: openEquipment, close: closeEquipment };
}

export function openEquipment() {
  if (open) return false;
  const root = $('gear');
  if (!root) return false;
  open = true;
  root.classList.remove('hidden');
  render();
  return true;
}

export function closeEquipment() {
  if (!open) return false;
  open = false;
  $('gear')?.classList.add('hidden');
  return true;
}

export function isEquipmentOpen() {
  return open;
}

export function renderEquipment() {
  if (open) render();
}

/** I / Esc close; while open no other key falls through. */
export function equipmentHandleKey(code) {
  if (!open) return false;
  if (code === 'KeyI' || code === 'Escape') {
    closeEquipment();
    cbs?.onClose?.();
    return true;
  }
  return true;
}

export function equipmentSnapshot() {
  const data = cbs?.data?.();
  return {
    open,
    motes: data?.motes ?? null,
    owned: data?.owned ?? [],
    effects: data?.effects ?? null,
    buyDisabled: [...document.querySelectorAll('.gear-buy')].map((b) => ({ id: b.dataset.buy, disabled: b.disabled })),
    statUpgraded: [...document.querySelectorAll('.gear-stat.up b')].map((b) => b.textContent),
    visible: !$('gear')?.classList.contains('hidden'),
  };
}
