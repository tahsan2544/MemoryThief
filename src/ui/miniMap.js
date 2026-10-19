/**
 * MiniMap — the live corner radar (replaces the full-screen map as the
 * day-to-day navigation tool).
 *
 * A small north-up canvas showing the streets and blocks AROUND YOU: district
 * blocks tinted by identity, the Floodworks canal and its bridges, landmark
 * pins (discovered ones named nearby, unknown ones faint), memory readings
 * you hold. You are the chevron in the middle with a facing cone.
 *
 * Navigation conventions this radar follows (widely used and researched —
 * fixed north-up with a compass mark, and off-screen markers clamped to the
 * frame edge to show where things are that you cannot see):
 *  - speed-linked zoom: 120 m window at a stroll, opening to 150 m at a
 *    sprint, smoothed across redraws so it never pops;
 *  - edge pips: every landmark / held reading outside the window becomes a
 *    small arrow on the frame pointing at it;
 *  - N / S / W / E marks, with N called out in amber so "north-up" is a
 *    visible fact, not an assumption.
 *
 * It deliberately does NOT show people: guards and patrols stay off the
 * radar, so stealth still has to be played by eye and by the awareness chip.
 *
 * Pure presentation: main.js supplies the same snapshot the full map uses
 * (`mapData()`) and owns the visibility toggle (Tab).
 */

import { DISTRICTS } from '../config/districts.js';
import { LANDMARK_NAMES } from '../progression/discovery.js';

const $ = (id) => document.getElementById(id);

/** Half-width of the world window, in metres (walk / sprint ends). */
const RANGE_WALK = 120;
const RANGE_SPRINT = 150;
const REDRAW_MS = 120; // ~8 Hz is plenty for a radar and costs nothing

let cbs = null;
let visible = true;
let lastDraw = 0;
let lastPlayer = null; // { x, z } of the previous draw (smoke reads this)
let range = RANGE_WALK; // smoothed live zoom
let pins = {
  onmap: { landmarks: 0, readings: 0 },
  offscreen: { landmarks: 0, readings: 0 },
};

function cssColor(hexNum, alpha = 1) {
  const n = hexNum & 0xffffff;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Where the frame border sits along a direction from the centre (canvas px). */
function edgePoint(dx, dz, size, margin = 11) {
  const half = size / 2 - margin;
  const ax = Math.abs(dx);
  const az = Math.abs(dz);
  const t = Math.min(ax > 0.01 ? half / ax : Infinity, az > 0.01 ? half / az : Infinity);
  return { x: size / 2 + dx * t, y: size / 2 + dz * t, ang: Math.atan2(dz, dx) };
}

/** Outward arrow on the frame — "there is something that way, off the map". */
function drawPip(ctx, x, y, ang, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(5.5, 0);
  ctx.lineTo(-3, 3.6);
  ctx.lineTo(-3, -3.6);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function draw() {
  const canvas = $('minimap-canvas');
  const data = cbs?.data?.();
  if (!canvas || !data || !data.layout || !data.player) return;

  const size = Math.max(140, Math.round(canvas.parentElement?.clientWidth ?? 184));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(size * dpr)) {
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const { origin, extent, cells, canal, landmarks } = data.layout;
  const px = data.player.x;
  const pz = data.player.z;

  // speed-linked zoom: 120 m at a stroll, opening to 150 m at a sprint —
  // smoothed across redraws so the window never pops
  const spd = data.player.speed ?? 0;
  const target = RANGE_WALK + Math.min(1, Math.max(0, (spd - 1.2) / 3.8)) * (RANGE_SPRINT - RANGE_WALK);
  range += (target - range) * 0.18;

  // world -> canvas: north-up, player centred, `range` metres across
  const scale = size / (range * 2);
  const sx = (x) => size / 2 + (x - px) * scale;
  const sz = (z) => size / 2 + (z - pz) * scale;

  const discovered = {
    districts: new Set(data.discovery?.districts ?? []),
    landmarks: new Set(data.discovery?.landmarks ?? []),
  };

  // backdrop
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(5, 8, 15, 0.92)';
  ctx.fillRect(0, 0, size, size);

  const halfRoad = data.layout.halfRoad ?? 8;

  // district blocks (the road network reads as the gaps between them)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, size, size);
  ctx.clip();
  for (const c of cells) {
    if (c.x1 < px - range || c.x0 > px + range || c.z1 < pz - range || c.z0 > pz + range) continue;
    const known = discovered.districts.has(c.district);
    const info = DISTRICTS[c.district];
    const x0 = sx(c.x0 + halfRoad * 0.4);
    const x1 = sx(c.x1 - halfRoad * 0.4);
    const z0 = sz(c.z0 + halfRoad * 0.4);
    const z1 = sz(c.z1 - halfRoad * 0.4);
    ctx.fillStyle = info ? cssColor(info.neon, known ? 0.2 : 0.07) : 'rgba(90,110,160,0.08)';
    ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
    ctx.strokeStyle = info ? cssColor(info.neon, known ? 0.42 : 0.14) : 'rgba(90,110,160,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, z0 + 0.5, x1 - x0 - 1, z1 - z0 - 1);
  }

  // the canal band + bridge crossings
  if (canal && canal.z + canal.width > pz - range && canal.z - canal.width < pz + range) {
    const cz0 = sz(canal.z - canal.width / 2);
    const cz1 = sz(canal.z + canal.width / 2);
    const cx0 = sx(canal.x0);
    const cx1 = sx(canal.x1);
    ctx.fillStyle = 'rgba(46, 168, 196, 0.32)';
    ctx.fillRect(cx0, cz0, cx1 - cx0, Math.max(2, cz1 - cz0));
    ctx.fillStyle = 'rgba(255, 166, 64, 0.7)';
    for (const bx of canal.bridges ?? []) {
      const bxp = sx(bx);
      ctx.fillRect(bxp - 2, cz0 - 2, 4, Math.max(4, cz1 - cz0 + 4));
    }
  }

  // memory readings you hold (violet rings — violet pips when off-window)
  const half = size / 2;
  pins = {
    onmap: { landmarks: 0, readings: 0 },
    offscreen: { landmarks: 0, readings: 0 },
  };
  for (const s of data.sources ?? []) {
    if (!s.held) continue;
    const rx = sx(s.x);
    const rz = sz(s.z);
    const dx = rx - half;
    const dz = rz - half;
    if (Math.abs(dx) > half - 2 || Math.abs(dz) > half - 2) {
      const e = edgePoint(dx, dz, size, 11);
      drawPip(ctx, e.x, e.y, e.ang, 'rgba(154, 123, 255, 0.95)');
      pins.offscreen.readings++;
      continue;
    }
    pins.onmap.readings++;
    ctx.beginPath();
    ctx.arc(rx, rz, 3.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(154, 123, 255, 0.95)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(154, 123, 255, 0.35)';
    ctx.fill();
  }

  // landmark pins: discovered = amber, unknown = faint "?" — anything beyond
  // the window collapses into an arrow on the frame instead of vanishing
  for (const lm of landmarks ?? []) {
    const lx = sx(lm.x);
    const ly = sz(lm.z);
    const known = discovered.landmarks.has(lm.type);
    const dx = lx - half;
    const dz = ly - half;
    if (Math.abs(dx) > half - 2 || Math.abs(dz) > half - 2) {
      const e = edgePoint(dx, dz, size, 12);
      drawPip(ctx, e.x, e.y, e.ang, known ? 'rgba(255, 196, 92, 0.95)' : 'rgba(127, 141, 176, 0.55)');
      pins.offscreen.landmarks++;
      continue;
    }
    pins.onmap.landmarks++;
    ctx.beginPath();
    ctx.moveTo(lx, ly - 5);
    ctx.lineTo(lx + 4.5, ly);
    ctx.lineTo(lx, ly + 5);
    ctx.lineTo(lx - 4.5, ly);
    ctx.closePath();
    if (known) {
      ctx.fillStyle = 'rgba(255, 196, 92, 0.95)';
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(127, 141, 176, 0.28)';
      ctx.fill();
    }
    ctx.strokeStyle = known ? 'rgba(255, 236, 190, 0.9)' : 'rgba(127, 141, 176, 0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ---- you: facing cone + chevron --------------------------------------
  const cx = size / 2;
  const cy = size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-(data.player.yaw ?? 0)); // world yaw → canvas heading
  const cone = ctx.createRadialGradient(0, 0, 2, 0, 0, 42);
  cone.addColorStop(0, 'rgba(99, 215, 255, 0.3)');
  cone.addColorStop(1, 'rgba(99, 215, 255, 0)');
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 42, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
  ctx.closePath();
  ctx.fillStyle = cone;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(4.5, 5);
  ctx.lineTo(0, 2.5);
  ctx.lineTo(-4.5, 5);
  ctx.closePath();
  ctx.fillStyle = '#63d7ff';
  ctx.fill();
  ctx.strokeStyle = 'rgba(230, 250, 255, 0.95)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  ctx.restore();

  // frame + compass ticks (north-up — N is called out in amber so the map's
  // orientation is a visible fact, and it matches the full city map)
  ctx.strokeStyle = 'rgba(120, 150, 210, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  ctx.font = '600 9px "Cascadia Mono", Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 196, 92, 0.95)';
  ctx.fillText('N', size / 2, 10);
  ctx.fillStyle = 'rgba(210, 226, 255, 0.75)';
  ctx.fillText('S', size / 2, size - 3);
  ctx.fillText('W', 8, size / 2 + 3);
  ctx.fillText('E', size - 8, size / 2 + 3);

  // district read-out under the radar
  const label = $('minimap-label');
  if (label && cbs?.districtAt) {
    const id = cbs.districtAt(px, pz);
    const info = DISTRICTS[id];
    label.textContent = info ? info.name.toUpperCase() : 'OUTSKIRTS';
  }

  lastPlayer = { x: px, z: pz };
  lastDraw = performance.now();
}

/* --------------------------------- api --------------------------------- */

export function initMiniMap(callbacks) {
  cbs = callbacks;
  return { toggle: toggleMiniMap, show: () => setMiniMapVisible(true), hide: () => setMiniMapVisible(false) };
}

export function setMiniMapVisible(on) {
  const next = !!on;
  const changed = next !== visible;
  visible = next;
  $('minimap')?.classList.toggle('hidden', !visible);
  if (changed && visible) draw();
}

export function isMiniMapVisible() {
  return visible;
}

export function toggleMiniMap() {
  setMiniMapVisible(!visible);
  return visible;
}

/** Frame tick — cheap because the redraw is throttled to ~8 Hz. */
export function updateMiniMap(now = performance.now()) {
  if (!visible) return;
  if (now - lastDraw < REDRAW_MS) return;
  draw();
}

/** Test/debug snapshot (window.__MT_MINIMAP__). */
export function miniMapSnapshot() {
  const canvas = $('minimap-canvas');
  const data = cbs?.data?.();
  return {
    visible,
    size: canvas?.clientWidth ?? 0,
    worldRange: Math.round(range), // live window half-width (120 walk → 150 sprint)
    northUp: true,
    label: $('minimap-label')?.textContent ?? '',
    player: data?.player
      ? {
          x: Math.round(data.player.x),
          z: Math.round(data.player.z),
          yaw: data.player.yaw ?? 0,
          speed: Number((data.player.speed ?? 0).toFixed(2)),
        }
      : null,
    drawnAt: lastPlayer ? { x: Math.round(lastPlayer.x), z: Math.round(lastPlayer.z) } : null,
    pins: {
      landmarks: (data?.layout?.landmarks ?? []).length,
      sources: (data?.sources ?? []).filter((s) => s.held).length,
      markers: (data?.markers ?? []).length,
    },
    // where the frame's edge pips pointed at the last draw
    offscreen: { ...pins.offscreen },
    onmap: { ...pins.onmap },
  };
}
