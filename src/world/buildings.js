import { DISTRICTS, FACADE_VARIANTS } from '../config/districts.js';
import { createRng } from '../core/rng.js';
import { rgb, shadeHex, uvPhase, windowUV } from '../utils/geo.js';

/**
 * Procedural building generator.
 *
 * A city cell is subdivided into lots, and each lot gets a stacked "tier"
 * silhouette (podium / shaft / crown), a facade with floors-aligned windows,
 * a roof with machinery, and district-specific jewellery (fins, balconies,
 * awnings, pipes, neon, billboards).
 *
 * All colour variation is written straight into the vertex-color attribute, so
 * one shared facade material per district/variant can render plinths, walls and
 * neon without extra draw calls.
 *
 * Every decision comes from the cell's seeded RNG, so a given seed always
 * produces the same skyline.
 */

const GROUND_FLOOR = 4.3;

function subdivide(rect, nx, nz, gap, rng) {
  if (nx <= 1 && nz <= 1) return [{ ...rect }];

  const widths = splitRange(rect.x1 - rect.x0, nx, gap, rng);
  const depths = splitRange(rect.z1 - rect.z0, nz, gap, rng);

  const lots = [];
  let z = rect.z0;
  for (let j = 0; j < nz; j++) {
    let x = rect.x0;
    for (let i = 0; i < nx; i++) {
      lots.push({ x0: x, z0: z, x1: x + widths[i], z1: z + depths[j] });
      x += widths[i] + gap;
    }
    z += depths[j] + gap;
  }
  return lots;
}

function splitRange(total, n, gap, rng) {
  if (n <= 1) return [total];
  const usable = total - gap * (n - 1);
  const weights = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const w = rng.range(0.7, 1.35);
    weights.push(w);
    sum += w;
  }
  return weights.map((w) => Math.max(2, (usable * w) / sum));
}

/**
 * Generate every non-landmark building inside one cell.
 * @param cell layout cell record
 * @param ctx  { layout, density, bucket(key) }
 */
export function generateCellBuildings(cell, ctx) {
  const rng = createRng(cell.seed ^ 0x5f3a);
  const base = ctx.layout.curb;

  const walkway = cell.district === 'oldquarter' ? 3.6 : 5.2;
  const rect = {
    x0: cell.x0 + walkway,
    z0: cell.z0 + walkway,
    x1: cell.x1 - walkway,
    z1: cell.z1 - walkway,
  };
  if (rect.x1 - rect.x0 < 8 || rect.z1 - rect.z0 < 8) return;
  generateBuildingsInRect(ctx, cell, rng, rect);
}

/**
 * Fill an arbitrary rectangle inside a cell with buildings. Landmarks use this
 * to frame a plaza or square while keeping the middle open.
 */
export function generateBuildingsInRect(ctx, cell, rng, rect, opts = {}) {
  const district = DISTRICTS[cell.district];
  const profile = district.building;
  const base = ctx.layout.curb;
  const density = ctx.density;

  if (rect.x1 - rect.x0 < 6 || rect.z1 - rect.z0 < 6) return;

  const pattern = opts.pattern ?? rng.pick(profile.lots);
  const gap = opts.gap ?? rng.range(profile.gap[0], profile.gap[1]);
  const lots = subdivide(rect, pattern[0], pattern[1], gap, rng);

  const keepChance = Math.min(1, 0.84 + 0.22 * density);

  for (const lot of lots) {
    const w = lot.x1 - lot.x0;
    const d = lot.z1 - lot.z0;
    if (w < 5 || d < 5) continue;
    if (!rng.chance(keepChance)) {
      yard(ctx, district, rng, lot, base);
      continue;
    }
    if (cell.flooded && rng.chance(0.45)) {
      ruin(ctx, cell, district, rng, lot, base);
      continue;
    }
    building(ctx, cell, district, rng, lot, base);
  }
}

/* ------------------------------------------------------------------ */

function building(ctx, cell, district, rng, lot, base) {
  const profile = district.building;
  const facade = ctx.bucket(`facade:${cell.district}:${rng.int(0, FACADE_VARIANTS - 1)}`);
  const trim = ctx.bucket('trim');
  const roofB = ctx.bucket('roof');
  const neon = ctx.bucket('neon');
  const sign = ctx.bucket('sign');

  // Per-building tint: without this every wall in a district shares one
  // colour and the skyline reads as one repeated box.
  const wallCol = varyTint(district.facadeTint, rng);
  const plinthCol = shadeHex(wallCol, 0.55);
  const neonCol = scaleNeon(district.neon, 2.1);
  const phase = uvPhase(rng);
  const uv = windowUV(district, phase[0], phase[1]);

  const cx = (lot.x0 + lot.x1) / 2;
  const cz = (lot.z0 + lot.z1) / 2;

  // flooded blocks: structures sink into the water
  const sink = cell.flooded ? rng.range(1.4, 2.6) : 0;
  const y0 = base - sink;

  const t = Math.pow(rng.next(), 1.7);
  let height = profile.hMin + (profile.hMax - profile.hMin) * t;
  height *= 0.72 + 0.55 * cell.tall;
  if (cell.flooded) height = Math.min(height, 14);
  height = Math.max(6, height);

  const nTiers = rng.int(profile.tiers[0], profile.tiers[1]);
  const fracs = nTiers === 1 ? [1] : nTiers === 2 ? [0.58, 0.42] : [0.4, 0.33, 0.27];

  let cw = lot.x1 - lot.x0;
  let cd = lot.z1 - lot.z0;
  let y = y0;

  for (let tierIndex = 0; tierIndex < nTiers; tierIndex++) {
    const th = height * fracs[tierIndex];
    const isBaseTier = tierIndex === 0;

    if (isBaseTier && th > GROUND_FLOOR + 1.5) {
      // dark plinth
      trim.box({
        x: cx,
        y: y - 0.05,
        z: cz,
        w: cw + 0.16,
        h: 0.6,
        d: cd + 0.16,
        color: 0x15181e,
        roofColor: 0x15181e,
      });
      // shopfront band (ground floor)
      facade.box({
        x: cx,
        y,
        z: cz,
        w: cw,
        h: GROUND_FLOOR,
        d: cd,
        color: plinthCol,
        uScale: uv.uScale,
        vScale: uv.vScale,
        uOff: uv.uOff,
        vOff: uv.vOff,
        shell: 0.06,
      });
      // illuminated fascia above the shopfront
      if (rng.chance(0.8)) {
        neon.box({
          x: cx,
          y: y + GROUND_FLOOR - 0.5,
          z: cz,
          w: cw + 0.5,
          h: 0.32,
          d: cd + 0.5,
          color: neonCol,
        });
      }
      // upper part of the tier
      facade.box({
        x: cx,
        y: y + GROUND_FLOOR,
        z: cz,
        w: cw,
        h: th - GROUND_FLOOR,
        d: cd,
        color: wallCol,
        uScale: uv.uScale,
        vScale: uv.vScale,
        uOff: uv.uOff,
        vOff: uv.vOff + GROUND_FLOOR / district.floorH,
        shell: 0.06,
      });
      y += th;
    } else {
      facade.box({
        x: cx,
        y,
        z: cz,
        w: cw,
        h: th,
        d: cd,
        color: wallCol,
        uScale: uv.uScale,
        vScale: uv.vScale,
        uOff: uv.uOff,
        vOff: uv.vOff,
        shell: 0.06,
      });
      y += th;
    }

    // ---- tier jewellery ----
    if (profile.fins && cw > 8) addFins(trim, cx, cz, cw, cd, y - th, th, rng);
    if (profile.balconies > 0 && rng.chance(profile.balconies)) {
      addBalconies(trim, cx, cz, cw, cd, y - th, th, district, rng);
    }
    if (profile.awnings > 0 && isBaseTier && rng.chance(profile.awnings)) {
      addAwning(trim, cx, cz, cw, cd, y0 + GROUND_FLOOR - 1.0, rng);
    }
    if (profile.pipes && rng.chance(0.6)) addPipes(trim, cx, cz, cw, cd, y0, y, rng);

    // setback for the next tier
    if (tierIndex < nTiers - 1) {
      const k = 1 - profile.setback * rng.range(0.7, 1.25);
      cw = Math.max(5, cw * k);
      cd = Math.max(5, cd * k);
    }
  }

  const topY = y;

  // ---- parapet ----
  const par = Math.min(cw, cd) * 0.05 + 0.4;
  const ph = rng.range(0.7, 1.5);
  const parCol = shadeHex(wallCol, 0.5);
  for (const [ox, oz, bw, bd] of [
    [0, cd / 2 - par / 2, cw, par],
    [0, -cd / 2 + par / 2, cw, par],
    [cw / 2 - par / 2, 0, par, cd],
    [-cw / 2 + par / 2, 0, par, cd],
  ]) {
    trim.box({ x: cx + ox, y: topY, z: cz + oz, w: bw, h: ph, d: bd, color: parCol });
  }

  // ---- roof deck ----
  roofB.box({
    x: cx,
    y: topY,
    z: cz,
    w: Math.max(1, cw - par),
    h: 0.2,
    d: Math.max(1, cd - par),
    color: 0x3e4654,
    roofColor: 0x3e4654,
  });

  // ---- machinery ----
  const machineCount = rng.int(1, Math.min(4, 1 + Math.round((cw * cd) / 160)));
  for (let i = 0; i < machineCount; i++) {
    const mw = rng.range(2.2, Math.max(2.6, Math.min(7, cw * 0.4)));
    const md = rng.range(2.2, Math.max(2.6, Math.min(7, cd * 0.4)));
    const mh = rng.range(1.2, 3.4);
    const mx = cx + rng.range(-cw / 2 + mw / 2 + 0.8, cw / 2 - mw / 2 - 0.8);
    const mz = cz + rng.range(-cd / 2 + md / 2 + 0.8, cd / 2 - md / 2 - 0.8);
    trim.box({ x: mx, y: topY + 0.2, z: mz, w: mw, h: mh, d: md, color: rng.chance(0.5) ? 0x39404a : 0x4a5159 });
    if (rng.chance(0.4)) {
      trim.box({ x: mx, y: topY + 0.2 + mh, z: mz, w: mw * 0.7, h: 0.3, d: md * 0.7, color: 0x22262c });
    }
  }

  if (rng.chance(0.5)) {
    const tw = Math.min(cw, cd) * rng.range(0.18, 0.3);
    trim.cylinder({
      x: cx + rng.range(-cw / 4, cw / 4),
      y: topY + 0.2,
      z: cz + rng.range(-cd / 4, cd / 4),
      rBottom: tw / 2,
      rTop: tw / 2,
      height: rng.range(3, 6),
      segments: 12,
      color: 0x4b535d,
      caps: true,
    });
  }

  if (height > 26 && rng.chance(0.65)) {
    const mh = rng.range(6, 18);
    trim.cylinder({
      x: cx + rng.range(-cw / 4, cw / 4),
      y: topY + 0.2,
      z: cz + rng.range(-cd / 4, cd / 4),
      rBottom: 0.28,
      rTop: 0.1,
      height: mh,
      segments: 6,
      color: 0x555d68,
    });
    neon.box({
      x: cx,
      y: topY + 0.2 + mh,
      z: cz,
      w: 0.8,
      h: 0.8,
      d: 0.8,
      color: [2.6, 0.55, 0.6],
    });
  }

  // ---- rooftop green ----
  if (profile.rooftopPlant > 0 && rng.chance(profile.rooftopPlant * 0.55)) {
    roofB.box({
      x: cx + rng.range(-cw / 6, cw / 6),
      y: topY + 0.2,
      z: cz + rng.range(-cd / 6, cd / 6),
      w: cw * rng.range(0.3, 0.62),
      h: 0.5,
      d: cd * rng.range(0.3, 0.62),
      color: 0x2f5b34,
      roofColor: 0x3d7a45,
    });
  }

  // ---- signage ----
  if (rng.chance(profile.signs * 0.7)) {
    const side = rng.int(0, 3);
    const bw = rng.range(5, 11);
    const bh = rng.range(3.4, 6.5);
    const sy = y0 + Math.min(Math.max(4, height - bh - 5), rng.range(7, Math.max(9, height * 0.6)));
    placePanel(sign, neon, cx, cz, cw, cd, side, sy, bw, bh, district, rng, false);
  }

  if (height > 42 && rng.chance(0.5)) {
    const side = rng.int(0, 3);
    const bw = Math.min(cw * 0.9, 16);
    placePanel(sign, neon, cx, cz, cw, cd, side, topY + 1.8, bw, bw * 0.55, district, rng, true);
  }

  // ---- solidity --------------------------------------------------------
  // One AABB per lot: the visible volume the player must not walk through.
  ctx.solid?.(lot.x0 - 0.08, lot.z0 - 0.08, lot.x1 + 0.08, lot.z1 + 0.08, y0, topY, 'building');
}

/* ------------------------------------------------------------------ *
 * detail helpers
 * ------------------------------------------------------------------ */

function addFins(trim, cx, cz, w, d, y, h, rng) {
  const step = 3.4;
  const depth = 0.34;
  const col = rng.chance(0.5) ? 0x454d57 : 0x333a43;
  const nx = Math.max(1, Math.floor(w / step));
  const nz = Math.max(1, Math.floor(d / step));
  for (let i = 1; i < nx; i++) {
    const x = cx - w / 2 + i * (w / nx);
    for (const zz of [cz + d / 2 + depth / 2, cz - d / 2 - depth / 2]) {
      trim.box({ x, y, z: zz, w: 0.4, h, d: depth, color: col });
    }
  }
  for (let i = 1; i < nz; i++) {
    const z = cz - d / 2 + i * (d / nz);
    for (const xx of [cx + w / 2 + depth / 2, cx - w / 2 - depth / 2]) {
      trim.box({ x: xx, y, z, w: depth, h, d: 0.4, color: col });
    }
  }
}

function addBalconies(trim, cx, cz, w, d, y, h, district, rng) {
  const floors = Math.floor((h - GROUND_FLOOR) / district.floorH);
  if (floors < 2) return;
  const depth = rng.range(1.0, 1.7);
  const count = Math.min(floors - 1, rng.int(2, 5));
  const side = rng.int(0, 3);
  const span = side % 2 === 0 ? w : d;
  const bw = Math.min(span * 0.7, 6.5);

  for (let k = 0; k < count; k++) {
    const floor = 1 + Math.floor((k * (floors - 1)) / Math.max(1, count));
    const by = y + GROUND_FLOOR + floor * district.floorH - 0.9;
    if (by > y + h - 1.5) break;
    const along = rng.range(-span / 2 + bw / 2 + 0.6, span / 2 - bw / 2 - 0.6);

    let x = cx;
    let z = cz;
    let sx = bw;
    let sz = depth;
    if (side === 0) {
      z = cz + d / 2 + depth / 2;
      x = cx + along;
    } else if (side === 1) {
      z = cz - d / 2 - depth / 2;
      x = cx + along;
    } else if (side === 2) {
      x = cx + w / 2 + depth / 2;
      z = cz + along;
      sx = depth;
      sz = bw;
    } else {
      x = cx - w / 2 - depth / 2;
      z = cz + along;
      sx = depth;
      sz = bw;
    }

    trim.box({ x, y: by, z, w: sx, h: 0.22, d: sz, color: 0x4a515a, roofColor: 0x565e68 });
    trim.box({ x, y: by + 0.22, z, w: sx + 0.08, h: 0.95, d: sz + 0.08, color: 0x2b3138, roofColor: 0x2b3138 });
  }
}

function addAwning(trim, cx, cz, w, d, y, rng) {
  const depth = rng.range(1.6, 2.8);
  const drop = rng.range(0.5, 0.9);
  const col = rng.chance(0.5) ? 0x6a3d2a : 0x2f4a52;
  const dir = rng.chance(0.5) ? 1 : -1;
  const zEdge = cz + (dir > 0 ? d / 2 : -d / 2);
  const zOut = zEdge + dir * depth;

  const span = w * rng.range(0.5, 0.95);
  const x0 = cx - span / 2;
  const x1 = cx + span / 2;
  const yDrop = y - drop;

  // top face — normal points up and away from the wall
  trim.quad([x0, yDrop, zOut], [x1, yDrop, zOut], [x1, y, zEdge], [x0, y, zEdge], rgb(col), {
    uScale: 0.4,
    vScale: 0.4,
  });
  // underside
  trim.quad([x0, y, zEdge], [x1, y, zEdge], [x1, yDrop, zOut], [x0, yDrop, zOut], rgb(0x14171d), {
    uScale: 0.4,
    vScale: 0.4,
  });
  // hanging valance at the outer edge, facing away from the wall
  const val = rgb(shadeHex(col, 1.2));
  if (dir > 0) {
    trim.quad([x0, yDrop - 0.5, zOut], [x1, yDrop - 0.5, zOut], [x1, yDrop, zOut], [x0, yDrop, zOut], val, {
      uScale: 0.4,
      vScale: 0.4,
    });
  } else {
    trim.quad([x1, yDrop - 0.5, zOut], [x0, yDrop - 0.5, zOut], [x0, yDrop, zOut], [x1, yDrop, zOut], val, {
      uScale: 0.4,
      vScale: 0.4,
    });
  }
}

function addPipes(trim, cx, cz, w, d, yBottom, yTop, rng) {
  const h = yTop - yBottom;
  if (h <= 1) return;
  const count = rng.int(1, 3);
  for (let i = 0; i < count; i++) {
    const r = rng.range(0.18, 0.4);
    const side = rng.int(0, 3);
    const along = rng.range(-0.5, 0.5);
    let x = cx;
    let z = cz;
    if (side === 0) {
      z = cz + d / 2 + r;
      x = cx + (w / 2 - 1.2) * along;
    } else if (side === 1) {
      z = cz - d / 2 - r;
      x = cx + (w / 2 - 1.2) * along;
    } else if (side === 2) {
      x = cx + w / 2 + r;
      z = cz + (d / 2 - 1.2) * along;
    } else {
      x = cx - w / 2 - r;
      z = cz + (d / 2 - 1.2) * along;
    }
    trim.cylinder({
      x,
      y: yBottom,
      z,
      rBottom: r,
      rTop: r,
      height: h,
      segments: 7,
      color: rng.chance(0.5) ? 0x6a4a33 : 0x4d565e,
    });
    for (let k = 1; k < 4; k++) {
      trim.box({ x, y: yBottom + (h * k) / 4, z, w: r * 3, h: 0.22, d: r * 3, color: 0x2f353c });
    }
  }
}

function placePanel(signB, neonB, cx, cz, w, d, side, y, bw, bh, district, rng, framed) {
  const atlasCols = 4;
  const atlasRows = 2;
  const u0 = rng.int(0, atlasCols - 1) / atlasCols;
  const v0 = rng.int(0, atlasRows - 1) / atlasRows;
  const du = 1 / atlasCols;
  const dv = 1 / atlasRows;

  const edge = 0.34;
  let x = cx;
  let z = cz;
  let sx = bw;
  let sz = edge;
  if (side === 0) z = cz + d / 2 + edge / 2;
  else if (side === 1) z = cz - d / 2 - edge / 2;
  else if (side === 2) {
    x = cx + w / 2 + edge / 2;
    sx = edge;
    sz = bw;
  } else {
    x = cx - w / 2 - edge / 2;
    sx = edge;
    sz = bw;
  }

  signB.box({
    x,
    y,
    z,
    w: sx,
    h: bh,
    d: sz,
    color: 0xffffff,
    roofColor: 0x1a1d24,
    uScale: du,
    vScale: dv,
    uOff: u0,
    vOff: v0,
    roofUvScale: 0.1,
  });

  if (framed) {
    neonB.box({
      x,
      y: y - 0.55,
      z,
      w: sx * 1.08,
      h: 0.3,
      d: sz * 1.08,
      color: scaleNeon(district.neon, 1.7),
    });
    for (const off of [-bw * 0.3, bw * 0.3]) {
      const lx = side < 2 ? cx + off : x;
      const lz = side < 2 ? z : cz + off;
      neonB.box({ x: lx, y: y - 3.4, z: lz, w: 0.35, h: 3, d: 0.35, color: [0.4, 0.42, 0.48] });
    }
  }
}

/* ------------------------------------------------------------------ */

function yard(ctx, district, rng, lot, base) {
  const yardB = ctx.bucket('roof');
  const trim = ctx.bucket('trim');
  yardB.ground(lot.x0, lot.z0, lot.x1, lot.z1, base + 0.02, rgb(district.ground), {
    uScale: 0.12,
    vScale: 0.12,
  });
  if (rng.chance(0.7)) {
    const n = rng.int(1, 4);
    for (let i = 0; i < n; i++) {
      const w = rng.range(1.4, 3.4);
      const d = w * rng.range(0.7, 1.3);
      const h = rng.range(0.9, 2.4);
      const x = rng.range(lot.x0 + w, Math.max(lot.x0 + w + 0.1, lot.x1 - w));
      const z = rng.range(lot.z0 + w, Math.max(lot.z0 + w + 0.1, lot.z1 - w));
      trim.box({ x, y: base, z, w, h, d, color: 0x3c3227 });
      ctx.solid?.(x - w / 2, z - d / 2, x + w / 2, z + d / 2, base, base + h, 'yard');
    }
  }
}

function ruin(ctx, cell, district, rng, lot, base) {
  const facade = ctx.bucket(`facade:${cell.district}:${rng.int(0, FACADE_VARIANTS - 1)}`);
  const trim = ctx.bucket('trim');
  const sink = rng.range(1.6, 3.2);
  const h = rng.range(3, 9);
  const cx = (lot.x0 + lot.x1) / 2;
  const cz = (lot.z0 + lot.z1) / 2;
  const bw = Math.max(4, (lot.x1 - lot.x0) * rng.range(0.5, 0.9));
  const bd = Math.max(4, (lot.z1 - lot.z0) * rng.range(0.5, 0.9));
  facade.box({
    x: cx,
    y: base - sink,
    z: cz,
    w: bw,
    h,
    d: bd,
    color: shadeHex(district.facadeTint, 0.72),
    uScale: 1 / district.moduleW,
    vScale: 1 / district.floorH,
    uOff: rng.int(0, 3),
    vOff: rng.int(0, 3),
    shell: 0.06,
  });
  trim.box({ x: cx + 3, y: base - 0.9, z: cz + 2, w: 3, h: 2.4, d: 3, color: 0x4a5159 });
  ctx.solid?.(cx - bw / 2, cz - bd / 2, cx + bw / 2, cz + bd / 2, base - sink, base - sink + h, 'ruin');
  ctx.solid?.(cx + 1.5, cz + 0.5, cx + 4.5, cz + 3.5, base - 0.9, base + 1.5, 'ruin');
}

/** Boost an sRGB hex into linear-space glow values above 1.0. */
function scaleNeon(hex, k) {
  const c = rgb(hex);
  return [c[0] * k, c[1] * k, c[2] * k];
}

/**
 * Seeded brightness/hue jitter for one building's walls. Keeps the district
 * identity (base hue) while breaking the "identical cube" read.
 */
function varyTint(hex, rng) {
  const k = rng.range(0.78, 1.16);
  const wr = rng.range(-10, 10);
  const wb = -wr * 0.7;
  const ch = (v, d) => Math.max(0, Math.min(255, Math.round(v * k + d)));
  const r = ch((hex >> 16) & 255, wr);
  const g = ch((hex >> 8) & 255, wr * 0.3);
  const b = ch(hex & 255, wb);
  return (r << 16) | (g << 8) | b;
}
