/**
 * Collision world for the playable character.
 *
 * Phase 1 generated geometry but nothing needed to be *solid*. Rather than
 * pulling in a physics engine, the world builder now drops a flat list of
 * axis-aligned boxes and circles into this structure while it generates the
 * matching geometry — every collider is a wall, kerb or prop you can already
 * see on screen (buildings, canal walls, hedges, lamp posts, barriers …).
 *
 * Queries run through a uniform spatial hash, so the per-frame cost is a
 * handful of bucket lookups no matter how large the city is.
 *
 * Vertical rules (the whole trick of the system):
 *   - a solid only blocks movement when it reaches above `feet + STEP`
 *     (kerbs and low decks are stepped onto, not collided with) and starts
 *     below `feet + HEIGHT` (walkway decks pass safely overhead);
 *   - ground under a point is the highest surface no further than one step
 *     above the feet, so stepping up/down is instant and stable.
 */

export const PLAYER_RADIUS = 0.34;
export const PLAYER_HEIGHT = 1.8;
export const STEP_HEIGHT = 0.36;

const HASH_CELL = 24; // metres per spatial-hash bucket
const INSERT_MARGIN = 0.7; // bucket padding so one query reads one bucket ring

export class Colliders {
  constructor(layout) {
    this.layout = layout;
    this.items = [];
    this.buckets = new Map();
    this.built = false;
    this._lastBucket = -1;
    this._lastList = null;
  }

  /* ------------------------------ authoring ----------------------------- */

  addBox(x0, z0, x1, z1, y0, y1, tag = 'solid') {
    if (!(x1 > x0) || !(z1 > z0) || !(y1 > y0)) return null;
    const item = { box: true, x0, z0, x1, z1, y0, y1, tag };
    this.items.push(item);
    return item;
  }

  addCircle(x, z, r, y0, y1, tag = 'prop') {
    if (!(r > 0) || !(y1 > y0)) return null;
    const item = { box: false, x, z, r, y0, y1, tag };
    this.items.push(item);
    return item;
  }

  /**
   * Enable/disable one collider at runtime (used by the hidden door unlock).
   * Rebuilds the hash only if it was already built — authoring-time toggles
   * are free.
   */
  disable(item) {
    if (!item || item.disabled) return false;
    item.disabled = true;
    if (this.built) this.build();
    return true;
  }

  enable(item) {
    if (!item || !item.disabled) return false;
    item.disabled = false;
    if (this.built) this.build();
    return true;
  }

  /**
   * Authoring-time probe: walk from (x, z) along `dirZ` and find the first
   * point where solids reach above head height — i.e. a wall face. Several x
   * offsets must agree within `tol` so a lamppost or tree is never mistaken
   * for a building. Works off the raw item list, so it can run before build().
   */
  findFlatFace(x, z, dirZ, feet, { probes = [-1.5, 0, 1.5], tol = 0.7, maxDist = 12 } = {}) {
    const step = 0.25;
    const found = [];
    for (const px of probes) {
      let face = null;
      for (let d = 0; d <= maxDist; d += step) {
        const zz = z + dirZ * d;
        let tall = false;
        for (let i = 0; i < this.items.length; i++) {
          const it = this.items[i];
          if (it.disabled || it.y1 <= feet + 2.0) continue; // must top out above head height
          if (it.y0 >= feet + 3.0) continue; // floating clear of the walkway
          if (!this._coversPoint(it, x + px, zz)) continue;
          tall = true;
          break;
        }
        if (tall) {
          face = zz;
          break;
        }
      }
      if (face == null) return null;
      found.push(face);
    }
    const lo = Math.min(...found);
    const hi = Math.max(...found);
    if (hi - lo > tol) return null; // not a flat wall (tree, sign, …)
    return { z: (lo + hi) / 2, spread: hi - lo };
  }

  /** True when no collider overlaps the AABB (boundary walls ignored). */
  occupancyFree(x0, z0, x1, z1, y0, y1) {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.disabled || it.tag === 'boundary') continue;
      if (it.y1 <= y0 || it.y0 >= y1) continue;
      if (it.box) {
        if (it.x1 <= x0 || it.x0 >= x1 || it.z1 <= z0 || it.z0 >= z1) continue;
        return false;
      }
      // circle vs AABB: distance from the circle centre to the nearest point
      const qx = Math.max(x0, Math.min(it.x, x1));
      const qz = Math.max(z0, Math.min(it.z, z1));
      const dx = qx - it.x;
      const dz = qz - it.z;
      if (dx * dx + dz * dz >= it.r * it.r) continue;
      return false;
    }
    return true;
  }

  /** Build the spatial hash once generation is finished. */
  build() {
    this.buckets.clear();
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const { gx0, gz0, gx1, gz1 } = this._span(it);
      for (let gz = gz0; gz <= gz1; gz++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const key = gx * 100003 + gz;
          let list = this.buckets.get(key);
          if (!list) {
            list = [];
            this.buckets.set(key, list);
          }
          list.push(it);
        }
      }
    }
    this.built = true;
    this._lastBucket = -1;
    this._lastList = null;
    return this;
  }

  _span(it) {
    const min = (v) => Math.floor(v / HASH_CELL);
    const max = (v) => Math.floor(v / HASH_CELL);
    if (it.box) {
      return {
        gx0: min(it.x0 - INSERT_MARGIN),
        gx1: max(it.x1 + INSERT_MARGIN),
        gz0: min(it.z0 - INSERT_MARGIN),
        gz1: max(it.z1 + INSERT_MARGIN),
      };
    }
    return {
      gx0: min(it.x - it.r - INSERT_MARGIN),
      gx1: max(it.x + it.r + INSERT_MARGIN),
      gz0: min(it.z - it.r - INSERT_MARGIN),
      gz1: max(it.z + it.r + INSERT_MARGIN),
    };
  }

  /* ------------------------------- queries ------------------------------ */

  /** Iterate solids whose footprint may touch the circle (x, z, r). */
  _near(x, z, r, visit) {
    const gx0 = Math.floor((x - r - INSERT_MARGIN) / HASH_CELL);
    const gx1 = Math.floor((x + r + INSERT_MARGIN) / HASH_CELL);
    const gz0 = Math.floor((z - r - INSERT_MARGIN) / HASH_CELL);
    const gz1 = Math.floor((z + r + INSERT_MARGIN) / HASH_CELL);
    const seen = this._seen ?? (this._seen = new Set());
    seen.clear();
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const list = this.buckets.get(gx * 100003 + gz);
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const it = list[i];
          if (it.disabled) continue;
          if (seen.has(it)) continue;
          seen.add(it);
          if (visit(it) === false) return;
        }
      }
    }
  }

  _coversPoint(it, x, z) {
    if (it.box) return x >= it.x0 && x <= it.x1 && z >= it.z0 && z <= it.z1;
    const dx = x - it.x;
    const dz = z - it.z;
    return dx * dx + dz * dz <= it.r * it.r;
  }

  _coversCircle(it, x, z, r) {
    if (it.box) {
      const cx = Math.max(it.x0, Math.min(x, it.x1));
      const cz = Math.max(it.z0, Math.min(z, it.z1));
      const dx = x - cx;
      const dz = z - cz;
      return dx * dx + dz * dz < r * r;
    }
    const dx = x - it.x;
    const dz = z - it.z;
    const rr = it.r + r;
    return dx * dx + dz * dz < rr * rr;
  }

  /** Does a solid at (x, z) block a body standing with feet at `feet`? */
  _blocks(it, feet) {
    if (it.y0 >= feet + PLAYER_HEIGHT) return false; // passes overhead
    if (it.y1 <= feet) return false; // entirely below the feet
    if (it.y1 <= feet + STEP_HEIGHT) return false; // low enough to step onto
    return true;
  }

  /**
   * True when the circle (x, z, r) would intersect a blocking solid at the
   * given feet height. This is the single movement test.
   */
  hits(x, z, feet, r = PLAYER_RADIUS) {
    let hit = false;
    this._near(x, z, r, (it) => {
      if (!this._blocks(it, feet)) return;
      if (this._coversCircle(it, x, z, r)) {
        hit = true;
        return false;
      }
    });
    return hit;
  }

  /** Point test used by the third-person camera. */
  isPointBlocked(x, y, z) {
    let hit = false;
    this._near(x, z, 0.01, (it) => {
      if (y < it.y0 || y > it.y1) return;
      if (this._coversPoint(it, x, z)) {
        hit = true;
        return false;
      }
    });
    return hit;
  }

  /**
   * Move along one axis with collision: full step when clear, otherwise the
   * deepest non-penetrating position found by bisection (so the character
   * stops flush against the wall instead of leaving a gap).
   */
  moveAxis(x, z, dx, dz, feet, r = PLAYER_RADIUS) {
    const nx = x + dx;
    const nz = z + dz;
    if (!this.hits(nx, nz, feet, r)) return [nx, nz];

    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 6; i++) {
      const mid = (lo + hi) * 0.5;
      if (this.hits(x + dx * mid, z + dz * mid, feet, r)) hi = mid;
      else lo = mid;
    }
    return [x + dx * lo, z + dz * lo];
  }

  /* -------------------------------- ground ------------------------------ */

  /** Terrain height without any collider on top (kerb / road / canal bed). */
  baseGround(x, z) {
    const l = this.layout;
    const c = l.cellAt(x, z);
    if (c) {
      if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) {
        // block slab; flooded blocks carry ankle-deep standing water
        return c.flooded ? l.curb + 0.17 : l.curb;
      }
      const canal = l.canal;
      if (x >= canal.x0 && x <= canal.x1 && Math.abs(z - canal.z) < l.halfRoad) {
        return -canal.depth + 0.6; // canal bed top (bridges are colliders)
      }
      return 0.03; // road surface + lane markings
    }
    return -0.06; // the base plane outside the grid
  }

  /**
   * Walkable height under a point. `feet` is the current height so low
   * surfaces inside step range count while tall walls do not become floors.
   */
  groundAt(x, z, feet) {
    let best = this.baseGround(x, z);
    const reach = feet + STEP_HEIGHT;
    this._near(x, z, 0.01, (it) => {
      if (it.y1 > reach) return;
      if (it.y0 > reach) return; // floating surface out of reach
      if (!this._coversPoint(it, x, z)) return;
      if (it.y1 > best) best = it.y1;
    });
    return best;
  }

  stats() {
    let boxes = 0;
    let circles = 0;
    for (const it of this.items) (it.box ? boxes++ : circles++);
    return { boxes, circles, buckets: this.buckets.size, total: this.items.length };
  }
}

/**
 * Prop collision table — mirrors the instanced street furniture in
 * `world/props.js`. `null` means the prop is low/unimportant enough to walk
 * straight through (benches, bollard-scale clutter, glow-only duplicates).
 */
export const PROP_COLLIDERS = {
  lamp: { shape: 'circle', r: 0.4, h: 7.6 },
  bench: null,
  bollard: { shape: 'circle', r: 0.3, h: 0.95 },
  bin: { shape: 'circle', r: 0.45, h: 1.1 },
  trafficSignal: { shape: 'circle', r: 0.4, h: 5.6 },
  barrier: { shape: 'box', w: 2.3, d: 0.55, h: 1.2 },
  crate: { shape: 'box', w: 1.3, d: 1.3, h: 1.15 },
  planter: { shape: 'box', w: 1.6, d: 1.6, h: 0.84 },
  tree: { shape: 'circle', r: 0.62, h: 4.0 },
  stallBase: { shape: 'box', w: 2.9, d: 1.9, h: 2.4 },
  valve: { shape: 'circle', r: 0.6, h: 1.9 },
  signPost: { shape: 'circle', r: 0.5, h: 3.1 },
  antenna: { shape: 'circle', r: 0.5, h: 9 },
  pipeRun: { shape: 'box', w: 12.4, d: 1.5, h: 1.7, y0: -1.6 },
  // glow-only duplicates share their host's transform
  lampGlow: null,
  signalGlow: null,
  stallCanopy: null,
  treeTop: null,
};

/**
 * Emit the collider for one placed prop. Boxes are rotated to their
 * axis-aligned bounds so the arbitrary placement angles still block correctly.
 */
export function addPropCollider(colliders, type, x, y, z, ry, scale) {
  const def = PROP_COLLIDERS[type];
  if (!def || !colliders) return;
  const sx = Array.isArray(scale) ? scale[0] : scale;
  const sy = Array.isArray(scale) ? scale[1] : scale;
  const sz = Array.isArray(scale) ? scale[2] : scale;
  const y0 = y + (def.y0 ?? 0) * sy;
  const y1 = y0 + (def.h ?? 0) * sy;

  if (def.shape === 'circle') {
    const r = def.r * Math.max(sx, sz);
    colliders.addCircle(x, z, r, y0, y1, type);
    return;
  }
  const c = Math.abs(Math.cos(ry));
  const s = Math.abs(Math.sin(ry));
  const w = def.w * sx;
  const d = def.d * sz;
  const hw = (w * c + d * s) / 2;
  const hd = (w * s + d * c) / 2;
  colliders.addBox(x - hw, z - hd, x + hw, z + hd, y0, y1, type);
}
