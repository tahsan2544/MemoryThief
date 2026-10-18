/**
 * MapScreen — the interactive city map (Phase 6).
 *
 * A full-screen canvas rendering of the *generated* layout: district blocks
 * tinted by identity, the Floodworks canal with its bridges, landmark pins
 * (discovered ones named, unknown ones shown as faint "?"), the memory
 * readings you hold, active case markers and your own position with heading.
 *
 * Interaction: hover pins to highlight, click a pin to open its read-out in
 * the side panel, click empty space to deselect. Tab / Esc / M close it.
 *
 * Pure presentation: main.js supplies a snapshot through `cbs.data()` and
 * owns open/close state; this module never touches gameplay systems.
 */

import { DISTRICTS } from '../config/districts.js';
import { LANDMARK_NAMES } from '../progression/discovery.js';

const $ = (id) => document.getElementById(id);

const PAD = 34;
const PIN_HIT = 16;
const LANDMARK_BLURB = {
  tower: 'Palisade Tower — freight lifts and a ledger that loses pages.',
  market: 'Charter Market — night stalls under acid rain.',
  station: 'Floodworks Station — last boards and a platform nobody schedules.',
  garden: 'Mnemonic Garden — where the ward’s memorials used to be.',
  archive: 'The Archive — the Underarchive annex behind its unbarred door.',
};

let cbs = null;
let open = false;
let hover = null; // pin id
let selected = null; // pin id
let pins = []; // screen-space hit list from the last draw
let lastDraw = 0;
const ctxCache = {};

function el(id) {
  return $(id);
}

function cssColor(hexNum, alpha = 1) {
  const n = hexNum & 0xffffff;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ------------------------------- drawing ------------------------------- */

function draw() {
  const canvas = el('map-canvas');
  const data = cbs?.data?.();
  if (!canvas || !data || !data.layout) return;
  const wrap = canvas.parentElement;
  const w = Math.max(320, wrap?.clientWidth ?? 800);
  const h = Math.max(280, wrap?.clientHeight ?? 560);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const { origin, extent, cells, canal, landmarks } = data.layout;
  const discovered = {
    districts: new Set(data.discovery?.districts ?? []),
    landmarks: new Set(data.discovery?.landmarks ?? []),
  };
  const span = w - PAD * 2;
  const spanY = h - PAD * 2;
  const sx = (x) => PAD + ((x - origin) / extent) * span;
  const sz = (z) => PAD + ((z - origin) / extent) * spanY;

  // backdrop
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#05080f';
  ctx.fillRect(0, 0, w, h);

  // district blocks (roads emerge as the gaps between them)
  for (const c of cells) {
    const known = discovered.districts.has(c.district);
    const info = DISTRICTS[c.district];
    const x0 = sx(c.x0 + data.layout.halfRoad * 0.4);
    const x1 = sx(c.x1 - data.layout.halfRoad * 0.4);
    const z0 = sz(c.z0 + data.layout.halfRoad * 0.4);
    const z1 = sz(c.z1 - data.layout.halfRoad * 0.4);
    ctx.fillStyle = info ? cssColor(info.neon, known ? 0.14 : 0.05) : 'rgba(90,110,160,0.06)';
    ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
    ctx.strokeStyle = info ? cssColor(info.neon, known ? 0.3 : 0.1) : 'rgba(90,110,160,0.14)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, z0 + 0.5, x1 - x0 - 1, z1 - z0 - 1);
  }

  // the canal band + bridge crossings
  if (canal) {
    const cz0 = sz(canal.z - canal.width / 2);
    const cz1 = sz(canal.z + canal.width / 2);
    const cx0 = sx(canal.x0);
    const cx1 = sx(canal.x1);
    ctx.fillStyle = 'rgba(46, 168, 196, 0.28)';
    ctx.fillRect(cx0, cz0, cx1 - cx0, Math.max(3, cz1 - cz0));
    ctx.fillStyle = 'rgba(255, 166, 64, 0.65)';
    for (const bx of canal.bridges ?? []) {
      const px = sx(bx);
      ctx.fillRect(px - 3, cz0 - 3, 6, Math.max(6, cz1 - cz0 + 6));
    }
  }

  // district labels at their core cells
  ctx.font = '600 11px "Cascadia Mono", Consolas, monospace';
  ctx.textAlign = 'center';
  for (const [id, info] of Object.entries(data.layout.districtInfo ?? {})) {
    const core = info.cells?.[Math.floor((info.cells?.length ?? 1) / 2)];
    if (!core) continue;
    const known = discovered.districts.has(id);
    ctx.fillStyle = known ? cssColor(DISTRICTS[id]?.neon ?? 0x9fb4ff, 0.9) : 'rgba(127, 141, 176, 0.35)';
    ctx.fillText((DISTRICTS[id]?.name ?? id).toUpperCase(), sx(core.cx), sz(core.cz));
  }

  pins = [];

  // memory readings you hold (violet rings)
  for (const s of data.sources ?? []) {
    if (!s.held) continue;
    const px = sx(s.x);
    const py = sz(s.z);
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(154, 123, 255, 0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(154, 123, 255, 0.35)';
    ctx.fill();
    pins.push({ id: `src:${s.id}`, kind: 'source', label: s.name, x: px, y: py, detail: s });
  }

  // case markers (amber diamonds)
  for (const m of data.markers ?? []) {
    const px = sx(m.x);
    const py = sz(m.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = 'rgba(255, 166, 64, 0.95)';
    ctx.fillRect(-5, -5, 10, 10);
    ctx.restore();
    pins.push({ id: `mk:${m.id}`, kind: 'marker', label: m.label || 'Case objective', x: px, y: py, detail: m });
  }

  // landmark pins: discovered = named amber, unknown = faint "?"
  for (const lm of landmarks ?? []) {
    const px = sx(lm.x);
    const py = sz(lm.z);
    const known = discovered.landmarks.has(lm.type);
    ctx.beginPath();
    ctx.moveTo(px, py - 8);
    ctx.lineTo(px + 7, py);
    ctx.lineTo(px, py + 8);
    ctx.lineTo(px - 7, py);
    ctx.closePath();
    if (known) {
      ctx.fillStyle = 'rgba(255, 196, 92, 0.95)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 236, 190, 0.9)';
    } else {
      ctx.fillStyle = 'rgba(127, 141, 176, 0.25)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(127, 141, 176, 0.55)';
    }
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (known) {
      ctx.fillStyle = 'rgba(255, 224, 170, 0.95)';
      ctx.font = '600 10px "Cascadia Mono", Consolas, monospace';
      ctx.fillText(LANDMARK_NAMES[lm.type] ?? lm.type.toUpperCase(), px, py + 22);
    }
    pins.push({
      id: `lm:${lm.type}`,
      kind: 'landmark',
      label: known ? (LANDMARK_NAMES[lm.type] ?? lm.type) : 'Unknown landmark',
      x: px,
      y: py,
      known,
      detail: lm,
    });
  }

  // hover / selection halos (drawn under the player)
  for (const p of pins) {
    if (p.id !== hover && p.id !== selected) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
    ctx.strokeStyle = p.id === selected ? 'rgba(99, 215, 255, 0.95)' : 'rgba(217, 228, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // the player: bright chevron pointing along facing
  const pl = data.player ?? { x: 0, z: 0, yaw: 0 };
  const px = sx(pl.x);
  const py = sz(pl.z);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(-(pl.yaw ?? 0)); // world yaw → canvas heading (z runs downward)
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(7, 8);
  ctx.lineTo(0, 4);
  ctx.lineTo(-7, 8);
  ctx.closePath();
  ctx.fillStyle = '#63d7ff';
  ctx.fill();
  ctx.strokeStyle = 'rgba(230, 250, 255, 0.95)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(px, py, 15, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(99, 215, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // counts read-out
  const counts = el('map-counts');
  if (counts) {
    const d = data.discovery ?? {};
    const dd = (d.districts ?? []).length;
    const dl = (d.landmarks ?? []).length;
    counts.textContent = `${dd}/5 DISTRICTS · ${dl}/5 LANDMARKS · ${pins.filter((p) => p.kind === 'source').length} READINGS`;
  }

  renderDetail();
  lastDraw = performance.now();
}

/* ------------------------------ interaction ---------------------------- */

function pinAt(clientX, clientY) {
  const canvas = el('map-canvas');
  if (!canvas) return null;
  const r = canvas.getBoundingClientRect();
  const x = clientX - r.left;
  const y = clientY - r.top;
  let best = null;
  let bestD = PIN_HIT;
  for (const p of pins) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

function renderDetail() {
  const box = el('map-detail');
  if (!box) return;
  const p = pins.find((x) => x.id === selected);
  if (!p) {
    box.innerHTML =
      '<div class="map-detail-kicker">LEGEND</div>' +
      '<ul class="map-legend">' +
      '<li><i class="lg lg-player"></i>You are here</li>' +
      '<li><i class="lg lg-landmark"></i>Landmark — discovered</li>' +
      '<li><i class="lg lg-unknown"></i>Landmark — not visited yet</li>' +
      '<li><i class="lg lg-reading"></i>Memory reading held</li>' +
      '<li><i class="lg lg-case"></i>Case objective</li>' +
      '</ul>' +
      '<p class="map-note">Walk close to a landmark to put its name on the map.</p>';
    return;
  }
  if (p.kind === 'landmark') {
    box.innerHTML =
      '<div class="map-detail-kicker">LANDMARK</div>' +
      `<div class="map-detail-title">${p.known ? p.label : 'UNKNOWN'}</div>` +
      `<p class="map-detail-body">${p.known ? (LANDMARK_BLURB[p.detail.type] ?? '') : 'You have not been close enough to chart this pin.'}</p>`;
  } else if (p.kind === 'source') {
    box.innerHTML =
      '<div class="map-detail-kicker">MEMORY READING</div>' +
      `<div class="map-detail-title">${p.label}</div>` +
      '<p class="map-detail-body">Recorded in your glove. Return to the site to replay it.</p>';
  } else {
    box.innerHTML =
      '<div class="map-detail-kicker">CASE OBJECTIVE</div>' +
      `<div class="map-detail-title">${p.label}</div>` +
      '<p class="map-detail-body">An active lead on the Venn case. The amber marker also shows on the street.</p>';
  }
}

function bindEvents() {
  const canvas = el('map-canvas');
  if (!canvas || canvas.dataset.bound) return;
  canvas.dataset.bound = '1';
  canvas.addEventListener('mousemove', (e) => {
    const p = pinAt(e.clientX, e.clientY);
    const id = p?.id ?? null;
    if (id !== hover) {
      hover = id;
      draw();
    }
    const tip = el('map-tip');
    if (tip) {
      if (p) {
        tip.textContent = p.label;
        tip.classList.remove('hidden');
        const r = canvas.getBoundingClientRect();
        tip.style.left = `${p.x + 14}px`;
        tip.style.top = `${p.y - 10}px`;
      } else tip.classList.add('hidden');
    }
    canvas.style.cursor = p ? 'pointer' : 'default';
  });
  canvas.addEventListener('mouseleave', () => {
    hover = null;
    el('map-tip')?.classList.add('hidden');
    draw();
  });
  canvas.addEventListener('click', (e) => {
    const p = pinAt(e.clientX, e.clientY);
    selected = p?.id ?? null;
    draw();
  });
}

/* --------------------------------- api --------------------------------- */

export function initMapScreen(callbacks) {
  cbs = callbacks;
  bindEvents();
  el('map-close')?.addEventListener('click', () => cbs?.onClose?.());
  return { open: openMap, close: closeMap };
}

export function openMap() {
  if (open) return false;
  const root = el('map');
  if (!root) return false;
  open = true;
  hover = null;
  selected = null;
  root.classList.remove('hidden');
  bindEvents();
  draw();
  return true;
}

export function closeMap() {
  if (!open) return false;
  open = false;
  el('map')?.classList.add('hidden');
  el('map-tip')?.classList.add('hidden');
  return true;
}

export function isMapOpen() {
  return open;
}

/** Frame tick while open — keeps the player chevron live (cheap redraw). */
export function updateMap(now = performance.now()) {
  if (!open) return;
  if (now - lastDraw < 200) return;
  draw();
}

/** Tab / Esc / M close the map; true when the key was consumed. */
export function mapHandleKey(code) {
  if (!open) return false;
  if (code === 'Tab' || code === 'Escape' || code === 'KeyM') {
    closeMap();
    cbs?.onClose?.();
    return true;
  }
  return true; // while open, no other key falls through to the world
}

export function mapSnapshot() {
  const canvas = el('map-canvas');
  return {
    open,
    hover,
    selected,
    counts: el('map-counts')?.textContent ?? '',
    canvas: canvas ? { w: canvas.clientWidth, h: canvas.clientHeight } : null,
    pins: pins.map((p) => ({ id: p.id, kind: p.kind, label: p.label, x: Math.round(p.x), y: Math.round(p.y), known: !!p.known })),
    detailTitle: el('map-detail')?.querySelector('.map-detail-title')?.textContent ?? null,
    player: (() => {
      const data = cbs?.data?.();
      if (!data?.layout || !data.player) return null;
      const { origin, extent } = data.layout;
      const w = (canvas?.clientWidth ?? 0) - PAD * 2;
      const h = (canvas?.clientHeight ?? 0) - PAD * 2;
      return {
        x: Math.round(PAD + ((data.player.x - origin) / extent) * w),
        y: Math.round(PAD + ((data.player.z - origin) / extent) * h),
        world: [Math.round(data.player.x), Math.round(data.player.z)],
      };
    })(),
  };
}
