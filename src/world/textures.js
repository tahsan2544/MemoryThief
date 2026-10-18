import * as THREE from 'three';
import { createRng } from '../core/rng.js';

/**
 * Procedural texture factory.
 *
 * Everything the city needs is painted onto canvases at load time, so the
 * project ships with no binary art assets. Results are cached by key because
 * several districts share surfaces.
 *
 * Facade textures are laid out as a 4x4 grid of "window modules". Facade UVs
 * are expressed in module units (see `windowUV()`), so one texture covers four
 * floors / four window bays and repeats from there.
 */

const MODULE_PX = 128;
const MODULES = 4;
export const FACADE_PX = MODULE_PX * MODULES; // 512
const EM_SCALE = 0.5; // emissive maps are half resolution (they are low-frequency)

const cache = new Map();

/**
 * Texture supersample factor. Every 2-D surface is still painted in its
 * original logical units (the 512px facade grid, the 30px signage type, the
 * 512px road tile) but onto a canvas rendered `UP`x larger. Because the
 * context is pre-scaled, every path, gradient and glyph keeps pixel-for-pixel
 * the same proportions — only the saved texture gains `UP`x the resolution, so
 * walls, signs and ground read sharper up close with no redrawn artwork.
 */
const UP = 2;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * UP);
  c.height = Math.round(h * UP);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.scale(UP, UP); // draw in logical w x h; rasterise at w*UP x h*UP
  return { c, ctx };
}

/** Exact-pixel canvas with no supersampling — for per-pixel data textures. */
function makeRawCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  return { c, ctx };
}

function toTexture(canvas, { srgb = true, repeat = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

function shade(hex, amount) {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amount)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function rgba(hex, a) {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return `rgba(${r},${g},${b},${a})`;
}

/** Soft random speckle used to stop flat surfaces reading as plastic. */
function speckle(ctx, w, h, rng, alpha, count, light = 60) {
  for (let i = 0; i < count; i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    const r = rng.range(0.5, 2.6);
    const v = rng.range(-light, light);
    ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Large soft stains — deliberately subtle so the tile repeat is not obvious. */
function stains(ctx, w, h, rng, color, alpha, count) {
  for (let i = 0; i < count; i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    const r = rng.range(w * 0.08, w * 0.3);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/* ------------------------------------------------------------------ *
 * Facades
 * ------------------------------------------------------------------ */

const STYLE_TINTS = {
  glass: { wall: 0x182131, frame: 0x2c3a4f, glass: 0x0a1522 },
  brick: { wall: 0x4a3b33, frame: 0x6a5c50, glass: 0x120e0c },
  industrial: { wall: 0x2c353a, frame: 0x46525a, glass: 0x0b1416 },
  garden: { wall: 0x39403a, frame: 0x5b6155, glass: 0x0e1512 },
  plaza: { wall: 0x24262e, frame: 0x3b3f4b, glass: 0x0a0c12 },
};

/**
 * Paint one facade texture pair.
 * Returns { map, emissiveMap } — both RGBA canvases sized FACADE_PX.
 */
function buildFacade(style, seedKey) {
  const tint = STYLE_TINTS[style] ?? STYLE_TINTS.glass;
  const rng = createRng(`facade:${style}:${seedKey}`);
  const size = FACADE_PX;
  const em = Math.round(size * EM_SCALE);
  const emModule = em / MODULES;

  const { c: mapCanvas, ctx } = makeCanvas(size, size);
  const { c: emCanvas, ctx: ectx } = makeCanvas(em, em);

  ctx.fillStyle = shade(tint.wall, -6);
  ctx.fillRect(0, 0, size, size);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, em, em);

  drawWall(ctx, style, tint, rng, size);
  drawWindows(ctx, ectx, style, tint, rng, size, emModule);

  stains(ctx, size, size, rng, 0x05070c, 0.16, 14);
  speckle(ctx, size, size, rng, 0.05, 900, 50);

  const map = toTexture(mapCanvas);
  const emissiveMap = toTexture(emCanvas);
  return { map, emissiveMap };
}

function drawWall(ctx, style, tint, rng, size) {
  const m = MODULE_PX;

  if (style === 'glass') {
    // curtain-wall: faint horizontal floor bands + vertical bay mullions
    for (let y = 0; y < size; y += m) {
      ctx.fillStyle = rgba(0x8fa6c4, 0.07);
      ctx.fillRect(0, y, size, 3);
      ctx.fillStyle = rgba(0x000000, 0.35);
      ctx.fillRect(0, y + m - 6, size, 6);
    }
    for (let x = 0; x < size; x += m / 2) {
      ctx.fillStyle = rgba(0x000000, 0.28);
      ctx.fillRect(x, 0, 3, size);
    }
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, rgba(0x9fc6ff, 0.07));
    g.addColorStop(1, rgba(0x9fc6ff, 0.0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return;
  }

  if (style === 'brick') {
    const bh = 14;
    const bw = 32;
    for (let y = 0, row = 0; y < size; y += bh, row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw; x < size; x += bw) {
        const v = rng.range(-16, 16);
        ctx.fillStyle = shade(0x4a3b33, v);
        ctx.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
      }
    }
    ctx.fillStyle = rgba(0x000000, 0.22);
    for (let y = 0; y < size; y += m) ctx.fillRect(0, y, size, 4);
    return;
  }

  if (style === 'industrial') {
    // corrugated sheet + panel seams + rust
    for (let x = 0; x < size; x += 16) {
      const g = ctx.createLinearGradient(x, 0, x + 16, 0);
      g.addColorStop(0, rgba(0x000000, 0.32));
      g.addColorStop(0.5, rgba(0xffffff, 0.05));
      g.addColorStop(1, rgba(0x000000, 0.32));
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 16, size);
    }
    ctx.fillStyle = rgba(0x000000, 0.4);
    for (let y = 0; y < size; y += m) ctx.fillRect(0, y, size, 5);
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = rgba(0x7a4423, rng.range(0.05, 0.16));
      const x = rng.range(0, size);
      const w = rng.range(4, 20);
      const h = rng.range(m * 0.4, m * 2);
      ctx.fillRect(x, rng.range(0, size - h), w, h);
    }
    return;
  }

  if (style === 'garden') {
    ctx.fillStyle = shade(tint.wall, 4);
    ctx.fillRect(0, 0, size, size);
    // concrete panel joints
    ctx.fillStyle = rgba(0x000000, 0.3);
    for (let y = 0; y < size; y += m) ctx.fillRect(0, y, size, 3);
    for (let x = 0; x < size; x += m * 2) ctx.fillRect(x, 0, 3, size);
    // moss / vine creep
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = rgba(0x3f6b3a, rng.range(0.08, 0.3));
      ctx.beginPath();
      ctx.ellipse(rng.range(0, size), rng.range(0, size), rng.range(6, 34), rng.range(5, 26), rng.range(0, 3), 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // plaza / underarchive: dark machined panels
  ctx.fillStyle = shade(tint.wall, 0);
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = rgba(0x000000, 0.45);
  for (let y = 0; y < size; y += m) ctx.fillRect(0, y, size, 5);
  for (let x = 0; x < size; x += m * 2) ctx.fillRect(x, 0, 4, size);
  ctx.fillStyle = rgba(0xff3b47, 0.5);
  ctx.fillRect(0, m - 7, size, 3);
}

function drawWindows(ctx, ectx, style, tint, rng, size, emModule) {
  const m = MODULE_PX;
  const litCool = [0x9fd8ff, 0xbfe6ff, 0xdff1ff];
  const litWarm = [0xffc27a, 0xffa640, 0xffd9a0];

  const cfg = {
    glass: { w: m - 10, h: m - 22, ox: 5, oy: 8, lit: 0.5, warm: 0.18, mullion: true },
    brick: { w: m - 52, h: m - 40, ox: 26, oy: 18, lit: 0.55, warm: 0.8, mullion: false },
    industrial: { w: m - 48, h: m - 62, ox: 24, oy: 30, lit: 0.3, warm: 0.1, mullion: false },
    garden: { w: m - 46, h: m - 44, ox: 23, oy: 16, lit: 0.45, warm: 0.85, mullion: false },
    plaza: { w: m - 78, h: m - 34, ox: 39, oy: 22, lit: 0.2, warm: 0.2, mullion: false },
  }[style] ?? { w: m - 30, h: m - 40, ox: 15, oy: 20, lit: 0.4, warm: 0.4, mullion: false };

  const isLit = [];
  for (let my = 0; my < MODULES; my++) {
    for (let mx = 0; mx < MODULES; mx++) {
      const x = mx * m + cfg.ox;
      const y = my * m + cfg.oy;
      const w = cfg.w;
      const h = cfg.h;

      // frame
      ctx.fillStyle = shade(tint.frame, rng.range(-8, 8));
      ctx.fillRect(x - 4, y - 4, w + 8, h + 8);

      // glass pane
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, shade(tint.glass, 22));
      g.addColorStop(0.55, shade(tint.glass, 4));
      g.addColorStop(1, shade(tint.glass, -4));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);

      // reflection sliver
      ctx.fillStyle = 'rgba(160,200,255,0.10)';
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x + w * 0.5, y);
      ctx.lineTo(x + w * 0.75, y);
      ctx.lineTo(x + w * 0.25, y + h);
      ctx.closePath();
      ctx.fill();

      if (cfg.mullion) {
        ctx.fillStyle = rgba(tint.frame, 0.9);
        ctx.fillRect(x + w / 2 - 2, y, 4, h);
      }

      if (style === 'brick' || style === 'garden') {
        // sill
        ctx.fillStyle = shade(tint.frame, -18);
        ctx.fillRect(x - 7, y + h + 2, w + 14, 6);
      }

      if (style === 'garden') {
        // planter box under the window
        ctx.fillStyle = '#1d2a1c';
        ctx.fillRect(x - 6, y + h + 9, w + 12, 12);
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = `rgba(${60 + rng.int(0, 50)},${120 + rng.int(0, 70)},${60 + rng.int(0, 40)},0.85)`;
          ctx.beginPath();
          ctx.ellipse(x + rng.range(4, w - 4), y + h + 9, rng.range(4, 9), rng.range(4, 8), 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (style === 'industrial') {
        ctx.fillStyle = rgba(0x000000, 0.55);
        for (let b = 1; b < 3; b++) ctx.fillRect(x, y + (h / 3) * b, w, 3);
      }

      // ---- emissive ----
      const lit = rng.chance(cfg.lit);
      isLit.push({ x, y, w, h, lit, warm: rng.chance(cfg.warm), mx, my });
    }
  }

  const s = emModule / m;
  for (const win of isLit) {
    if (!win.lit) continue;
    const palette = win.warm ? litWarm : litCool;
    const col = palette[rng.int(0, palette.length - 1)];
    const X = win.mx * emModule + cfg.ox * s;
    const Y = win.my * emModule + cfg.oy * s;
    const W = win.w * s;
    const H = win.h * s;

    const g = ectx.createLinearGradient(X, Y, X, Y + H);
    g.addColorStop(0, rgba(col, 1));
    g.addColorStop(1, rgba(col, 0.55));
    ectx.fillStyle = g;
    ectx.fillRect(X, Y, W, H);

    // silhouette details: blinds / curtains / figures
    const mode = rng.int(0, 3);
    if (mode === 0) {
      ectx.fillStyle = 'rgba(0,0,0,0.55)';
      const drop = rng.range(0.1, 0.7);
      ectx.fillRect(X, Y, W, H * drop);
    } else if (mode === 1) {
      ectx.fillStyle = 'rgba(0,0,0,0.45)';
      ectx.fillRect(X + W * 0.55, Y, W * 0.45, H);
    } else if (mode === 2) {
      ectx.fillStyle = 'rgba(0,0,0,0.7)';
      const fw = W * rng.range(0.12, 0.22);
      ectx.fillRect(X + rng.range(0, W - fw), Y + H * 0.35, fw, H * 0.65);
    }
  }
}

/** Cached facade pair for a district style + variant index. */
export function facadeTextures(style, variant = 0) {
  return cached(`facade:${style}:${variant}`, () => buildFacade(style, variant));
}

/* ------------------------------------------------------------------ *
 * Ground surfaces
 * ------------------------------------------------------------------ */

function buildAsphalt() {
  const rng = createRng('asphalt');
  const size = 512;
  const { c, ctx } = makeCanvas(size, size);
  const { c: rc, ctx: rctx } = makeCanvas(size, size);

  ctx.fillStyle = '#0d0f14';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, size, rng, 0.1, 5200, 70);
  stains(ctx, size, size, rng, 0x04060a, 0.5, 16);
  // faint tyre polish lanes
  const g = ctx.createLinearGradient(0, 0, size, 0);
  g.addColorStop(0.0, 'rgba(255,255,255,0.02)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.06)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.01)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(255,255,255,0.02)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // repairs / cracks
  for (let i = 0; i < 7; i++) {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = rng.range(1, 3);
    ctx.beginPath();
    let x = rng.range(0, size);
    let y = rng.range(0, size);
    ctx.moveTo(x, y);
    for (let s = 0; s < 7; s++) {
      x += rng.range(-70, 70);
      y += rng.range(-70, 70);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // roughness: puddles are smooth (dark), worn asphalt is rough (light)
  rctx.fillStyle = '#c8c8c8';
  rctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 46; i++) {
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    const r = rng.range(18, 82);
    const grad = rctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(26,26,26,1)');
    grad.addColorStop(0.7, 'rgba(60,60,60,0.7)');
    grad.addColorStop(1, 'rgba(200,200,200,0)');
    rctx.fillStyle = grad;
    rctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  return { map: toTexture(c), roughnessMap: toTexture(rc, { srgb: false }) };
}

function buildConcrete() {
  const rng = createRng('concrete');
  const size = 512;
  const { c, ctx } = makeCanvas(size, size);
  ctx.fillStyle = '#1a1d25';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, size, rng, 0.07, 4200, 60);
  stains(ctx, size, size, rng, 0x070a12, 0.4, 16);
  // pavement slab joints every 128px
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  for (let i = 0; i <= size; i += 128) {
    ctx.fillRect(i, 0, 3, size);
    ctx.fillRect(0, i, size, 3);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let i = 3; i <= size; i += 128) ctx.fillRect(i, 0, 1, size);
  return { map: toTexture(c) };
}

function buildMetal() {
  const rng = createRng('metal');
  const size = 256;
  const { c, ctx } = makeCanvas(size, size);
  ctx.fillStyle = '#2b3038';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, size, rng, 0.06, 1600, 55);
  stains(ctx, size, size, rng, 0x0a0d12, 0.35, 8);
  return { map: toTexture(c) };
}

/* ------------------------------------------------------------------ *
 * Billboards / signage
 * ------------------------------------------------------------------ */

const AD_PALETTES = [
  ['#0a1a34', '#63d7ff', '#eef4ff'],
  ['#20122e', '#9a7bff', '#ffe6ff'],
  ['#2b1608', '#ffa640', '#fff2df'],
  ['#08201c', '#54e0c6', '#e8fffb'],
  ['#2a0b10', '#ff3b47', '#ffe9ea'],
  ['#111726', '#9fc0ff', '#ffffff'],
];

const AD_WORDS = [
  'PALISADE',
  'REMEMBER',
  'FORGET',
  'EIDOLON',
  'LUCID',
  'CLARITY',
  'ARCHIVE',
  'MINDSAFE',
];

function buildSignAtlas() {
  const rng = createRng('signs');
  const cols = 4;
  const rows = 2;
  const cw = 256;
  const ch = 160;
  const { c, ctx } = makeCanvas(cols * cw, rows * ch);

  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 0, cols * cw, rows * ch); // logical size (c.width is physical)

  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < cols; x++) {
      const i = r * cols + x;
      const [bg, accent, text] = AD_PALETTES[i % AD_PALETTES.length];
      const ox = x * cw;
      const oy = r * ch;

      ctx.fillStyle = bg;
      ctx.fillRect(ox, oy, cw, ch);

      // graphic block
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = accent;
      if (i % 3 === 0) {
        ctx.beginPath();
        ctx.arc(ox + cw * 0.76, oy + ch * 0.5, ch * 0.32, 0, Math.PI * 2);
        ctx.fill();
      } else if (i % 3 === 1) {
        for (let k = 0; k < 5; k++) {
          ctx.fillRect(ox + 24 + k * 26, oy + ch * 0.22, 14, ch * 0.56 * (1 - k * 0.14));
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(ox + cw * 0.6, oy + 16);
        ctx.lineTo(ox + cw * 0.94, oy + ch * 0.5);
        ctx.lineTo(ox + cw * 0.6, oy + ch - 16);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // headline + fake copy bars
      ctx.fillStyle = text;
      ctx.font = `700 ${i % 2 ? 34 : 28}px Consolas, monospace`;
      ctx.fillText(AD_WORDS[i % AD_WORDS.length], ox + 18, oy + 56);
      ctx.fillStyle = rgba(0xffffff, 0.45);
      for (let k = 0; k < 3; k++) {
        ctx.fillRect(ox + 18, oy + 76 + k * 13, rng.range(70, 210), 6);
      }

      // frame
      ctx.strokeStyle = rgba(accent, 0.85);
      ctx.lineWidth = 4;
      ctx.strokeRect(ox + 3, oy + 3, cw - 6, ch - 6);
    }
  }

  return toTexture(c);
}

function buildLogo() {
  const { c, ctx } = makeCanvas(512, 128);
  ctx.fillStyle = '#04070d';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#63d7ff';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 500, 116);
  ctx.fillStyle = '#eaf4ff';
  ctx.font = '700 56px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PALISADE', 256, 56);
  ctx.font = '400 18px Consolas, monospace';
  ctx.fillStyle = '#7fa8d8';
  ctx.fillText('MEMORY OPERATIONS · SECTOR 0', 256, 98);
  return toTexture(c);
}

function buildTransitSign() {
  const { c, ctx } = makeCanvas(512, 128);
  ctx.fillStyle = '#06110f';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#54e0c6';
  ctx.fillRect(0, 0, 512, 8);
  ctx.fillRect(0, 120, 512, 8);
  ctx.fillStyle = '#dffff8';
  ctx.font = '700 40px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EIDOLON TRANSIT', 256, 46);
  ctx.font = '400 26px Consolas, monospace';
  ctx.fillStyle = '#6fbdb0';
  ctx.fillText('LINE 4 · FLOODWORKS', 256, 88);
  return toTexture(c);
}

function buildMarketSign() {
  const { c, ctx } = makeCanvas(512, 160);
  ctx.fillStyle = '#160c04';
  ctx.fillRect(0, 0, 512, 160);
  const g = ctx.createLinearGradient(0, 0, 512, 0);
  g.addColorStop(0, '#ffa640');
  g.addColorStop(1, '#ff5f3c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 10);
  ctx.fillRect(0, 150, 512, 10);
  ctx.fillStyle = '#ffe9cd';
  ctx.font = '700 58px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NIGHT MARKET', 256, 68);
  ctx.font = '400 24px Consolas, monospace';
  ctx.fillStyle = '#ffb877';
  ctx.fillText('OLD QUARTER · OPEN ALL CYCLE', 256, 118);
  return toTexture(c);
}

function buildArchiveSign() {
  const { c, ctx } = makeCanvas(512, 160);
  ctx.fillStyle = '#16070a';
  ctx.fillRect(0, 0, 512, 160);
  ctx.fillStyle = '#ff3b47';
  ctx.fillRect(0, 0, 512, 12);
  ctx.fillRect(0, 148, 512, 12);
  for (let i = -160; i < 520; i += 48) {
    ctx.fillStyle = 'rgba(255,59,71,0.25)';
    ctx.beginPath();
    ctx.moveTo(i, 160);
    ctx.lineTo(i + 24, 160);
    ctx.lineTo(i + 64, 96);
    ctx.lineTo(i + 40, 96);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#ffe3e5';
  ctx.font = '700 54px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SECTOR 0', 256, 62);
  ctx.font = '700 30px Consolas, monospace';
  ctx.fillStyle = '#ff8f97';
  ctx.fillText('ACCESS SEALED', 256, 114);
  return toTexture(c);
}

function buildPosterAtlas() {
  const rng = createRng('posters');
  const { c, ctx } = makeCanvas(512, 512);
  ctx.fillStyle = '#0b0d13';
  ctx.fillRect(0, 0, 512, 512);
  const titles = ['MISSING', 'MISSING', 'REDACTED', 'HAVE YOU SEEN'];
  for (let i = 0; i < 4; i++) {
    const ox = (i % 2) * 256;
    const oy = Math.floor(i / 2) * 256;
    ctx.fillStyle = i === 2 ? '#18090c' : '#161a24';
    ctx.fillRect(ox + 8, oy + 8, 240, 240);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 3;
    ctx.strokeRect(ox + 8, oy + 8, 240, 240);

    ctx.fillStyle = i === 2 ? '#ff3b47' : '#c9d8f5';
    ctx.font = '700 30px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(titles[i], ox + 128, oy + 54);

    // abstract face block
    ctx.fillStyle = 'rgba(120,150,200,0.18)';
    ctx.beginPath();
    ctx.ellipse(ox + 128, oy + 132, 52, 66, 0, 0, Math.PI * 2);
    ctx.fill();
    if (i === 2) {
      ctx.fillStyle = '#000';
      ctx.fillRect(ox + 56, oy + 108, 144, 46);
      ctx.fillStyle = 'rgba(255,59,71,0.7)';
      ctx.fillRect(ox + 56, oy + 108, 144, 5);
    }

    ctx.fillStyle = 'rgba(200,215,240,0.5)';
    for (let k = 0; k < 4; k++) {
      ctx.fillRect(ox + 40, oy + 200 + k * 12, rng.range(60, 176), 5);
    }
    ctx.textAlign = 'start';
  }
  return toTexture(c);
}

/* ------------------------------------------------------------------ *
 * Water & misc
 * ------------------------------------------------------------------ */

function buildWaterNormal() {
  const size = 512;
  const { c, ctx } = makeRawCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const rng = createRng('water');
  // two crossing wave trains -> a cheap but believable normal map
  const a1 = rng.range(0, 6.28);
  const a2 = rng.range(0, 6.28);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      const dx = Math.cos(u * 3 + a1) * 0.5 + Math.cos(u * 7 - v * 4 + a2) * 0.3 + Math.cos(v * 11) * 0.2;
      const dy = Math.sin(v * 3 + a2) * 0.5 + Math.sin(v * 6 + u * 5 + a1) * 0.3 + Math.sin(u * 13) * 0.2;
      const nx = -dx * 0.55;
      const ny = -dy * 0.55;
      const nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/* ------------------------------------------------------------------ *
 * Surface relief (Phase 8) — tangent-space normal maps
 * ------------------------------------------------------------------ */

/**
 * Tileable value-noise helpers. A lattice of random values is sampled with
 * smoothstep-blended bilinear interpolation and wraps modulo the lattice size,
 * so the resulting height field (and the normal map derived from it) tiles
 * seamlessly at every octave.
 */
function makeLattice(rng, n) {
  const g = new Float32Array(n * n);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  return g;
}

function latticeAt(g, n, x, y) {
  const xi = ((x % n) + n) % n;
  const yi = ((y % n) + n) % n;
  return g[yi * n + xi];
}

function sampleLattice(g, n, u, v) {
  const fx = u * n;
  const fy = v * n;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = latticeAt(g, n, x0, y0);
  const b = latticeAt(g, n, x0 + 1, y0);
  const c = latticeAt(g, n, x0, y0 + 1);
  const d = latticeAt(g, n, x0 + 1, y0 + 1);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

const NORMAL_PRESETS = {
  road: { octaves: 4, scale: 8, strength: 1.7 }, // tarmac grain + kerb chipping
  ground: { octaves: 4, scale: 5, strength: 1.2 }, // paving slabs / poured concrete
  facade: { octaves: 3, scale: 4, strength: 0.85 }, // subtle render/concrete relief
};

/**
 * Procedural normal map from multi-octave value noise (Sobel of a height
 * field). Attaching this to the big flat surfaces is the cheapest believable
 * realism win available: light and neon now catch real surface relief instead
 * of sliding across a mathematically perfect plane.
 */
function buildSurfaceNormal(kind) {
  const { octaves, scale, strength } = NORMAL_PRESETS[kind] ?? NORMAL_PRESETS.ground;
  const size = 512;
  const { c, ctx } = makeRawCanvas(size, size);
  const rng = createRng(`normal:${kind}`);

  // ---- height field: sum of tileable noise octaves ----
  const h = new Float32Array(size * size);
  let amp = 1;
  let freq = scale;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const g = makeLattice(rng, freq);
    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        h[y * size + x] += sampleLattice(g, freq, x / size, v) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
    freq *= 2;
  }
  for (let i = 0; i < h.length; i++) h[i] /= total;

  // ---- Sobel gradient -> tangent-space normal ----
  const img = ctx.createImageData(size, size);
  const at = (x, y) =>
    h[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const nx = -dx;
      const ny = -dy;
      const nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace; // data, not colour
  t.needsUpdate = true;
  return t;
}

/* ------------------------------------------------------------------ *
 * Public accessors
 * ------------------------------------------------------------------ */

export const textures = {
  facade: (style, variant = 0) => facadeTextures(style, variant),
  asphalt: () => cached('asphalt', buildAsphalt),
  concrete: () => cached('concrete', buildConcrete),
  metal: () => cached('metal', buildMetal),
  signAtlas: () => cached('signAtlas', buildSignAtlas),
  logo: () => cached('logo', buildLogo),
  transitSign: () => cached('transitSign', buildTransitSign),
  marketSign: () => cached('marketSign', buildMarketSign),
  archiveSign: () => cached('archiveSign', buildArchiveSign),
  posterAtlas: () => cached('posters', buildPosterAtlas),
  waterNormal: () => cached('waterNormal', buildWaterNormal),
  surfaceNormal: (kind) => cached(`normal:${kind}`, () => buildSurfaceNormal(kind)),
};

/** Free GPU memory for every generated texture (used on hard teardown). */
export function disposeTextures() {
  for (const value of cache.values()) {
    if (value?.isTexture) value.dispose();
    else if (value && typeof value === 'object') {
      for (const v of Object.values(value)) v?.dispose?.();
    }
  }
  cache.clear();
}
