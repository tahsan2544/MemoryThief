import * as THREE from 'three';

/**
 * Geometry construction helpers.
 *
 * The whole city is assembled by pushing triangles into a handful of
 * `MeshBuilder` buckets (one bucket per material per chunk). That keeps the
 * draw-call count low while still allowing per-chunk frustum culling, because
 * every builder carries a vertex `color` attribute for per-district tinting.
 */

const _tmpColor = new THREE.Color();
const WHITE = [1, 1, 1];

/** sRGB hex -> linear rgb triple (three.js colour management converts). */
export function rgb(hex) {
  _tmpColor.set(hex);
  return [_tmpColor.r, _tmpColor.g, _tmpColor.b];
}

/** Scale an rgb triple. Values above 1 push past tone mapping for glow. */
export function scaleRGB(c, k) {
  return [c[0] * k, c[1] * k, c[2] * k];
}

/**
 * Accept either an sRGB hex or a ready-made linear rgb triple.
 * Triples let callers push values above 1.0 for neon/emissive vertex colours.
 */
export function toRGB(v) {
  if (v === undefined || v === null) return WHITE;
  if (Array.isArray(v)) return v;
  return rgb(v);
}

/** Darken (k<1) or lighten (k>1) an sRGB hex, returning a hex. */
export function shadeHex(hex, k) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * k));
  const b = Math.min(255, Math.round((hex & 255) * k));
  return (r << 16) | (g << 8) | b;
}

function dist3(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

const METER_UV = { uScale: 0.25, vScale: 0.25, uOff: 0, vOff: 0 };

export class MeshBuilder {
  constructor() {
    this.p = [];
    this.n = [];
    this.u = [];
    this.c = [];
    this.i = [];
    this.count = 0;
    this.triangles = 0;
  }

  get isEmpty() {
    return this.count === 0;
  }

  _vertex(px, py, pz, nx, ny, nz, u, v, col) {
    this.p.push(px, py, pz);
    this.n.push(nx, ny, nz);
    this.u.push(u, v);
    this.c.push(col[0], col[1], col[2]);
    return this.count++;
  }

  /**
   * Push a planar quad given in counter-clockwise order.
   * UVs are derived from edge lengths so callers only pass a scale/offset.
   */
  quad(p0, p1, p2, p3, col, opts = METER_UV) {
    const normal = normalize(cross(sub(p1, p0), sub(p2, p0)));
    const uSpan = dist3(p0, p1) * (opts.uScale ?? 0.25);
    const vSpan = dist3(p1, p2) * (opts.vScale ?? opts.uScale ?? 0.25);
    const u0 = opts.uOff ?? 0;
    const v0 = opts.vOff ?? 0;
    const u1 = u0 + uSpan;
    const v1 = v0 + vSpan;

    const a = this._vertex(p0[0], p0[1], p0[2], normal[0], normal[1], normal[2], u0, v0, col);
    const b = this._vertex(p1[0], p1[1], p1[2], normal[0], normal[1], normal[2], u1, v0, col);
    const c = this._vertex(p2[0], p2[1], p2[2], normal[0], normal[1], normal[2], u1, v1, col);
    const d = this._vertex(p3[0], p3[1], p3[2], normal[0], normal[1], normal[2], u0, v1, col);

    this.i.push(a, b, c, a, c, d);
    this.triangles += 2;
    return this;
  }

  /** Flat horizontal quad, y up. x0/z0 -> x1/z1 (order irrelevant). */
  ground(x0, z0, x1, z1, y, col, opts = METER_UV) {
    const ax = Math.min(x0, x1);
    const bx = Math.max(x0, x1);
    const az = Math.min(z0, z1);
    const bz = Math.max(z0, z1);
    return this.quad([ax, y, bz], [bx, y, bz], [bx, y, az], [ax, y, az], col, opts);
  }

  /**
   * Axis-aligned box.
   * `y` is the BOTTOM of the box (easier for stacking tiers).
   *
   * opts:
   *   color/roofColor/bottomColor — sRGB hex
   *   uScale/vScale/uOff/vOff — UV control; for facade boxes use
   *     windowUV(district, offset) to line windows up with floors.
   *   faces — optional array restricting which faces are emitted
   *   roofUvScale — UV scale used on the top face (default 0.15)
   *   shell — optional wall thickness; also emits an INWARD-facing inner box
   *     inset by that amount. From outside the inner faces are backface-culled
   *     (zero extra fill cost), but when the camera ends up inside the volume
   *     they read as real walls/floor/ceiling instead of seeing straight
   *     through the building to the sky.
   */
  box(o) {
    const { x, y, z, w, h, d } = o;
    const startCount = this.count;
    const sideCol = toRGB(o.color);
    const roofCol = o.roofColor !== undefined ? toRGB(o.roofColor) : sideCol;
    const botCol = o.bottomColor !== undefined ? toRGB(o.bottomColor) : roofCol;

    const x0 = x - w / 2;
    const x1 = x + w / 2;
    const y0 = y;
    const y1 = y + h;
    const z0 = z - d / 2;
    const z1 = z + d / 2;

    const only = o.faces;
    const wants = (f) => !only || only.includes(f);

    const wallUV = {
      uScale: o.uScale ?? 0.25,
      vScale: o.vScale ?? o.uScale ?? 0.25,
      uOff: o.uOff ?? 0,
      vOff: o.vOff ?? 0,
    };
    const roofUV = { uScale: o.roofUvScale ?? 0.15, vScale: o.roofUvScale ?? 0.15, uOff: 0, vOff: 0 };

    // `flip` reverses the winding, which (quad() derives normals from the
    // vertex order) turns an outward face into an inward one.
    const emit = (p0, p1, p2, p3, col, uvp, flip) => {
      if (flip) this.quad(p3, p2, p1, p0, col, uvp);
      else this.quad(p0, p1, p2, p3, col, uvp);
    };

    if (wants('+z')) emit([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], sideCol, wallUV, false);
    if (wants('-z')) emit([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], sideCol, wallUV, false);
    if (wants('+x')) emit([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], sideCol, wallUV, false);
    if (wants('-x')) emit([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], sideCol, wallUV, false);
    if (wants('+y')) emit([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], roofCol, roofUV, false);
    if (wants('-y')) emit([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], botCol, roofUV, false);

    // ---- interior shell (see-through fix) ------------------------------
    const s = o.shell;
    if (s > 0) {
      const kx0 = x0 + s;
      const kx1 = x1 - s;
      const ky0 = y0 + s;
      const ky1 = y1 - s;
      const kz0 = z0 + s;
      const kz1 = z1 - s;
      if (kx1 > kx0 && ky1 > ky0 && kz1 > kz0) {
        // interiors sit in their own shade so a camera that clips inside a
        // building sees a dark room rather than a lit-through facade
        const innerCol = [sideCol[0] * 0.42, sideCol[1] * 0.42, sideCol[2] * 0.48];
        const innerRoof = [roofCol[0] * 0.42, roofCol[1] * 0.42, roofCol[2] * 0.48];
        const innerBot = [botCol[0] * 0.42, botCol[1] * 0.42, botCol[2] * 0.48];
        emit([kx0, ky0, kz1], [kx1, ky0, kz1], [kx1, ky1, kz1], [kx0, ky1, kz1], innerCol, wallUV, true);
        emit([kx1, ky0, kz0], [kx0, ky0, kz0], [kx0, ky1, kz0], [kx1, ky1, kz0], innerCol, wallUV, true);
        emit([kx1, ky0, kz1], [kx1, ky0, kz0], [kx1, ky1, kz0], [kx1, ky1, kz1], innerCol, wallUV, true);
        emit([kx0, ky0, kz0], [kx0, ky0, kz1], [kx0, ky1, kz1], [kx0, ky1, kz0], innerCol, wallUV, true);
        emit([kx0, ky1, kz1], [kx1, ky1, kz1], [kx1, ky1, kz0], [kx0, ky1, kz0], innerRoof, roofUV, true);
        emit([kx0, ky0, kz0], [kx1, ky0, kz0], [kx1, ky0, kz1], [kx0, ky0, kz1], innerBot, roofUV, true);
      }
    }

    if (o.rotate) {
      // rotate in place about the box centre so tilted slabs stay put
      this._rotateRange(
        startCount,
        x,
        y + h / 2,
        z,
        o.rotate[0] ?? 0,
        o.rotate[1] ?? 0,
        o.rotate[2] ?? 0,
      );
    }
    return this;
  }

  /** Rotate vertices from `start` to the end about a pivot. */
  _rotateRange(start, px, py, pz, rx, ry, rz) {
    if (!rx && !ry && !rz) return;
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const v = new THREE.Vector3();
    for (let i = start; i < this.count; i++) {
      v.set(this.p[i * 3] - px, this.p[i * 3 + 1] - py, this.p[i * 3 + 2] - pz).applyMatrix4(m);
      this.p[i * 3] = v.x + px;
      this.p[i * 3 + 1] = v.y + py;
      this.p[i * 3 + 2] = v.z + pz;
      v.set(this.n[i * 3], this.n[i * 3 + 1], this.n[i * 3 + 2]).applyMatrix3(nm).normalize();
      this.n[i * 3] = v.x;
      this.n[i * 3 + 1] = v.y;
      this.n[i * 3 + 2] = v.z;
    }
  }

  /**
   * Vertical cylinder (pipes, poles, tanks, masts).
   * `y` is the bottom. `rotate` (rx, ry, rz radians) is applied around the base
   * centre after construction, so horizontal pipes are easy to place.
   */
  cylinder(o) {
    const startCount = this.count;
    const seg = o.segments ?? 12;
    const rB = o.rBottom ?? o.radius ?? 1;
    const rT = o.rTop ?? o.radius ?? 1;
    const h = o.height ?? 1;
    const col = toRGB(o.color);
    const opts = { uScale: o.uScale ?? 0.25, vScale: o.vScale ?? 0.25, uOff: 0, vOff: 0 };

    const pts = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      pts.push({
        b: [ca * rB, 0, sa * rB],
        t: [ca * rT, h, sa * rT],
        n: normalize([ca, (rB - rT) / Math.max(h, 1e-4), sa]),
        u: (i / seg) * Math.max(1, (2 * Math.PI * rB) / 3.2),
      });
    }

    for (let i = 0; i < seg; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const n = normalize([
        (a.n[0] + b.n[0]) / 2,
        (a.n[1] + b.n[1]) / 2,
        (a.n[2] + b.n[2]) / 2,
      ]);
      const v0 = this._vertex(b.b[0], b.b[1], b.b[2], n[0], n[1], n[2], a.u, 0, col);
      const v1 = this._vertex(a.b[0], a.b[1], a.b[2], n[0], n[1], n[2], b.u, 0, col);
      const v2 = this._vertex(a.t[0], a.t[1], a.t[2], n[0], n[1], n[2], b.u, opts.vScale * h, col);
      const v3 = this._vertex(b.t[0], b.t[1], b.t[2], n[0], n[1], n[2], a.u, opts.vScale * h, col);
      this.i.push(v0, v1, v2, v0, v2, v3);
      this.triangles += 2;
    }

    if (o.caps) {
      const capCol = o.capColor !== undefined ? toRGB(o.capColor) : col;
      // top fan
      if (rT > 0) {
        const cTop = this._vertex(0, h, 0, 0, 1, 0, 0.5, 0.5, capCol);
        const ringT = pts.map((p) =>
          this._vertex(p.t[0], p.t[1], p.t[2], 0, 1, 0, 0.5 + p.t[0] / (2 * rT), 0.5 + p.t[2] / (2 * rT), capCol),
        );
        for (let i = 0; i < seg; i++) {
          this.i.push(cTop, ringT[i + 1], ringT[i]);
          this.triangles++;
        }
      }
      // bottom fan
      if (rB > 0) {
        const cBot = this._vertex(0, 0, 0, 0, -1, 0, 0.5, 0.5, capCol);
        const ringB = pts.map((p) =>
          this._vertex(p.b[0], p.b[1], p.b[2], 0, -1, 0, 0.5 + p.b[0] / (2 * rB), 0.5 + p.b[2] / (2 * rB), capCol),
        );
        for (let i = 0; i < seg; i++) {
          this.i.push(cBot, ringB[i], ringB[i + 1]);
          this.triangles++;
        }
      }
    }

    if (o.x || o.y || o.z || o.rotate) {
      this._transformLast(
        o.x ?? 0,
        o.y ?? 0,
        o.z ?? 0,
        o.rotate ? o.rotate[0] : 0,
        o.rotate ? o.rotate[1] : 0,
        o.rotate ? o.rotate[2] : 0,
        o.scale ?? [1, 1, 1],
        startCount,
      );
    }
    return this;
  }

  /** Translate/rotate/scale vertices appended from `startIndex` onwards. */
  _transformLast(tx, ty, tz, rx, ry, rz, scale, startIndex) {
    const m = new THREE.Matrix4();
    const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
    const scl = new THREE.Matrix4().makeScale(scale[0], scale[1], scale[2]);
    m.multiply(rot).multiply(scl).setPosition(tx, ty, tz);

    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const v = new THREE.Vector3();
    for (let i = startIndex; i < this.count; i++) {
      v.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]).applyMatrix4(m);
      this.p[i * 3] = v.x;
      this.p[i * 3 + 1] = v.y;
      this.p[i * 3 + 2] = v.z;
      v.set(this.n[i * 3], this.n[i * 3 + 1], this.n[i * 3 + 2]).applyMatrix3(nm).normalize();
      this.n[i * 3] = v.x;
      this.n[i * 3 + 1] = v.y;
      this.n[i * 3 + 2] = v.z;
    }
  }

  /**
   * Copy an arbitrary THREE.BufferGeometry into this builder, so landmarks can
   * use standard primitives (spheres, tori, lathes) while still merging into
   * the shared material buckets.
   */
  geometry(geo, transform = {}, col = WHITE) {
    const src = geo.index ? geo.toNonIndexed() : geo;
    const pos = src.attributes.position;
    if (!pos) return this;
    const nrm = src.attributes.normal;
    const uv = src.attributes.uv;
    const color = toRGB(col);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        transform.rotation ? transform.rotation[0] : 0,
        transform.rotation ? transform.rotation[1] : 0,
        transform.rotation ? transform.rotation[2] : 0,
        'XYZ',
      ),
    );
    const s = transform.scale || [1, 1, 1];
    const ArrayScale = Array.isArray(s) ? s : [s, s, s];
    m.compose(
      new THREE.Vector3(
        transform.position ? transform.position[0] : 0,
        transform.position ? transform.position[1] : 0,
        transform.position ? transform.position[2] : 0,
      ),
      q,
      new THREE.Vector3(ArrayScale[0], ArrayScale[1], ArrayScale[2]),
    );
    const nm = new THREE.Matrix3().getNormalMatrix(m);

    const uScale = transform.uvScale ?? 1;
    const vScale = transform.vScale ?? uScale;
    const v = new THREE.Vector3();

    const start = this.count;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      this.p.push(v.x, v.y, v.z);
      if (nrm) {
        v.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize();
        this.n.push(v.x, v.y, v.z);
      } else {
        this.n.push(0, 1, 0);
      }
      if (uv) {
        this.u.push(uv.getX(i) * uScale, uv.getY(i) * vScale);
      } else {
        this.u.push(0, 0);
      }
      this.c.push(color[0], color[1], color[2]);
      this.count++;
    }
    const idx = src.index;
    if (idx) {
      for (let i = 0; i < idx.count; i++) this.i.push(start + idx.getX(i));
      this.triangles += idx.count / 3;
    } else {
      for (let i = 0; i < pos.count; i++) this.i.push(start + i);
      this.triangles += pos.count / 3;
    }
    return this;
  }

  /** Append a transform (applies to vertices appended by the NEXT call). */
  build() {
    if (this.count === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * UV options that place facade windows on a repeating floor grid.
 * `offset` is in whole window modules so every face of one building shares
 * the same pattern phase (corners stay continuous).
 */
export function windowUV(district, offsetU = 0, offsetV = 0) {
  return {
    uScale: 1 / district.moduleW,
    vScale: 1 / district.floorH,
    uOff: offsetU,
    vOff: offsetV,
  };
}

/** Deterministic per-building UV phase (kept to whole modules 0..3). */
export function uvPhase(rng) {
  return [rng.int(0, 3), rng.int(0, 3)];
}

/** Axis-aligned rectangle shrink helper. */
export function inset(rect, amount) {
  return {
    x0: rect.x0 + amount,
    z0: rect.z0 + amount,
    x1: rect.x1 - amount,
    z1: rect.z1 - amount,
  };
}

export function rectArea(r) {
  return Math.max(0, r.x1 - r.x0) * Math.max(0, r.z1 - r.z0);
}
