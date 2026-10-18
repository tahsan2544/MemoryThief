import * as THREE from 'three';

/**
 * Procedural figure textures — the city's people get cloth, skin and faces.
 *
 * Everything here is painted into canvases at first use and then cached for
 * the life of the page (same pattern as world/textures.js), so the whole
 * crowd shares three tiny textures:
 *
 *   fabricNormal()  a basket-weave normal map applied to every coat, torso
 *                   and boot surface — light now catches clothing like cloth
 *                   instead of like plastic.
 *   faceAtlas()     one 4×2 atlas of 128 px face cells: a blank skin cell
 *                   (skulls, necks), six seeded face variants (eyes, brows,
 *                   mouths, stubble, under-eye tiredness) and one guard
 *                   visor face. Each figure's head geometry UVs into exactly
 *                   one cell, so faces cost zero extra draw calls.
 *
 * All drawing is deterministic — fixed layouts and fixed variant tables — so
 * same-seed world rebuilds stay byte-identical.
 */

const CELL = 128; // px per atlas cell
const COLS = 4;
const ROWS = 2;

/* ------------------------------ canvas utils ----------------------------- */

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas, { srgb = false, repeat = null } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  } else {
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
  }
  t.needsUpdate = true;
  return t;
}

/* ---------------------------- fabric normal ------------------------------ */

let _fabric = null;

/**
 * Basket-weave cloth normal map. UVs on figure/prop boxes are metre-scaled
 * (uScale 0.25), so repeat 50 lands a ~1 cm thread — visible weave at the
 * distance you actually see a person, without shimmering at range.
 */
export function fabricNormal() {
  if (_fabric) return _fabric;

  const S = 128;
  const T = 16; // thread width in px → 8×8 threads per tile
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');

  for (let j = 0; j < S; j += T) {
    for (let i = 0; i < S; i += T) {
      const warp = (i / T + j / T) % 2 === 0;
      // A thread is a half-cylinder: the normal tilts across it and dips at
      // the grooves either side, which is what catches the light.
      const grad = warp
        ? g.createLinearGradient(i, 0, i + T, 0)
        : g.createLinearGradient(0, j, 0, j + T);
      if (warp) {
        grad.addColorStop(0, 'rgb(72,128,208)');
        grad.addColorStop(0.5, 'rgb(140,128,252)');
        grad.addColorStop(1, 'rgb(72,128,208)');
      } else {
        grad.addColorStop(0, 'rgb(128,72,208)');
        grad.addColorStop(0.5, 'rgb(128,140,252)');
        grad.addColorStop(1, 'rgb(128,72,208)');
      }
      g.fillStyle = grad;
      g.fillRect(i, j, T, T);
    }
  }

  // deterministic micro-fuzz so the weave never reads as a printed grid
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  for (let p = 0; p < d.length; p += 4) {
    const px = (p / 4) % S;
    const py = Math.floor(p / 4 / S);
    const n = (((px * 7 + py * 13) % 5) - 2) * 3;
    d[p] = Math.max(0, Math.min(255, d[p] + n));
    d[p + 1] = Math.max(0, Math.min(255, d[p + 1] + n));
  }
  g.putImageData(img, 0, 0);

  _fabric = toTexture(c, { repeat: [50, 50] });
  _fabric.name = 'fig-fabric-normal';
  return _fabric;
}

/* ------------------------------ face atlas ------------------------------- */

let _atlas = null;

/**
 * Cell layout (canvas coords, y down). UV rows flip because CanvasTexture
 * has flipY = true:
 *
 *   top row    (canvas y 0)    face 1 | face 2 | face 3 | face 4   → v 0.5..1
 *   bottom row (canvas y CELL) BLANK  | face 5 | face 6 | visor    → v 0..0.5
 *
 * BLANK sits at UV origin so every box that uses default UVs (skulls, necks,
 * hair, helmets — spans always ≤ 0.25) lands on plain skin for free.
 */
export const FACE_BLANK = 0;
export const FACE_VISOR = 7;
export const FACE_COUNT = 6;

/** UV rect for a cell index. */
export function faceCell(idx) {
  const i = ((idx | 0) % (COLS * ROWS) + COLS * ROWS) % (COLS * ROWS);
  const rowTop = i < COLS; // canvas top row
  const col = i % COLS;
  const u0 = col / COLS;
  const u1 = (col + 1) / COLS;
  const v0 = rowTop ? 0.5 : 0;
  const v1 = rowTop ? 1 : 0.5;
  return { u0, v0, u1, v1 };
}

// Fixed face designs — six city faces plus the guard's visor. Coordinates
// are in a 64-unit design space that gets scaled ×2 into each 128 px cell.
const FACES = [
  // 1 — average, level gaze
  { eyeY: 30, gap: 12, ew: 8, eh: 5, browTilt: -0.12, browY: 22, browW: 11, mouthY: 46, mouthW: 12, curve: 1.5, stubble: 0, iris: '#3a3128', tired: 0 },
  // 2 — narrow, worn out
  { eyeY: 31, gap: 11, ew: 9, eh: 3.6, browTilt: 0.1, browY: 23, browW: 12, mouthY: 47, mouthW: 11, curve: -1, stubble: 0.2, iris: '#2f2c26', tired: 0.55 },
  // 3 — wide-set, younger
  { eyeY: 29, gap: 13, ew: 9, eh: 6, browTilt: -0.2, browY: 20, browW: 10, mouthY: 45, mouthW: 10, curve: 2, stubble: 0, iris: '#4a3b2a', tired: 0 },
  // 4 — heavy brow, stern
  { eyeY: 31, gap: 12, ew: 8, eh: 4, browTilt: 0.25, browY: 22, browW: 13, mouthY: 47, mouthW: 13, curve: -2, stubble: 0.32, iris: '#2b2b30', tired: 0.2 },
  // 5 — soft features, under-eye bags
  { eyeY: 30, gap: 12, ew: 8, eh: 4.6, browTilt: -0.05, browY: 22, browW: 11, mouthY: 46, mouthW: 12, curve: 0, stubble: 0.1, iris: '#3f3630', tired: 0.85 },
  // 6 — angular, thin features
  { eyeY: 30, gap: 13, ew: 7, eh: 4, browTilt: -0.3, browY: 21, browW: 12, mouthY: 46, mouthW: 10, curve: -1.5, stubble: 0, iris: '#332a22', tired: 0.12 },
];

function drawFace(g, f) {
  // head shading: soft oval, darker toward jaw and edges
  const shade = g.createRadialGradient(32, 27, 8, 32, 34, 31);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(0.72, 'rgba(0,0,0,0.03)');
  shade.addColorStop(1, 'rgba(0,0,0,0.14)');
  g.fillStyle = shade;
  g.fillRect(0, 0, 64, 64);

  // stubble across the jaw (before features so it sits under the mouth)
  if (f.stubble > 0) {
    g.save();
    g.beginPath();
    g.ellipse(32, 47, 23, 15, 0, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = `rgba(44,40,36,${0.42 * f.stubble})`;
    g.fillRect(0, 34, 64, 30);
    g.restore();
  }

  // nose: two shading strokes and a nostril hint
  g.strokeStyle = 'rgba(0,0,0,0.13)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(30, 33);
  g.lineTo(29, 39);
  g.moveTo(34, 33);
  g.lineTo(35, 39);
  g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.16)';
  g.beginPath();
  g.ellipse(32, 40, 3.4, 1.4, 0, 0, Math.PI * 2);
  g.fill();

  // eyes
  for (const side of [-1, 1]) {
    const cx = 32 + side * f.gap;
    g.fillStyle = '#f1eee7';
    g.beginPath();
    g.ellipse(cx, f.eyeY, f.ew, f.eh, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = f.iris;
    g.beginPath();
    g.arc(cx + side * 0.6, f.eyeY, Math.max(1.6, f.eh * 0.78), 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#14120f';
    g.beginPath();
    g.arc(cx + side * 0.6, f.eyeY, 1.1, 0, Math.PI * 2);
    g.fill();
    // upper lid
    g.strokeStyle = 'rgba(24,20,16,0.85)';
    g.lineWidth = 1.8;
    g.beginPath();
    g.arc(cx, f.eyeY + 0.6, f.ew, Math.PI * 1.08, Math.PI * 1.92);
    g.stroke();
    // tired bags
    if (f.tired > 0) {
      g.strokeStyle = `rgba(88,64,72,${0.4 * f.tired})`;
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(cx, f.eyeY + 2.4, f.ew * 0.8, Math.PI * 1.12, Math.PI * 1.88);
      g.stroke();
    }
  }

  // brows
  g.strokeStyle = 'rgba(38,32,26,0.92)';
  g.lineWidth = 3;
  g.lineCap = 'round';
  for (const side of [-1, 1]) {
    const cx = 32 + side * f.gap;
    const dy = side * f.browTilt * f.browW;
    g.beginPath();
    g.moveTo(cx - f.browW, f.browY + dy);
    g.lineTo(cx + f.browW, f.browY - dy * 0.4);
    g.stroke();
  }

  // mouth
  g.strokeStyle = 'rgba(84,52,46,0.9)';
  g.lineWidth = 2.4;
  g.beginPath();
  g.moveTo(32 - f.mouthW, f.mouthY);
  g.quadraticCurveTo(32, f.mouthY + f.curve, 32 + f.mouthW, f.mouthY);
  g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.10)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(32 - f.mouthW * 0.8, f.mouthY + 3.6);
  g.quadraticCurveTo(32, f.mouthY + 3.6 + f.curve, 32 + f.mouthW * 0.8, f.mouthY + 3.6);
  g.stroke();
}

/** Rounded rect path without relying on the newer ctx.roundRect API. */
function roundRectPath(g, x, y, w, h, r) {
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
}

function drawVisorFace(g, f) {
  drawFace(g, f);
  // armoured visor band across the eyes
  g.fillStyle = '#1d212a';
  g.beginPath();
  roundRectPath(g, 3, 23.5, 58, 14, 4);
  g.fill();
  g.fillStyle = 'rgba(120,214,255,0.5)';
  g.fillRect(8, 29, 48, 2.4);
  g.fillStyle = 'rgba(255,255,255,0.16)';
  g.fillRect(6, 24.5, 52, 2);
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = 1.4;
  g.beginPath();
  roundRectPath(g, 3, 23.5, 58, 14, 4);
  g.stroke();
}

export function faceAtlas() {
  if (_atlas) return _atlas;

  const c = makeCanvas(COLS * CELL, ROWS * CELL);
  const g = c.getContext('2d');

  // BLANK cell (bottom-left): flat skin base — the material colour tints it
  g.fillStyle = '#ffffff';
  g.fillRect(0, ROWS * CELL - CELL, CELL, CELL);

  // face cells, in layout order (see faceCell())
  const slots = [
    { idx: 1, col: 0, top: true },
    { idx: 2, col: 1, top: true },
    { idx: 3, col: 2, top: true },
    { idx: 4, col: 3, top: true },
    { idx: 5, col: 1, top: false },
    { idx: 6, col: 2, top: false },
    { idx: 7, col: 3, top: false }, // guard visor
  ];
  for (const s of slots) {
    g.save();
    g.translate(s.col * CELL, s.top ? 0 : CELL);
    g.scale(CELL / 64, CELL / 64);
    if (s.idx === 7) drawVisorFace(g, FACES[3]);
    else drawFace(g, FACES[s.idx - 1]);
    g.restore();
  }

  _atlas = toTexture(c, { srgb: true });
  _atlas.name = 'fig-face-atlas';
  return _atlas;
}

/** Release the shared figure textures (only on full teardown). */
export function disposeFigureTextures() {
  _fabric?.dispose();
  _atlas?.dispose();
  _fabric = null;
  _atlas = null;
}
