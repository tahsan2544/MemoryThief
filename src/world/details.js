import { createRng } from '../core/rng.js';
import { rgb } from '../utils/geo.js';

/**
 * City-wide details that don't belong to a single block:
 *   - the Floodworks canal (water, retaining walls, bridges)
 *   - Glassline elevated walkways
 *   - overhead cabling
 *   - canal-side pipe runs and Glassline security checkpoints
 *
 * These merge into their own bucket set. They are few enough triangles that
 * one always-resident mesh per material is cheaper than per-chunk bookkeeping.
 */

export function buildDetails(layout, ctx) {
  const buckets = ctx.detailBucket;
  const rng = createRng(layout.seed ^ 0xd37a11);
  const lines = [];

  canal(layout, buckets, ctx, rng);
  walkways(layout, buckets, ctx, rng);
  pipesAndCheckpoints(layout, buckets, ctx, rng);
  cabling(layout, ctx, lines, rng);

  return { lines };
}

/* ------------------------------------------------------------------ *
 * Canal
 * ------------------------------------------------------------------ */

function canal(layout, buckets, ctx, rng) {
  const c = layout.canal;
  const trim = buckets('trim');
  const water = buckets('water');
  const roadB = buckets('road');
  const neon = buckets('neon');
  const base = layout.curb;

  const x0 = c.x0;
  const x1 = c.x1;
  const width = c.width;
  const top = base;
  const floorY = -c.depth;
  const half = width / 2;

  // canal bed
  roadB.box({
    x: (x0 + x1) / 2,
    y: floorY,
    z: c.z,
    w: x1 - x0,
    h: 0.6,
    d: width,
    color: 0x12181c,
    roofColor: 0x161d22,
    roofUvScale: 0.1,
  });

  // retaining walls — raised 0.95 m into a parapet (a visible safety lip you
  // cannot step over) and split into spans between the bridges so every
  // bridge stays reachable from both banks
  const wallT = 1.4;
  const parapet = 0.95;
  const wallTop = top + parapet;
  const wallH = wallTop - floorY;
  const colliders = ctx.colliders;

  const cuts = c.bridges.map((bx) => [bx - layout.road / 2, bx + layout.road / 2]).sort((a, b) => a[0] - b[0]);
  const spans = [];
  let cursor = x0;
  for (const [a, b] of cuts) {
    if (a > cursor) spans.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < x1) spans.push([cursor, x1]);

  for (const [sa, sb] of spans) {
    for (const zSide of [-1, 1]) {
      const zc = c.z + zSide * (half - wallT / 2);
      trim.box({
        x: (sa + sb) / 2,
        y: floorY,
        z: zc,
        w: sb - sa,
        h: wallH,
        d: wallT,
        color: 0x333b42,
        roofColor: 0x3f4850,
      });
      const za = zSide < 0 ? c.z - half : c.z + half - wallT;
      colliders?.addBox(sa, za, sb, za + wallT, floorY, wallTop, 'canal-wall');
    }
  }

  // sealed ends of the canal (west bulkhead + east end wall)
  for (const [ex, dir] of [[x0 + wallT / 2, 1], [x1 - wallT / 2, -1]]) {
    trim.box({ x: ex, y: floorY, z: c.z, w: wallT, h: wallH, d: width, color: dir > 0 ? 0x2b3238 : 0x2b3238, roofColor: 0x3f4850 });
    colliders?.addBox(dir > 0 ? x0 : x1 - wallT, c.z - half, dir > 0 ? x0 + wallT : x1, c.z + half, floorY, wallTop, 'canal-end');
  }

  // water surface
  water.box({
    x: (x0 + x1) / 2,
    y: floorY + 1.1,
    z: c.z,
    w: x1 - x0 - wallT,
    h: 0.14,
    d: width - wallT * 2,
    color: 0xffffff,
  });

  // glowing waterline strip on the far bank
  neon.box({
    x: (x0 + x1) / 2,
    y: floorY + 1.35,
    z: c.z + half - wallT - 0.1,
    w: x1 - x0 - 4,
    h: 0.16,
    d: 0.16,
    color: rgb(0x54e0c6).map((v) => v * 1.9),
  });

  // ---- bridges over the canal ----
  for (const bx of c.bridges) {
    const bw = layout.road;
    const bd = width + 5;
    roadB.box({
      x: bx,
      y: 0,
      z: c.z,
      w: bw,
      h: top + 0.05,
      d: bd,
      color: 0x151a20,
      roofColor: 0x1d232b,
      roofUvScale: 0.14,
    });
    // the deck is the only way across: solid at road height
    colliders?.addBox(bx - bw / 2, c.z - bd / 2, bx + bw / 2, c.z + bd / 2, 0, top + 0.05, 'bridge');
    for (const s of [-1, 1]) {
      // railing
      const rx = bx + (s * (bw - 1.2)) / 2;
      trim.box({ x: rx, y: top + 0.05, z: c.z, w: 1.0, h: 1.2, d: bd, color: 0x59626d, roofColor: 0x6d7784 });
      colliders?.addBox(rx - 0.5, c.z - bd / 2, rx + 0.5, c.z + bd / 2, top + 0.05, top + 1.25, 'bridge-rail');
      // piers in the water
      for (const pz of [-1, 1]) {
        trim.cylinder({
          x: bx + (s * (bw - 3)) / 2,
          y: floorY,
          z: c.z + pz * (half - 3),
          rBottom: 0.9,
          rTop: 0.75,
          height: top - floorY,
          segments: 10,
          color: 0x3c444c,
        });
      }
    }
    // under-deck beam
    trim.box({ x: bx, y: top - 1.1, z: c.z, w: bw - 1, h: 1.1, d: bd - 1, color: 0x2c333a, roofColor: 0x333b44 });
    neon.box({ x: bx, y: top + 1.35, z: c.z - width / 2 - 2.2, w: bw - 2, h: 0.2, d: 0.2, color: [1.4, 1.6, 2.0] });
    void rng;
  }

  // ---- pipe run along the north bank ----
  const runs = Math.max(2, Math.floor((x1 - x0) / 90));
  for (let i = 0; i < runs; i++) {
    const len = (x1 - x0) / runs - 6;
    const sx = x0 + 3 + i * ((x1 - x0) / runs) + len / 2;
    trim.cylinder({
      x: sx,
      y: top + 2.6,
      z: c.z - half - 1.6,
      rBottom: 0.6,
      rTop: 0.6,
      height: len,
      segments: 10,
      color: 0x6a5647,
      rotate: [0, 0, Math.PI / 2],
    });
    trim.cylinder({
      x: sx,
      y: top + 4.4,
      z: c.z - half - 1.6,
      rBottom: 0.36,
      rTop: 0.36,
      height: len,
      segments: 8,
      color: 0x4f5b63,
      rotate: [0, 0, Math.PI / 2],
    });
    const supports = Math.max(2, Math.round(len / 18));
    for (let k = 0; k <= supports; k++) {
      const px = sx - len / 2 + (k * len) / supports;
      trim.box({ x: px, y: top, z: c.z - half - 1.6, w: 0.7, h: 3.6, d: 0.7, color: 0x39424a });
      trim.box({ x: px, y: top + 3.4, z: c.z - half - 1.6, w: 1.9, h: 0.4, d: 2.6, color: 0x39424a });
    }
  }
}

/* ------------------------------------------------------------------ *
 * Elevated walkways (Glassline)
 * ------------------------------------------------------------------ */

function walkways(layout, buckets, ctx, rng) {
  const { grid, cells, halfRoad } = layout;
  const trim = buckets('trim');
  const roofB = buckets('roof');
  const neon = buckets('neon');
  const base = layout.curb;
  let made = 0;
  const budget = Math.round(26 * Math.min(1.4, ctx.density));

  for (let iz = 0; iz < grid && made < budget; iz++) {
    for (let ix = 0; ix < grid && made < budget; ix++) {
      const a = cells[iz * grid + ix];
      if (a.district !== 'glassline' || a.landmark) continue;

      for (const dir of [0, 1]) {
        if (made >= budget) break;
        const nx = ix + (dir === 0 ? 1 : 0);
        const nz = iz + (dir === 1 ? 1 : 0);
        if (nx >= grid || nz >= grid) continue;
        const b = cells[nz * grid + nx];
        if (b.district !== 'glassline' || b.landmark) continue;
        if (!rng.chance(0.5)) continue;

        const y = base + rng.range(13, 21);
        const deckW = 4.4;
        if (dir === 0) {
          // east-west span across the vertical road
          const x0 = a.x1 - 3;
          const x1 = b.x0 + 3;
          const cx = (x0 + x1) / 2;
          const zc = a.z0 + (a.z1 - a.z0) * rng.range(0.3, 0.7);
          deck(trim, roofB, neon, cx, zc, x1 - x0, deckW, y, 'x');
          column(trim, x0 + 3.2, zc, y, deckW, 'x', ctx.colliders);
          column(trim, x1 - 3.2, zc, y, deckW, 'x', ctx.colliders);
        } else {
          const z0 = a.z1 - 3;
          const z1 = b.z0 + 3;
          const cz = (z0 + z1) / 2;
          const xc = a.x0 + (a.x1 - a.x0) * rng.range(0.3, 0.7);
          deck(trim, roofB, neon, xc, cz, z1 - z0, deckW, y, 'z');
          column(trim, xc, z0 + 3.2, y, deckW, 'z', ctx.colliders);
          column(trim, xc, z1 - 3.2, y, deckW, 'z', ctx.colliders);
        }
        made++;
      }
    }
  }
  void halfRoad;
}

function deck(trim, roofB, neon, cx, cz, span, width, y, axis) {
  const horizontal = axis === 'x';
  trim.box({
    x: cx,
    y,
    z: cz,
    w: horizontal ? span : width,
    h: 0.55,
    d: horizontal ? width : span,
    color: 0x2f363e,
    roofColor: 0x3a424b,
    roofUvScale: 0.2,
  });
  roofB.box({
    x: cx,
    y: y + 0.55,
    z: cz,
    w: horizontal ? span : width - 0.6,
    h: 0.1,
    d: horizontal ? width - 0.6 : span,
    color: 0x495159,
    roofColor: 0x495159,
    roofUvScale: 0.3,
  });
  for (const s of [-1, 1]) {
    trim.box({
      x: cx + (horizontal ? 0 : (s * (width - 0.5)) / 2),
      y: y + 0.55,
      z: cz + (horizontal ? (s * (width - 0.5)) / 2 : 0),
      w: horizontal ? span : 0.3,
      h: 1.1,
      d: horizontal ? 0.3 : span,
      color: 0x5a6470,
    });
    neon.box({
      x: cx + (horizontal ? 0 : (s * (width - 0.5)) / 2),
      y: y + 1.7,
      z: cz + (horizontal ? (s * (width - 0.5)) / 2 : 0),
      w: horizontal ? span : 0.14,
      h: 0.14,
      d: horizontal ? 0.14 : span,
      color: [1.2, 1.7, 2.3],
    });
  }
}

function column(trim, x, z, y, width, axis, colliders) {
  for (const s of [-1, 1]) {
    const px = x + (axis === 'x' ? 0 : (s * (width - 1.4)) / 2);
    const pz = z + (axis === 'x' ? (s * (width - 1.4)) / 2 : 0);
    trim.box({
      x: px,
      y: 0,
      z: pz,
      w: axis === 'x' ? 0.9 : 0.9,
      h: y,
      d: 0.9,
      color: 0x333a42,
    });
    colliders?.addBox(px - 0.55, pz - 0.55, px + 0.55, pz + 0.55, 0, y, 'walkway-column');
  }
}

/* ------------------------------------------------------------------ *
 * Security checkpoints (Glassline) + flood vents (Floodworks)
 * ------------------------------------------------------------------ */

function pipesAndCheckpoints(layout, buckets, ctx, rng) {
  const { grid, cells, origin, cell, halfRoad } = layout;
  const trim = buckets('trim');
  const neon = buckets('neon');
  const base = layout.curb;

  for (let iz = 1; iz < grid; iz++) {
    for (let ix = 1; ix < grid; ix++) {
      const cd = cells[iz * grid + ix];

      if (cd.district === 'glassline' && (ix + iz) % 5 === 0) {
        const lineX = origin + ix * cell;
        const lineZ = origin + iz * cell;
        const w = halfRoad * 2 - 2;
        for (const s of [-1, 1]) {
          const gx = lineX + (s * w) / 2;
          trim.box({ x: gx, y: 0, z: lineZ, w: 1.4, h: 6.4, d: 2.2, color: 0x545e6a, roofColor: 0x69747f });
          neon.box({ x: gx, y: 6.4, z: lineZ, w: 1.6, h: 0.3, d: 2.4, color: rgb(0x74c8ff).map((v) => v * 2.0) });
          ctx.colliders?.addBox(gx - 0.7, lineZ - 1.1, gx + 0.7, lineZ + 1.1, 0, 6.4, 'checkpoint');
        }
        trim.box({ x: lineX, y: 6.6, z: lineZ, w: w + 1.4, h: 1.5, d: 1.6, color: 0x454e59, roofColor: 0x5b6672 });
        neon.box({ x: lineX, y: 7.4, z: lineZ, w: w - 2, h: 0.5, d: 1.75, color: rgb(0x74c8ff).map((v) => v * 2.0) });
        trim.box({ x: lineX, y: 0, z: lineZ - halfRoad + 1.4, w: w - 1, h: 0.9, d: 0.5, color: 0x6a737e });
        neon.box({ x: lineX, y: 0.9, z: lineZ - halfRoad + 1.4, w: w - 3, h: 0.16, d: 0.55, color: rgb(0xff3b47).map((v) => v * 2.0) });
        ctx.colliders?.addBox(
          lineX - (w - 1) / 2,
          lineZ - halfRoad + 1.15,
          lineX + (w - 1) / 2,
          lineZ - halfRoad + 1.65,
          0,
          0.9,
          'checkpoint-barrier',
        );
      }

      if (cd.district === 'floodworks' && !cd.landmark && rng.chance(0.45)) {
        const cx = cd.cx;
        const cz = cd.cz;
        const n = rng.int(1, 3);
        for (let i = 0; i < n; i++) {
          const h = rng.range(4, 9);
          const px = cx + rng.range(-18, 18);
          const pz = cz + rng.range(-18, 18);
          trim.cylinder({ x: px, y: base, z: pz, rBottom: 0.9, rTop: 0.7, height: h, segments: 10, color: 0x535d66, caps: true });
          trim.cylinder({ x: px, y: base + h, z: pz, rBottom: 1.3, rTop: 1.1, height: 1.2, segments: 10, color: 0x6b757f, caps: true });
          ctx.colliders?.addCircle(px, pz, 1.35, base, base + h + 1.2, 'vent');
          if (rng.chance(0.4)) {
            neon.box({ x: px, y: base + h + 1.4, z: pz, w: 0.5, h: 0.5, d: 0.5, color: [1.4, 2.0, 1.7] });
          }
        }
      }
    }
  }
  void ctx;
}

/* ------------------------------------------------------------------ *
 * Overhead cabling
 * ------------------------------------------------------------------ */

function cabling(layout, ctx, lines, rng) {
  const { grid, cells } = layout;
  const walk = 4.2;
  const perDistrict = { oldquarter: 0.6, floodworks: 0.35, verdant: 0.2, glassline: 0.12, underarchive: 0 };

  for (let iz = 0; iz < grid; iz++) {
    for (let ix = 0; ix < grid; ix++) {
      const a = cells[iz * grid + ix];
      const p = perDistrict[a.district] ?? 0;
      if (p <= 0) continue;

      // crossing the road to the north neighbour
      if (iz > 0 && rng.chance(p)) {
        const b = cells[(iz - 1) * grid + ix];
        const x = a.x0 + rng.range(walk + 2, a.x1 - walk - 2);
        const y0 = 8 + rng.range(0, 3);
        const z0 = a.z0 + walk;
        const z1 = b.z1 - walk;
        sagLine(lines, [x, y0, z0], [x, y0 - rng.range(0, 1.2), z1], rng.range(1.6, 3.2));
        if (rng.chance(0.5)) {
          const x2 = a.x0 + rng.range(walk + 2, a.x1 - walk - 2);
          sagLine(lines, [x2, y0 + 1.4, z0], [x2, y0 + 0.6, z1], rng.range(1.4, 2.8));
        }
      }
      // crossing the road to the west neighbour
      if (ix > 0 && rng.chance(p)) {
        const b = cells[iz * grid + ix - 1];
        const z = a.z0 + rng.range(walk + 2, a.z1 - walk - 2);
        const y0 = 8 + rng.range(0, 3);
        const x0 = a.x0 + walk;
        const x1 = b.x1 - walk;
        sagLine(lines, [x0, y0, z], [x1, y0 - rng.range(0, 1.2), z], rng.range(1.6, 3.2));
      }
    }
  }
  void ctx;
}

/** Append a catenary-ish polyline as line segments. */
function sagLine(lines, from, to, sag) {
  const segs = 9;
  let prev = from;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const x = from[0] + (to[0] - from[0]) * t;
    const y = from[1] + (to[1] - from[1]) * t - Math.sin(t * Math.PI) * sag;
    const z = from[2] + (to[2] - from[2]) * t;
    const p = [x, y, z];
    lines.push(prev[0], prev[1], prev[2], p[0], p[1], p[2]);
    prev = p;
  }
}
