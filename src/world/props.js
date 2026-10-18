import * as THREE from 'three';
import { DISTRICTS } from '../config/districts.js';
import { createRng } from '../core/rng.js';
import { addPropCollider } from '../player/collision.js';
import { MeshBuilder } from '../utils/geo.js';

/**
 * Instanced street furniture.
 *
 * Every repeated object (lamps, benches, bins, trees, stalls, crates…) lives in
 * exactly one InstancedMesh, so a whole city's street detail costs a couple of
 * dozen draw calls. Per-instance colour carries district identity: street lamps
 * glow amber in the Old Quarter and cold blue in Glassline.
 */

const WHITE = 0xffffff;

/* -------------------------------------------------------------------- *
 * Geometry definitions (local space; +x is "towards the road")
 * -------------------------------------------------------------------- */

const DEFS = {
  lamp: {
    mat: 'propMetal',
    build(b) {
      b.cylinder({ x: 0, y: 0, z: 0, rBottom: 0.15, rTop: 0.1, height: 7.4, segments: 8, color: WHITE });
      b.box({ x: 0, y: 0, z: 0, w: 0.5, h: 0.35, d: 0.5, color: WHITE });
      b.box({ x: 0.8, y: 7.2, z: 0, w: 1.7, h: 0.16, d: 0.16, color: WHITE });
      b.box({ x: 1.6, y: 6.9, z: 0, w: 0.8, h: 0.34, d: 0.42, color: WHITE });
    },
  },
  lampGlow: {
    mat: 'propGlow',
    build(b) {
      b.box({ x: 1.6, y: 6.7, z: 0, w: 0.66, h: 0.14, d: 0.36, color: WHITE });
    },
  },
  bench: {
    mat: 'propWood',
    build(b) {
      for (let i = 0; i < 3; i++) b.box({ x: 0, y: 0.45, z: -0.22 + i * 0.22, w: 1.9, h: 0.08, d: 0.18, color: WHITE });
      for (const lx of [-0.8, 0.8]) {
        b.box({ x: lx, y: 0, z: 0, w: 0.1, h: 0.45, d: 0.7, color: WHITE });
        b.box({ x: lx, y: 0.53, z: -0.34, w: 0.1, h: 0.5, d: 0.09, color: WHITE });
      }
      for (let i = 0; i < 2; i++) b.box({ x: 0, y: 0.62 + i * 0.19, z: -0.38, w: 1.9, h: 0.14, d: 0.07, color: WHITE });
    },
  },
  bollard: {
    mat: 'propMetal',
    build(b) {
      b.cylinder({ x: 0, y: 0, z: 0, rBottom: 0.16, rTop: 0.13, height: 0.95, segments: 8, color: WHITE, caps: true });
      b.box({ x: 0, y: 0.78, z: 0, w: 0.34, h: 0.1, d: 0.34, color: WHITE });
    },
  },
  bin: {
    mat: 'propPaint',
    build(b) {
      b.box({ x: 0, y: 0, z: 0, w: 0.6, h: 0.92, d: 0.6, color: WHITE });
      b.box({ x: 0, y: 0.92, z: 0, w: 0.68, h: 0.12, d: 0.68, color: WHITE });
      b.box({ x: 0, y: 1.04, z: 0, w: 0.4, h: 0.06, d: 0.4, color: WHITE });
    },
  },
  trafficSignal: {
    mat: 'propMetal',
    build(b) {
      b.cylinder({ x: 0, y: 0, z: 0, rBottom: 0.16, rTop: 0.12, height: 5.4, segments: 8, color: WHITE });
      b.box({ x: 0.9, y: 5.2, z: 0, w: 1.9, h: 0.16, d: 0.16, color: WHITE });
      b.box({ x: 1.8, y: 4.35, z: 0, w: 0.36, h: 1.3, d: 0.4, color: WHITE });
      b.box({ x: 1.8, y: 5.05, z: 0.24, w: 0.3, h: 0.3, d: 0.06, color: WHITE });
      b.box({ x: 1.8, y: 4.68, z: 0.24, w: 0.3, h: 0.3, d: 0.06, color: WHITE });
      b.box({ x: 1.8, y: 4.31, z: 0.24, w: 0.3, h: 0.3, d: 0.06, color: WHITE });
    },
  },
  signalGlow: {
    mat: 'propGlow',
    build(b) {
      b.box({ x: 1.8, y: 4.68, z: 0.29, w: 0.24, h: 0.24, d: 0.05, color: WHITE });
    },
  },
  barrier: {
    mat: 'propPaint',
    build(b) {
      b.box({ x: 0, y: 0, z: 0, w: 2.1, h: 0.16, d: 0.5, color: WHITE });
      b.box({ x: -0.85, y: 0.16, z: 0, w: 0.14, h: 1.0, d: 0.14, color: WHITE });
      b.box({ x: 0.85, y: 0.16, z: 0, w: 0.14, h: 1.0, d: 0.14, color: WHITE });
      b.box({ x: 0, y: 1.0, z: 0, w: 2.0, h: 0.16, d: 0.16, color: WHITE });
      b.box({ x: 0, y: 0.68, z: 0, w: 2.0, h: 0.14, d: 0.14, color: WHITE });
    },
  },
  crate: {
    mat: 'propWood',
    build(b) {
      b.box({ x: 0, y: 0, z: 0, w: 1.1, h: 1.0, d: 1.1, color: WHITE });
      b.box({ x: 0, y: 0.44, z: 0, w: 1.16, h: 0.1, d: 1.16, color: WHITE });
      b.box({ x: 0, y: 0.92, z: 0, w: 1.16, h: 0.1, d: 1.16, color: WHITE });
    },
  },
  planter: {
    mat: 'propPaint',
    build(b) {
      b.box({ x: 0, y: 0, z: 0, w: 1.5, h: 0.7, d: 1.5, color: WHITE });
      b.box({ x: 0, y: 0.7, z: 0, w: 1.6, h: 0.12, d: 1.6, color: WHITE });
      b.box({ x: 0, y: 0.72, z: 0, w: 1.3, h: 0.1, d: 1.3, color: 0x2d4a2b });
    },
  },
  tree: {
    mat: 'propBark',
    build(b) {
      b.cylinder({ x: 0, y: 0, z: 0, rBottom: 0.3, rTop: 0.18, height: 3.6, segments: 7, color: WHITE });
      b.box({ x: 0, y: 0, z: 0, w: 0.7, h: 0.3, d: 0.7, color: WHITE });
    },
  },
  treeTop: {
    mat: 'propFoliage',
    build(b) {
      b.geometry(new THREE.IcosahedronGeometry(1, 1), { position: [0, 4.4, 0], scale: [2.5, 2.1, 2.5] }, WHITE);
      b.geometry(new THREE.IcosahedronGeometry(1, 1), { position: [0.7, 3.4, 0.5], scale: [1.6, 1.3, 1.6] }, WHITE);
      b.geometry(new THREE.IcosahedronGeometry(1, 1), { position: [-0.8, 3.7, -0.4], scale: [1.5, 1.2, 1.5] }, WHITE);
    },
  },
  stallBase: {
    mat: 'propWood',
    build(b) {
      b.box({ x: 0, y: 0, z: 0, w: 2.6, h: 0.9, d: 1.5, color: WHITE });
      b.box({ x: 0, y: 0.9, z: 0, w: 2.8, h: 0.1, d: 1.7, color: WHITE });
      for (const px of [-1.2, 1.2]) b.box({ x: px, y: 0, z: 0.6, w: 0.12, h: 2.3, d: 0.12, color: WHITE });
      b.box({ x: 0, y: 2.2, z: -0.7, w: 2.7, h: 0.14, d: 0.14, color: WHITE });
    },
  },
  stallCanopy: {
    mat: 'propFabric',
    build(b) {
      b.box({ x: 0, y: 2.3, z: 0, w: 3.0, h: 0.12, d: 2.1, color: WHITE });
      b.box({ x: 0, y: 2.12, z: 1.0, w: 3.0, h: 0.32, d: 0.1, color: WHITE });
    },
  },
  valve: {
    mat: 'propMetal',
    build(b) {
      b.cylinder({ x: 0, y: 0, z: 0, rBottom: 0.5, rTop: 0.5, height: 1.2, segments: 10, color: WHITE, caps: true });
      b.cylinder({ x: 0, y: 1.2, z: 0, rBottom: 0.14, rTop: 0.14, height: 0.5, segments: 6, color: WHITE });
      b.geometry(new THREE.TorusGeometry(0.5, 0.09, 6, 14), { position: [0, 1.8, 0], rotation: [Math.PI / 2, 0, 0] }, WHITE);
    },
  },
  signPost: {
    mat: 'propMetal',
    build(b) {
      b.cylinder({ x: 0, y: 0, z: 0, rBottom: 0.09, rTop: 0.08, height: 3.1, segments: 6, color: WHITE });
      b.box({ x: 0, y: 2.3, z: 0, w: 1.5, h: 0.7, d: 0.08, color: WHITE });
      b.box({ x: 0, y: 1.6, z: 0, w: 1.1, h: 0.45, d: 0.07, color: WHITE });
    },
  },
  antenna: {
    mat: 'propMetal',
    build(b) {
      b.cylinder({ x: 0, y: 0, z: 0, rBottom: 0.35, rTop: 0.12, height: 9, segments: 6, color: WHITE });
      for (let i = 1; i <= 4; i++) b.box({ x: 0, y: i * 1.8, z: 0, w: 2.0 - i * 0.3, h: 0.1, d: 0.1, color: WHITE });
    },
  },
  pipeRun: {
    mat: 'propMetal',
    build(b) {
      b.cylinder({ x: 0, y: 0, z: 0, rBottom: 0.55, rTop: 0.55, height: 12, segments: 9, color: WHITE, rotate: [0, 0, Math.PI / 2] });
      for (const fx of [-4, 0, 4]) {
        b.box({ x: fx, y: -0.9, z: 0, w: 0.9, h: 1.4, d: 1.5, color: WHITE });
      }
    },
  },
};

/* -------------------------------------------------------------------- *
 * Placer
 * -------------------------------------------------------------------- */

export class PropPlacer {
  /** @param colliders optional Colliders instance — solid props register here */
  constructor(colliders = null) {
    this.buckets = new Map();
    this.colliders = colliders;
  }

  add(type, x, y, z, ry = 0, scale = 1, color = WHITE) {
    if (!DEFS[type]) throw new Error(`unknown prop type: ${type}`);
    let bucket = this.buckets.get(type);
    if (!bucket) {
      bucket = { m: [], c: [] };
      this.buckets.set(type, bucket);
    }
    const s = Array.isArray(scale) ? scale : [scale, scale, scale];
    const mtx = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
      new THREE.Vector3(s[0], s[1], s[2]),
    );
    bucket.m.push(mtx);
    const c = colorToRGB(color);
    bucket.c.push(c[0], c[1], c[2]);
    addPropCollider(this.colliders, type, x, y, z, ry, s);
  }

  /** Tree = trunk + canopy sharing one transform. */
  addTree(x, y, z, scale, color) {
    this.add('tree', x, y, z, 0, scale, 0x6b5a4a);
    this.add('treeTop', x, y, z, 0, scale, color);
  }

  get count() {
    let n = 0;
    for (const b of this.buckets.values()) n += b.m.length;
    return n;
  }

  finish(materials) {
    const group = new THREE.Group();
    group.name = 'props';
    for (const [type, bucket] of this.buckets) {
      const def = DEFS[type];
      const builder = new MeshBuilder();
      def.build(builder);
      const geometry = builder.build();
      if (!geometry) continue;
      const material = materials[def.mat];
      if (!material) continue;

      const mesh = new THREE.InstancedMesh(geometry, material, bucket.m.length);
      mesh.name = `prop:${type}`;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(bucket.c), 3);
      for (let i = 0; i < bucket.m.length; i++) mesh.setMatrixAt(i, bucket.m[i]);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.buckets.clear();
    return group;
  }
}

function colorToRGB(color) {
  const c = new THREE.Color();
  if (Array.isArray(color)) return color;
  c.set(color);
  return [c.r, c.g, c.b];
}

/* -------------------------------------------------------------------- *
 * Placement
 * -------------------------------------------------------------------- */

const SIDES = [
  { axis: 'x', sign: -1, ry: Math.PI / 2 }, // north edge, road at -z
  { axis: 'x', sign: 1, ry: -Math.PI / 2 }, // south edge, road at +z
  { axis: 'z', sign: 1, ry: 0 }, // east edge, road at +x
  { axis: 'z', sign: -1, ry: Math.PI }, // west edge, road at -x
];

/** Weighted pick from a props table (missing keys count as 0). */
function weightedPick(rng, table) {
  const entries = Object.entries(table).filter(([, v]) => v > 0);
  if (!entries.length) return null;
  let total = 0;
  for (const [, v] of entries) total += v;
  let r = rng.next() * total;
  for (const [k, v] of entries) {
    r -= v;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

const TREE_TINTS = [0x4f8a4a, 0x3f7a52, 0x62984a, 0x487f63, 0x5c9a58, 0x7a9a4a];

export function placeCellProps(cell, layout, settings, placer, propDensity) {
  const D = DISTRICTS[cell.district];
  const rng = createRng(cell.seed ^ 0x2b17);
  const inset = (cell.district === 'oldquarter' ? 3.6 : 5.2) * 0.45;
  const base = layout.curb;

  const x0 = cell.x0 + inset;
  const x1 = cell.x1 - inset;
  const z0 = cell.z0 + inset;
  const z1 = cell.z1 - inset;
  if (x1 - x0 < 4 || z1 - z0 < 4) return;

  const spacing = Math.max(9, 17 / Math.max(0.35, propDensity));
  let stepIndex = 0;

  for (const side of SIDES) {
    const from = side.axis === 'x' ? x0 : z0;
    const to = side.axis === 'x' ? x1 : z1;
    const fixed = side.axis === 'x' ? (side.sign < 0 ? z0 : z1) : side.sign < 0 ? x0 : x1;
    const length = to - from;
    const n = Math.max(1, Math.floor(length / spacing));
    const cellStep = length / n;

    for (let i = 0; i < n; i++) {
      const along = from + (i + 0.5) * cellStep;
      const px = side.axis === 'x' ? along : fixed;
      const pz = side.axis === 'x' ? fixed : along;
      const jitter = rng.range(-cellStep * 0.18, cellStep * 0.18);
      const jx = side.axis === 'x' ? px + jitter : px;
      const jz = side.axis === 'x' ? pz : pz + jitter;
      stepIndex++;

      const isLamp = stepIndex % 2 === 0;
      if (isLamp) {
        if (rng.chance(Math.min(1, D.props.lamp * 0.9))) {
          placer.add('lamp', jx, base, jz, side.ry, rng.range(0.94, 1.08), D.neon);
          placer.add('lampGlow', jx, base, jz, side.ry, rng.range(0.94, 1.08), glowTint(D.neon));
        }
        continue;
      }

      const kind = weightedPick(rng, {
        bench: D.props.bench ?? 0,
        bin: D.props.bin ?? 0,
        tree: D.props.tree ?? 0,
        planter: D.props.planter ?? 0,
        bollard: D.props.bollard ?? 0,
        crate: D.props.crate ?? 0,
        valve: D.props.valve ?? 0,
        stall: D.props.stall ?? 0,
      });

      if (!kind) continue;
      const ry = side.ry + (rng.chance(0.5) ? Math.PI : 0);

      switch (kind) {
        case 'tree':
          placer.addTree(jx, base, jz, rng.range(0.75, 1.25), TREE_TINTS[rng.int(0, TREE_TINTS.length - 1)]);
          break;
        case 'stall':
          placer.add('stallBase', jx, base, jz, ry, rng.range(0.9, 1.1), 0xc8b79a);
          placer.add('stallCanopy', jx, base, jz, ry, rng.range(0.9, 1.1), rng.pick(STALL_TINTS));
          break;
        case 'bench':
          placer.add('bench', jx, base, jz, ry, 1, 0xb39a76);
          break;
        case 'bin':
          placer.add('bin', jx, base, jz, ry, 1, rng.pick([0x59636e, 0x4a5560, 0x6a5a4a]));
          break;
        case 'bollard':
          placer.add('bollard', jx, base, jz, 0, 1, 0x8f97a3);
          break;
        case 'crate':
          placer.add('crate', jx, base, jz, ry, rng.range(0.8, 1.25), rng.pick([0xa08156, 0x8a6f4c, 0x746048]));
          break;
        case 'valve':
          placer.add('valve', jx, base, jz, ry, rng.range(0.9, 1.3), rng.pick([0x7a8a94, 0x8a6a52, 0x5f7a80]));
          break;
        case 'planter':
          placer.add('planter', jx, base, jz, ry, rng.range(0.9, 1.2), rng.pick([0x6a7480, 0x59646f]));
          break;
        default:
          break;
      }
    }
  }

  // --- district-specific interior clutter ---------------------------------
  const interiorProps = Math.round((cell.x1 - cell.x0) * (cell.z1 - cell.z0) * 0.0016 * propDensity);
  for (let i = 0; i < interiorProps; i++) {
    const ix = rng.range(cell.x0 + 7, cell.x1 - 7);
    const iz = rng.range(cell.z0 + 7, cell.z1 - 7);
    const kind = rng.next();
    if (cell.district === 'verdant' && kind < 0.7) {
      placer.addTree(ix, base, iz, rng.range(0.9, 1.6), TREE_TINTS[rng.int(0, TREE_TINTS.length - 1)]);
    } else if (cell.district === 'oldquarter' && kind < 0.4) {
      placer.add('crate', ix, base, iz, rng.range(0, 6.28), rng.range(0.8, 1.3), rng.pick([0xa08156, 0x8a6f4c]));
    } else if (cell.district === 'floodworks' && kind < 0.5) {
      placer.add('pipeRun', ix, base + 0.6, iz, rng.chance(0.5) ? 0 : Math.PI / 2, rng.range(0.8, 1.4), rng.pick([0x7a6a58, 0x5f6f78]));
    } else if (kind < 0.3) {
      placer.addTree(ix, base, iz, rng.range(0.8, 1.3), TREE_TINTS[rng.int(0, TREE_TINTS.length - 1)]);
    }
  }
}

const STALL_TINTS = [0xc4563f, 0x3f7fa8, 0xd08a34, 0x56764a, 0x9a5aa0, 0xb5453f];

/** Traffic signals sit at a subset of intersections, facing each approach. */
export function placeIntersectionProps(layout, settings, placer, propDensity) {
  const { grid, cell, origin, halfRoad, cells } = layout;
  for (let iz = 1; iz < grid; iz++) {
    for (let ix = 1; ix < grid; ix++) {
      if ((ix * 3 + iz * 5) % 4 !== 0) continue;
      if (iz === layout.canal.zLine && ix >= layout.splitX) continue;
      const ref = cells[iz * grid + ix];
      const D = DISTRICTS[ref.district];
      if ((D.props.traffic ?? 0) <= 0) continue;
      const lineX = origin + ix * cell;
      const lineZ = origin + iz * cell;
      const o = halfRoad - 1.6;
      const rng = createRng(layout.seed ^ (ix * 73856093) ^ (iz * 19349663));
      const corners = [
        { x: lineX + o, z: lineZ + o, ry: Math.PI },
        { x: lineX - o, z: lineZ - o, ry: 0 },
        { x: lineX - o, z: lineZ + o, ry: -Math.PI / 2 },
        { x: lineX + o, z: lineZ - o, ry: Math.PI / 2 },
      ];
      for (const c of corners) {
        if (!rng.chance(Math.min(1, D.props.traffic) * 0.75 * Math.min(1.4, propDensity))) continue;
        placer.add('trafficSignal', c.x, 0, c.z, c.ry, 1, 0x7d858f);
        placer.add('signalGlow', c.x, 0, c.z, c.ry, 1, 0xff3b47);
      }
    }
  }
}

/** Small detached signs and antennas on district borders. */
export function placeSignPosts(layout, placer, propDensity) {
  const rng = createRng(layout.seed ^ 0x9911);
  for (const cd of layout.cells) {
    const D = DISTRICTS[cd.district];
    if ((D.props.lamp ?? 0) <= 0) continue;
    const n = Math.round(rng.range(0, 1.4) * propDensity);
    for (let i = 0; i < n; i++) {
      const side = rng.int(0, 3);
      const t = rng.range(0.15, 0.85);
      let x;
      let z;
      let ry;
      const inset = 2.2;
      if (side === 0) { x = cd.x0 + (cd.x1 - cd.x0) * t; z = cd.z0 + inset; ry = Math.PI / 2; }
      else if (side === 1) { x = cd.x0 + (cd.x1 - cd.x0) * t; z = cd.z1 - inset; ry = -Math.PI / 2; }
      else if (side === 2) { x = cd.x1 - inset; z = cd.z0 + (cd.z1 - cd.z0) * t; ry = 0; }
      else { x = cd.x0 + inset; z = cd.z0 + (cd.z1 - cd.z0) * t; ry = Math.PI; }
      placer.add('signPost', x, layout.curb, z, ry, rng.range(0.9, 1.15), rng.pick([0x93a0ae, 0x7f8a96, 0xa8926f]));
    }
  }
}

function glowTint(hex) {
  const c = new THREE.Color(hex);
  return [Math.min(2.6, c.r * 2.3), Math.min(2.6, c.g * 2.3), Math.min(2.6, c.b * 2.3)];
}
