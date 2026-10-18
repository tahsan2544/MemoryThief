import * as THREE from 'three';
import { DISTRICTS } from '../config/districts.js';
import { createRng } from '../core/rng.js';
import { rgb, shadeHex, uvPhase, windowUV } from '../utils/geo.js';
import { generateBuildingsInRect } from './buildings.js';

/**
 * The five recognisable landmarks of Eidolon City.
 *
 * They exist to give the player (and the free-flight camera) fixed points of
 * orientation: a corporate tower, a night market, a flooded transit station,
 * an overgrown public garden, and the sealed Underarchive entrance.
 *
 * All landmark geometry is merged into the same per-chunk material buckets as
 * ordinary buildings, so the landmarks cost no extra draw calls.
 */

export function buildLandmark(type, cell, ctx) {
  switch (type) {
    case 'tower':
      return corporateTower(cell, ctx);
    case 'market':
      return nightMarket(cell, ctx);
    case 'station':
      return floodedStation(cell, ctx);
    case 'garden':
      return overgrownGarden(cell, ctx);
    case 'archive':
      return underarchiveEntrance(cell, ctx);
    default:
      return;
  }
}

/**
 * A closed ring of instanced safety barriers around a hazard (pit, shaft).
 * Spacing is chosen so the *collision* boxes overlap: the visual 0.5 m gaps
 * between barriers read as a picket line, but a person cannot squeeze out.
 */
function addBarrierRing(placer, x0, z0, w, d, y, inset = 3) {
  const spacing = 2.8;
  // rows span the full outer perimeter (including corners) so the four runs
  // overlap into one watertight rectangle
  const spanW = w + inset * 2;
  const spanD = d + inset * 2;
  const nx = Math.max(2, Math.round(spanW / spacing));
  const nz = Math.max(2, Math.round(spanD / spacing));
  for (let i = 0; i < nx; i++) {
    const x = x0 - inset + ((i + 0.5) * spanW) / nx;
    placer.add('barrier', x, y, z0 - inset, 0, 1, 0xd0d4da);
    placer.add('barrier', x, y, z0 + d + inset, 0, 1, 0xd0d4da);
  }
  for (let i = 0; i < nz; i++) {
    const z = z0 - inset + ((i + 0.5) * spanD) / nz;
    placer.add('barrier', x0 - inset, y, z, Math.PI / 2, 1, 0xd0d4da);
    placer.add('barrier', x0 + w + inset, y, z, Math.PI / 2, 1, 0xd0d4da);
  }
}

/* ==================================================================== *
 * 1. PALISADE CORPORATE TOWER — Glassline
 * ==================================================================== */

function corporateTower(cell, ctx) {
  const D = DISTRICTS[cell.district];
  const rng = createRng(cell.seed ^ 0x7a11);
  const base = ctx.layout.curb;
  const facade = ctx.bucket(`facade:${cell.district}:0`);
  const trim = ctx.bucket('trim');
  const roofB = ctx.bucket('roof');
  const neon = ctx.bucket('neon');
  const sign = ctx.bucket('plateLogo');

  const cx = cell.cx;
  const cz = cell.cz;
  const neonCol = rgb(D.neon).map((v) => v * 2.1);
  const phase = uvPhase(rng);
  const uv = windowUV(D, phase[0], phase[1]);
  const wall = D.facadeTint;

  // plaza slab
  roofB.box({
    x: cx,
    y: 0,
    z: cz,
    w: cell.x1 - cell.x0,
    h: base,
    d: cell.z1 - cell.z0,
    color: 0x232833,
    roofColor: 0x2b3140,
    roofUvScale: 0.08,
  });

  // ---- podium ----
  const pw = 62;
  const pd = 60;
  const ph = 14;
  facade.box({
    x: cx,
    y: base,
    z: cz,
    w: pw,
    h: ph,
    d: pd,
    color: shadeHex(wall, 1.08),
    uScale: uv.uScale,
    vScale: uv.vScale,
    uOff: uv.uOff,
    vOff: uv.vOff,
    shell: 0.08,
  });
  // colonnade on the +z (street) face
  for (let i = -4; i <= 4; i++) {
    trim.cylinder({
      x: cx + i * 6.6,
      y: base,
      z: cz + pd / 2 + 1.6,
      rBottom: 1.1,
      rTop: 1.0,
      height: ph + 1.2,
      segments: 10,
      color: 0x8d97a6,
      caps: false,
    });
  }
  trim.box({ x: cx, y: base + ph, z: cz + pd / 2 + 1.6, w: pw, h: 1.6, d: 4, color: 0x9aa5b4 });
  // entrance recess
  trim.box({ x: cx, y: base, z: cz + pd / 2 - 1, w: 16, h: 9, d: 3, color: 0x10151c });
  neon.box({ x: cx, y: base + 8.6, z: cz + pd / 2 + 0.6, w: 15, h: 0.4, d: 0.6, color: neonCol });

  // logo band on podium
  for (const b of [
    { dx: 0, dz: pd / 2 + 0.4, w: 34, d: 1.2 },
    { dx: 0, dz: -pd / 2 - 0.4, w: 34, d: 1.2 },
    { dx: pw / 2 + 0.4, dz: 0, w: 1.2, d: 30 },
    { dx: -pw / 2 - 0.4, dz: 0, w: 1.2, d: 30 },
  ]) {
    sign.box({
      x: cx + b.dx,
      y: base + ph - 6.4,
      z: cz + b.dz,
      w: b.w,
      h: 4.2,
      d: b.d,
      color: 0xffffff,
      uScale: 1,
      vScale: 1,
      roofUvScale: 0.1,
    });
  }

  // ---- shaft with setbacks ----
  const totalH = rng.range(132, 158);
  const tiers = [
    { w: 34, d: 33, h: totalH * 0.44 },
    { w: 27, d: 26, h: totalH * 0.32 },
    { w: 20, d: 20, h: totalH * 0.24 },
  ];
  let y = base + ph;
  for (let t = 0; t < tiers.length; t++) {
    const tier = tiers[t];
    facade.box({
      x: cx,
      y,
      z: cz,
      w: tier.w,
      h: tier.h,
      d: tier.d,
      color: wall,
      uScale: uv.uScale,
      vScale: uv.vScale,
      uOff: uv.uOff + t,
      vOff: uv.vOff,
    });
    // vertical fins
    const fins = Math.max(3, Math.floor(tier.w / 4.2));
    for (let i = 1; i < fins; i++) {
      const fx = cx - tier.w / 2 + (i * tier.w) / fins;
      trim.box({ x: fx, y, z: cz + tier.d / 2 + 0.3, w: 0.5, h: tier.h, d: 0.6, color: 0x596373 });
      trim.box({ x: fx, y, z: cz - tier.d / 2 - 0.3, w: 0.5, h: tier.h, d: 0.6, color: 0x596373 });
      const fz = cz - tier.d / 2 + (i * tier.d) / fins;
      trim.box({ x: cx + tier.w / 2 + 0.3, y, z: fz, w: 0.6, h: tier.h, d: 0.5, color: 0x596373 });
      trim.box({ x: cx - tier.w / 2 - 0.3, y, z: fz, w: 0.6, h: tier.h, d: 0.5, color: 0x596373 });
    }
    // crown ring of light at each setback
    neon.box({ x: cx, y: y + tier.h - 0.5, z: cz, w: tier.w + 1.4, h: 0.45, d: tier.d + 1.4, color: neonCol });
    y += tier.h;
  }

  // big logo band mid-shaft
  sign.box({
    x: cx,
    y: base + ph + totalH * 0.3,
    z: cz + tiers[0].d / 2 + 0.6,
    w: 30,
    h: 7.5,
    d: 1.2,
    color: 0xffffff,
    uScale: 1,
    vScale: 1,
  });

  // ---- crown + mast ----
  trim.box({ x: cx, y, z: cz, w: 22, h: 3, d: 22, color: 0x3c4450 });
  trim.cylinder({ x: cx, y: y + 3, z: cz, rBottom: 5, rTop: 3.4, height: 9, segments: 12, color: 0x4a5462, caps: true });
  trim.cylinder({ x: cx, y: y + 12, z: cz, rBottom: 1.1, rTop: 0.35, height: 46, segments: 8, color: 0x7d8899 });
  neon.box({ x: cx, y: y + 58, z: cz, w: 1.8, h: 1.8, d: 1.8, color: [3.2, 0.5, 0.55] });
  roofB.box({ x: cx, y, z: cz, w: 19, h: 0.3, d: 19, color: 0x2f3540, roofColor: 0x2f3540 });

  // ---- surrounding low blocks (fill the rest of the cell) ----
  const strips = [
    { x0: cell.x0 + 5, z0: cell.z0 + 5, x1: cell.x1 - 5, z1: cz - pd / 2 - 6 },
    { x0: cell.x0 + 5, z0: cz + pd / 2 + 6, x1: cell.x1 - 5, z1: cell.z1 - 5 },
  ].filter((r) => r.z1 - r.z0 > 10);
  for (const s of strips) {
    generateBuildingsInRect(ctx, cell, rng, s, { pattern: [3, 1], gap: 3 });
  }

  // solidity: podium volume (the strips above register their own boxes)
  ctx.solid?.(cx - pw / 2, cz - pd / 2, cx + pw / 2, cz + pd / 2, base, base + ph, 'landmark');

  return { name: 'PALISADE Tower', height: y + 58 };
}

/* ==================================================================== *
 * 2. NIGHT MARKET — Old Quarter
 * ==================================================================== */

function nightMarket(cell, ctx) {
  const D = DISTRICTS[cell.district];
  const rng = createRng(cell.seed ^ 0x33ac);
  const base = ctx.layout.curb;
  const trim = ctx.bucket('trim');
  const roofB = ctx.bucket('roof');
  const neon = ctx.bucket('neon');
  const sign = ctx.bucket('plateMarket');

  const cx = cell.cx;
  const cz = cell.cz;

  // plaza paving
  roofB.box({
    x: cx,
    y: 0,
    z: cz,
    w: cell.x1 - cell.x0,
    h: base,
    d: cell.z1 - cell.z0,
    color: 0x5c4f3f,
    roofColor: 0x6d5f4c,
    roofUvScale: 0.09,
  });
  // inlaid darker walkway
  roofB.box({
    x: cx,
    y: base,
    z: cz,
    w: (cell.x1 - cell.x0) * 0.9,
    h: 0.06,
    d: 7,
    color: 0x2a241d,
    roofColor: 0x2a241d,
    roofUvScale: 0.2,
  });

  // ---- gateway arch on the north side ----
  const gz = cell.z0 + 7;
  const archW = 34;
  for (const sx of [-1, 1]) {
    trim.box({ x: cx + (sx * archW) / 2, y: base, z: gz, w: 3, h: 11, d: 3, color: 0x6d5a45 });
    trim.box({ x: cx + (sx * archW) / 2, y: base + 11, z: gz, w: 3.8, h: 1, d: 3.8, color: 0x7d6a52 });
  }
  trim.box({ x: cx, y: base + 12, z: gz, w: archW + 4, h: 3.4, d: 3.4, color: 0x6d5a45 });
  sign.box({
    x: cx,
    y: base + 8.6,
    z: gz + 1.9,
    w: 30,
    h: 6,
    d: 0.5,
    color: 0xffffff,
    uScale: 1,
    vScale: 1,
  });
  neon.box({ x: cx, y: base + 15.6, z: gz, w: archW + 5, h: 0.35, d: 4.2, color: rgb(D.neon).map((v) => v * 2.2) });

  // ---- stalls: two rows either side of the central walkway ----
  const stalls = Math.round(14 * Math.min(1.5, ctx.density));
  for (let i = 0; i < stalls; i++) {
    const row = i % 2 === 0 ? -1 : 1;
    const t = Math.floor(i / 2) / Math.max(1, Math.floor(stalls / 2));
    const px = cell.x0 + 9 + t * (cell.x1 - cell.x0 - 18);
    const pz = cz + row * 9;
    const ry = row > 0 ? Math.PI : 0;
    ctx.placer.add('stallBase', px, base, pz, ry, rng.range(0.95, 1.15), rng.pick([0xa89070, 0x8f7a5e]));
    ctx.placer.add('stallCanopy', px, base, pz, ry, rng.range(0.95, 1.15), pickStall(rng));
    if (rng.chance(0.6)) ctx.placer.add('crate', px + rng.range(-3, 3), base, pz + rng.range(-3, 3), rng.range(0, 6.3), 1, 0x9a7f58);
    // warm strip light under the canopy lip so the stalls read from the air
    neon.box({ x: px, y: base + 2.05, z: pz + (row > 0 ? -1.05 : 1.05), w: 3.0, h: 0.16, d: 0.3, color: [2.4, 1.75, 0.95] });
    // bulb above each stall
    neon.box({ x: px, y: base + 3.4, z: pz, w: 0.5, h: 0.5, d: 0.5, color: [2.8, 2.1, 1.1] });
  }

  // festoon light strings across the square
  const bulbs = 46;
  for (let i = 0; i < bulbs; i++) {
    const t = i / bulbs;
    const line = i % 3;
    const px = cell.x0 + 6 + t * (cell.x1 - cell.x0 - 12);
    const sag = Math.sin(t * Math.PI) * 2.4;
    const pz = cz + (line - 1) * 13;
    neon.box({ x: px, y: base + 9.6 - sag, z: pz, w: 0.55, h: 0.55, d: 0.55, color: [2.8, 2.1, 1.15] });
  }
  // string poles
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 0, 1]) {
      trim.cylinder({
        x: cx + sx * ((cell.x1 - cell.x0) / 2 - 5),
        y: base,
        z: cz + sz * 13,
        rBottom: 0.16,
        rTop: 0.12,
        height: 11,
        segments: 6,
        color: 0x5d5347,
      });
    }
  }

  // ---- central stage ----
  trim.box({ x: cx, y: base, z: cz + 22, w: 16, h: 1.2, d: 9, color: 0x55483a });
  for (const px of [-7, 7]) {
    for (const pz of [-3.6, 3.6]) {
      trim.cylinder({ x: cx + px, y: base + 1.2, z: cz + 22 + pz, rBottom: 0.2, rTop: 0.2, height: 5.5, segments: 6, color: 0x6a5c4a });
    }
  }
  trim.box({ x: cx, y: base + 6.7, z: cz + 22, w: 17, h: 0.4, d: 10, color: 0x3d4b60 });
  neon.box({ x: cx, y: base + 6.3, z: cz + 17.2, w: 16, h: 0.3, d: 0.4, color: rgb(D.neon).map((v) => v * 2.4) });

  // ---- framing buildings on east/west strips ----
  generateBuildingsInRect(ctx, cell, rng, { x0: cell.x0 + 4, z0: cell.z0 + 4, x1: cell.x0 + 22, z1: cell.z1 - 4 }, {
    pattern: [1, 4],
    gap: 1.6,
  });
  generateBuildingsInRect(ctx, cell, rng, { x0: cell.x1 - 22, z0: cell.z0 + 4, x1: cell.x1 - 4, z1: cell.z1 - 4 }, {
    pattern: [1, 4],
    gap: 1.6,
  });

  // solidity: gateway piers and the stage block
  for (const sx of [-1, 1]) {
    const px = cx + (sx * archW) / 2;
    ctx.solid?.(px - 1.6, gz - 1.6, px + 1.6, gz + 1.6, base, base + 12, 'landmark');
  }
  ctx.solid?.(cx - 8, cz + 22 - 4.5, cx + 8, cz + 22 + 4.5, base, base + 1.2, 'landmark');

  return { name: 'Night Market' };
}

const STALL_TINTS = [0xc4563f, 0x3f7fa8, 0xd08a34, 0x56764a, 0x9a5aa0, 0xb5453f, 0xd8b23a];
function pickStall(rng) {
  return STALL_TINTS[rng.int(0, STALL_TINTS.length - 1)];
}

/* ==================================================================== *
 * 3. FLOODED TRANSIT STATION — Floodworks
 * ==================================================================== */

function floodedStation(cell, ctx) {
  const D = DISTRICTS[cell.district];
  const rng = createRng(cell.seed ^ 0x51a7);
  const base = ctx.layout.curb;
  const facade = ctx.bucket(`facade:${cell.district}:0`);
  const trim = ctx.bucket('trim');
  const roofB = ctx.bucket('roof');
  const neon = ctx.bucket('neon');
  const sign = ctx.bucket('plateTransit');
  const water = ctx.bucket('water');

  const cx = cell.cx;
  const cz = cell.cz;
  const rim = 9;
  const W = cell.x1 - cell.x0 - 8 - rim * 2; // pit width (hole in the slab)
  const L = cell.z1 - cell.z0 - 8 - rim * 2; // pit length
  const depth = 5.5;
  const floorY = base - depth;

  // concourse slab around an open pit
  for (const [x0, z0, x1, z1] of [
    [cell.x0 + 4, cell.z0 + 4, cell.x1 - 4, cell.z0 + 4 + rim],
    [cell.x0 + 4, cell.z1 - 4 - rim, cell.x1 - 4, cell.z1 - 4],
    [cell.x0 + 4, cell.z0 + 4 + rim, cell.x0 + 4 + rim, cell.z1 - 4 - rim],
    [cell.x1 - 4 - rim, cell.z0 + 4 + rim, cell.x1 - 4, cell.z1 - 4 - rim],
  ]) {
    roofB.box({
      x: (x0 + x1) / 2,
      y: 0,
      z: (z0 + z1) / 2,
      w: x1 - x0,
      h: base,
      d: z1 - z0,
      color: 0x2b3238,
      roofColor: 0x525d66,
      roofUvScale: 0.1,
    });
  }

  // pit floor
  roofB.box({ x: cx, y: floorY, z: cz, w: W, h: 0.5, d: L, color: 0x1b2128, roofColor: 0x242b33, roofUvScale: 0.12 });

  // hazard-glow outline around the open pit so it reads from the air
  const rimGlow = rgb(D.neon).map((v) => v * 2.2);
  for (const [x, z, w, d] of [
    [cx, cz - L / 2 + 0.4, W, 0.8],
    [cx, cz + L / 2 - 0.4, W, 0.8],
    [cx - W / 2 + 0.4, cz, 0.8, L],
    [cx + W / 2 - 0.4, cz, 0.8, L],
  ]) {
    neon.box({ x, y: base + 0.1, z, w, h: 0.22, d, color: rimGlow });
  }

  // pit retaining walls (seen from inside the hole)
  const wallT = 1.4;
  for (const s of [
    { x: cx, z: cz - L / 2, w: W, d: wallT },
    { x: cx, z: cz + L / 2, w: W, d: wallT },
    { x: cx - W / 2, z: cz, w: wallT, d: L },
    { x: cx + W / 2, z: cz, w: wallT, d: L },
  ]) {
    facade.box({
      x: s.x,
      y: floorY,
      z: s.z,
      w: s.w,
      h: depth,
      d: s.d,
      color: shadeHex(D.facadeTint, 0.55),
      uScale: 1 / D.moduleW,
      vScale: 1 / D.floorH,
      uOff: rng.int(0, 3),
      vOff: 0,
    });
  }

  // water inside the pit
  water.box({
    x: cx,
    y: floorY + 2.0,
    z: cz,
    w: W - 1.2,
    h: 0.14,
    d: L - 1.2,
    color: 0xffffff,
  });

  // platform edge + rails
  trim.box({ x: cx, y: floorY + 2.0, z: cz - L * 0.28, w: W - 2, h: 1.1, d: 3.4, color: 0x6a7078 });
  trim.box({ x: cx, y: floorY + 1.2, z: cz + L * 0.05, w: W - 2, h: 0.35, d: 0.5, color: 0x8b939d });
  trim.box({ x: cx, y: floorY + 1.2, z: cz + L * 0.16, w: W - 2, h: 0.35, d: 0.5, color: 0x8b939d });
  for (let i = 0; i < 26; i++) {
    trim.box({
      x: cx - (W - 6) / 2 + (i * (W - 6)) / 25,
      y: floorY + 0.9,
      z: cz + L * 0.1,
      w: 1.1,
      h: 0.3,
      d: 6,
      color: 0x40474e,
    });
  }

  // broken roof slabs
  for (let i = 0; i < 4; i++) {
    const sw = rng.range(8, 16);
    const sd = rng.range(6, 12);
    trim.box({
      x: cx + rng.range(-W / 2 + 6, W / 2 - 6),
      y: base + rng.range(-1.5, 1.5),
      z: cz + rng.range(-L / 2 + 6, L / 2 - 6),
      w: sw,
      h: 0.5,
      d: sd,
      color: 0x535c66,
      rotate: [rng.range(-0.35, 0.35), rng.range(0, 3), rng.range(-0.2, 0.2)],
    });
  }

  // columns
  for (const px of [-1, 0, 1]) {
    for (const pz of [-1, 1]) {
      trim.cylinder({
        x: cx + px * (W / 2 - 6),
        y: floorY,
        z: cz + pz * (L / 2 - 6),
        rBottom: 0.9,
        rTop: 0.8,
        height: depth,
        segments: 10,
        color: 0x767f8a,
      });
    }
  }

  // stepped descent from the concourse into the water
  const steps = 9;
  for (let i = 0; i < steps; i++) {
    trim.box({
      x: cx,
      y: base - 0.55 - i * 0.55,
      z: cz + L / 2 - 5 - i * 1.05,
      w: 9,
      h: 0.55,
      d: 1.1,
      color: 0x5d666f,
    });
  }

  // signage, standing on the south rim and looking into the pit
  const signZ = cz + L / 2 + rim / 2;
  trim.box({ x: cx - 13, y: base, z: signZ, w: 0.7, h: 12, d: 0.7, color: 0x6d7684 });
  trim.box({ x: cx + 13, y: base, z: signZ, w: 0.7, h: 12, d: 0.7, color: 0x6d7684 });
  sign.box({
    x: cx,
    y: base + 5.5,
    z: signZ,
    w: 26,
    h: 6,
    d: 0.6,
    color: 0xffffff,
    uScale: 1,
    vScale: 1,
  });
  neon.box({ x: cx, y: base + 12.2, z: signZ, w: 27, h: 0.4, d: 1.0, color: rgb(D.neon).map((v) => v * 2.3) });

  // surface-level ruin hints
  trim.box({ x: cx - W * 0.35, y: base, z: cz - L * 0.4, w: 5, h: 3.2, d: 4, color: 0x4b535c, rotate: [0, 0.4, 0.12] });
  ctx.placer.add('pipeRun', cell.x0 + 14, base + 1.2, cell.z1 - 10, 0, 1.2, 0x6d7a84);
  ctx.placer.add('valve', cell.x1 - 14, base, cell.z0 + 12, 0.6, 1.3, 0x7a6a58);

  // hazard barriers around the open pit: you can look in, not fall in
  addBarrierRing(ctx.placer, cx - W / 2, cz - L / 2, W, L, base, 3);

  return { name: 'Floodworks Transit — Line 4' };
}

/* ==================================================================== *
 * 4. OVERGROWN PUBLIC GARDEN — Verdant Ward
 * ==================================================================== */

function overgrownGarden(cell, ctx) {
  const D = DISTRICTS[cell.district];
  const rng = createRng(cell.seed ^ 0x1ee7);
  const base = ctx.layout.curb;
  const trim = ctx.bucket('trim');
  const roofB = ctx.bucket('roof');
  const neon = ctx.bucket('neon');
  const glassB = ctx.bucket('glass');
  const water = ctx.bucket('water');

  const cx = cell.cx;
  const cz = cell.cz;
  const grass = rgb(0x2c4a2b);
  const path = rgb(0x57503f);

  // lawn
  roofB.box({
    x: cx,
    y: 0,
    z: cz,
    w: cell.x1 - cell.x0,
    h: base,
    d: cell.z1 - cell.z0,
    color: 0x1d2a1c,
    roofColor: grass,
    roofUvScale: 0.12,
  });
  // cross paths
  roofB.box({ x: cx, y: base, z: cz, w: cell.x1 - cell.x0 - 6, h: 0.06, d: 5, color: path, roofColor: path, roofUvScale: 0.25 });
  roofB.box({ x: cx, y: base, z: cz, w: 5, h: 0.06, d: cell.z1 - cell.z0 - 6, color: path, roofColor: path, roofUvScale: 0.25 });

  // ---- conservatory dome ----
  const dx = cx - 16;
  const dz = cz - 14;
  const r = 15;
  glassB.geometry(new THREE.SphereGeometry(r, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), {
    position: [dx, base + 0.4, dz],
  }, 0xffffff);
  for (let k = 0; k < 6; k++) {
    trim.geometry(new THREE.TorusGeometry(r, 0.2, 5, 22, Math.PI), {
      position: [dx, base + 0.4, dz],
      rotation: [0, (k * Math.PI) / 6, 0],
    }, 0x93a3b3);
  }
  trim.geometry(new THREE.TorusGeometry(r, 0.3, 6, 34), { position: [dx, base + 0.4, dz], rotation: [Math.PI / 2, 0, 0] }, 0x93a3b3);
  trim.cylinder({ x: dx, y: base + 0.4, z: dz, rBottom: r - 1.4, rTop: r - 1.4, height: 0.4, segments: 26, color: 0x4a5344, caps: true });
  // dome lantern
  trim.cylinder({ x: dx, y: base + r, z: dz, rBottom: 2.4, rTop: 1.6, height: 3.2, segments: 12, color: 0x93a3b3, caps: true });
  neon.box({ x: dx, y: base + r + 3.4, z: dz, w: 1.1, h: 1.1, d: 1.1, color: rgb(D.neon).map((v) => v * 2.2) });

  // ---- pond ----
  const px = cx + 22;
  const pz = cz + 18;
  const pr = 13;
  // the retaining ring stands ~0.8 m proud of the lawn so it reads (and
  // blocks) as a low wall instead of an invisible lip over the water
  trim.cylinder({ x: px, y: base - 1.1, z: pz, rBottom: pr + 1.2, rTop: pr + 1.4, height: 1.9, segments: 30, color: 0x4a4636, caps: false });
  water.cylinder({ x: px, y: base - 0.6, z: pz, rBottom: pr, rTop: pr, height: 0.2, segments: 30, color: 0xffffff, caps: true });
  ctx.solidCircle?.(px, pz, pr + 1.5, base - 1.1, base + 0.8, 'pond');
  ctx.solidCircle?.(dx, dz, r + 0.3, base, base + r, 'dome');

  // ---- pergola walk ----
  for (let i = 0; i < 8; i++) {
    const gx = cx - 26 + i * 7;
    const gz = cz + 24;
    trim.box({ x: gx, y: base, z: gz - 2.4, w: 0.5, h: 4.2, d: 0.5, color: 0x7d715c });
    trim.box({ x: gx, y: base, z: gz + 2.4, w: 0.5, h: 4.2, d: 0.5, color: 0x7d715c });
    trim.box({ x: gx, y: base + 4.2, z: gz, w: 0.5, h: 0.3, d: 5.6, color: 0x6b6150 });
    if (i % 2 === 0) neon.box({ x: gx, y: base + 4.6, z: gz, w: 0.5, h: 0.5, d: 0.5, color: [2.4, 1.9, 1.2] });
  }

  // ---- planting beds ----
  for (let i = 0; i < 9; i++) {
    const bx = rng.range(cell.x0 + 8, cell.x1 - 8);
    const bz = rng.range(cell.z0 + 8, cell.z1 - 8);
    if (Math.hypot(bx - dx, bz - dz) < r + 4) continue;
    if (Math.hypot(bx - px, bz - pz) < pr + 4) continue;
    const bw = rng.range(4, 9);
    const bd = rng.range(4, 9);
    trim.box({ x: bx, y: base, z: bz, w: bw, h: 0.7, d: bd, color: 0x5a5342, roofColor: 0x2f4a2c });
    ctx.solid?.(bx - bw / 2, bz - bd / 2, bx + bw / 2, bz + bd / 2, base, base + 0.7, 'bed');
  }

  // ---- trees & furniture ----
  const treeCount = Math.round(34 * Math.min(1.6, ctx.density));
  for (let i = 0; i < treeCount; i++) {
    const tx = rng.range(cell.x0 + 5, cell.x1 - 5);
    const tz = rng.range(cell.z0 + 5, cell.z1 - 5);
    if (Math.hypot(tx - dx, tz - dz) < r + 3) continue;
    if (Math.hypot(tx - px, tz - pz) < pr + 3) continue;
    ctx.placer.addTree(tx, base, tz, rng.range(0.9, 1.9), pickGreen(rng));
  }
  for (let i = 0; i < 8; i++) {
    ctx.placer.add('bench', rng.range(cell.x0 + 8, cell.x1 - 8), base, rng.range(cell.z0 + 8, cell.z1 - 8), rng.range(0, 6.3), 1, 0xa8977a);
  }
  for (let i = 0; i < 6; i++) {
    ctx.placer.add('planter', rng.range(cell.x0 + 8, cell.x1 - 8), base, rng.range(cell.z0 + 8, cell.z1 - 8), rng.range(0, 6.3), rng.range(1, 1.5), 0x6a7480);
  }

  // perimeter hedge — split where the two cross paths meet the boundary so
  // the garden is actually enterable, then made solid
  const hedgeCol = 0x35572f;
  const gap = 3; // half-width of the 5 m paths plus a shoulder
  const hedgeSegs = [];
  for (const [za, zb] of [[cell.z0 + 4, cell.z0 + 6], [cell.z1 - 6, cell.z1 - 4]]) {
    for (const [xa, xb] of [[cell.x0 + 4, cx - gap], [cx + gap, cell.x1 - 4]]) {
      if (xb - xa > 1) hedgeSegs.push([xa, za, xb, zb]);
    }
  }
  for (const [xa, xb] of [[cell.x0 + 4, cell.x0 + 6], [cell.x1 - 6, cell.x1 - 4]]) {
    for (const [za, zb] of [[cell.z0 + 4, cz - gap], [cz + gap, cell.z1 - 4]]) {
      if (zb - za > 1) hedgeSegs.push([xa, za, xb, zb]);
    }
  }
  for (const [x0, z0, x1, z1] of hedgeSegs) {
    trim.box({
      x: (x0 + x1) / 2,
      y: base,
      z: (z0 + z1) / 2,
      w: x1 - x0,
      h: 1.1,
      d: z1 - z0,
      color: hedgeCol,
      roofColor: 0x44703c,
    });
    ctx.solid?.(x0, z0, x1, z1, base, base + 1.1, 'hedge');
  }

  return { name: 'Verdant Public Garden' };
}

const GREEN_TINTS = [0x4f8a4a, 0x3f7a52, 0x62984a, 0x487f63, 0x5c9a58, 0x7a9a4a, 0x89a35a];
function pickGreen(rng) {
  return GREEN_TINTS[rng.int(0, GREEN_TINTS.length - 1)];
}

/* ==================================================================== *
 * 5. THE UNDERARCHIVE ENTRANCE — sealed, for a later phase
 * ==================================================================== */

function underarchiveEntrance(cell, ctx) {
  const D = DISTRICTS[cell.district];
  const rng = createRng(cell.seed ^ 0x0d0d);
  const base = ctx.layout.curb;
  const trim = ctx.bucket('trim');
  const roofB = ctx.bucket('roof');
  const neon = ctx.bucket('neon');
  const sign = ctx.bucket('plateArchive');
  const logo = ctx.bucket('plateLogo');

  const cx = cell.cx;
  const cz = cell.cz;
  const rim = 16;
  const W = cell.x1 - cell.x0 - 6 - rim * 2; // shaft opening
  const L = cell.z1 - cell.z0 - 6 - rim * 2;
  const depth = 9;
  const red = rgb(0xff3b47).map((v) => v * 2.4);

  // paved plaza with a square void
  const slabs = [
    [cell.x0 + 3, cell.z0 + 3, cell.x1 - 3, cell.z0 + 3 + rim],
    [cell.x0 + 3, cell.z1 - 3 - rim, cell.x1 - 3, cell.z1 - 3],
    [cell.x0 + 3, cell.z0 + 3 + rim, cell.x0 + 3 + rim, cell.z1 - 3 - rim],
    [cell.x1 - 3 - rim, cell.z0 + 3 + rim, cell.x1 - 3, cell.z1 - 3 - rim],
  ];
  for (const [x0, z0, x1, z1] of slabs) {
    roofB.box({
      x: (x0 + x1) / 2,
      y: 0,
      z: (z0 + z1) / 2,
      w: x1 - x0,
      h: base,
      d: z1 - z0,
      color: 0x1a1c22,
      roofColor: 0x2e313a,
      roofUvScale: 0.1,
    });
  }

  // recessed stairwell
  const ox0 = cx - W / 2;
  const oz0 = cz - L / 2;
  roofB.box({
    x: cx,
    y: base - depth,
    z: cz,
    w: W,
    h: 0.4,
    d: L,
    color: 0x14161b,
    roofColor: 0x22252c,
    roofUvScale: 0.12,
  });
  // recess walls (inward facing): four thin boxes
  for (const [x0, z0, x1, z1] of [
    [ox0, oz0, ox0 + 1.4, oz0 + L],
    [ox0 + W - 1.4, oz0, ox0 + W, oz0 + L],
    [ox0, oz0, ox0 + W, oz0 + 1.4],
    [ox0, oz0 + L - 1.4, ox0 + W, oz0 + L],
  ]) {
    trim.box({
      x: (x0 + x1) / 2,
      y: base - depth,
      z: (z0 + z1) / 2,
      w: x1 - x0,
      h: depth,
      d: z1 - z0,
      color: 0x2b2f38,
      roofColor: 0x3a3f4a,
    });
  }

  // stairs down into the shaft (from the +z rim)
  const steps = 14;
  const stepDrop = depth / steps;
  for (let i = 0; i < steps; i++) {
    trim.box({
      x: cx,
      y: base - (i + 1) * stepDrop,
      z: oz0 + L - 2.2 - i * 2.2,
      w: 15,
      h: stepDrop,
      d: 2.3,
      color: 0x4a4f5a,
      roofColor: 0x5a606c,
    });
  }

  // ---- sealed vault door at the bottom of the shaft ----
  const doorZ = oz0 + 3.2;
  trim.box({ x: cx, y: base - depth, z: doorZ, w: 34, h: depth, d: 4, color: 0x30343d, roofColor: 0x3a3f4a });
  const doorY = base - depth / 2 - 0.3;
  const doorFace = doorZ + 2.0;
  trim.cylinder({
    x: cx,
    y: doorY,
    z: doorFace,
    rBottom: 3.9,
    rTop: 3.9,
    height: 1.5,
    segments: 26,
    color: 0x5d6470,
    rotate: [Math.PI / 2, 0, 0],
    caps: true,
  });
  trim.cylinder({
    x: cx,
    y: doorY,
    z: doorFace + 1.5,
    rBottom: 2.7,
    rTop: 2.7,
    height: 0.6,
    segments: 22,
    color: 0x767d8b,
    rotate: [Math.PI / 2, 0, 0],
    caps: true,
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    trim.box({
      x: cx + Math.cos(a) * 3.15,
      y: doorY + Math.sin(a) * 3.15,
      z: doorFace + 2.1,
      w: 0.75,
      h: 0.75,
      d: 0.7,
      color: 0x9aa2af,
    });
  }
  neon.box({ x: cx, y: doorY + 4.6, z: doorFace + 2.0, w: 13, h: 0.5, d: 0.6, color: red });

  // hazard chevrons around the rim
  const chev = 16;
  for (let i = 0; i < chev; i++) {
    const t = i / chev;
    neon.box({ x: ox0 + t * W, y: base + 0.07, z: oz0 - 1.7, w: 1.7, h: 0.12, d: 2.8, color: red });
    neon.box({ x: ox0 + t * W, y: base + 0.07, z: oz0 + L + 1.7, w: 1.7, h: 0.12, d: 2.8, color: red });
    neon.box({ x: ox0 - 1.7, y: base + 0.07, z: oz0 + t * L, w: 2.8, h: 0.12, d: 1.7, color: red });
    neon.box({ x: ox0 + W + 1.7, y: base + 0.07, z: oz0 + t * L, w: 2.8, h: 0.12, d: 1.7, color: red });
  }

  // support wall behind the signage (north edge of the plaza)
  const wallZ = oz0 - 4.5;
  trim.box({ x: cx, y: base, z: wallZ, w: 34, h: 25, d: 3, color: 0x262a32, roofColor: 0x333844 });
  const faceZ = wallZ - 1.85;
  sign.box({ x: cx, y: base + 9, z: faceZ, w: 28, h: 7, d: 0.6, color: 0xffffff, uScale: 1, vScale: 1 });
  logo.box({ x: cx, y: base + 17.5, z: faceZ, w: 24, h: 5.5, d: 0.6, color: 0xffffff, uScale: 1, vScale: 1 });
  neon.box({ x: cx, y: base + 23.2, z: faceZ, w: 30, h: 0.4, d: 0.7, color: red });

  // floodlight masts + beacons
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const fx = cx + sx * (W / 2 + 4);
      const fz = cz + sz * (L / 2 + 4);
      trim.cylinder({ x: fx, y: base, z: fz, rBottom: 0.3, rTop: 0.2, height: 13, segments: 7, color: 0x6d7684 });
      neon.box({ x: fx, y: base + 13, z: fz, w: 2.4, h: 1.0, d: 1.0, color: [2.4, 2.4, 2.6] });
      neon.box({ x: fx, y: base + 14.2, z: fz, w: 0.7, h: 0.7, d: 0.7, color: red });
    }
  }

  // cabling running down the shaft wall
  for (let i = 0; i < 5; i++) {
    trim.cylinder({
      x: ox0 + 3 + i * 2.2,
      y: base - depth,
      z: oz0 + 1.9,
      rBottom: 0.16,
      rTop: 0.16,
      height: depth,
      segments: 5,
      color: 0x3d434c,
    });
  }

  // perimeter barriers — a continuous ring around the shaft on all four sides
  addBarrierRing(ctx.placer, ox0, oz0, W, L, base, 3);

  // posters on the support wall (missing-person wall)
  const poster = ctx.bucket('platePoster');
  for (let i = 0; i < 6; i++) {
    const u = (i % 2) * 0.5;
    const v = Math.floor(i / 2) * 0.5;
    poster.box({
      x: cx - 14 + (i % 3) * 14,
      y: base + 1.4 + Math.floor(i / 3) * 3.4,
      z: faceZ,
      w: 4.4,
      h: 3.2,
      d: 0.14,
      color: 0xffffff,
      uScale: 0.5,
      vScale: 0.5,
      uOff: u,
      vOff: v,
    });
  }

  // keep the district quiet: one small utility shed
  trim.box({ x: cell.x1 - 12, y: base, z: cell.z1 - 10, w: 9, h: 5, d: 7, color: 0x3a4048, roofColor: 0x2b3038 });
  void rng;
  void D;

  return { name: 'Underarchive — Sector 0 (sealed)' };
}
