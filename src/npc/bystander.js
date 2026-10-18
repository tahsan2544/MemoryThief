import * as THREE from 'three';
import { MeshBuilder } from '../utils/geo.js';
import { createRng } from '../core/rng.js';
import { applyClip } from './npcAnim.js';
import {
  fabricNormal,
  faceAtlas,
  faceCell,
  FACE_VISOR,
  FACE_COUNT,
} from './figureTextures.js';

/**
 * Bystanders — the city's people, and the NPC memory sources.
 *
 * Shape: this rig is fully ARTICULATED now. Every limb is two segments on a
 * real pivot (thigh → knee → shin+boot, upper arm → elbow → forearm+hand),
 * ten merged meshes per figure instead of six, which means knees bend through
 * a stride and elbows fold when someone holds a device — the same trick that
 * makes Riven Vale read as a person. Everything inside a segment is merged
 * into one geometry, so the extra articulation costs +4 draw calls per
 * figure and nothing else.
 *
 * Texture: coats, trousers and boots share one procedural basket-weave
 * normal map (figureTextures.js) and every head UVs into a painted face
 * atlas — eyes, brows, mouths, a guard's visor — chosen deterministically
 * per seed. Faces and cloth cost zero extra draw calls: it is all one shared
 * material and baked UVs.
 *
 * Roles get distinct silhouettes: guards are broad with shoulder pads and a
 * helmet, vendors wear an apron, targets carry a coat tail and satchel, and
 * the four memory-source archetypes (attendant / trader / warden / clerk)
 * each have their own gear, palette slot and — see npcAnim.js — their own
 * bespoke idle. Every figure also derives a seeded gait STYLE (stride,
 * arm swing, tempo, resting elbow bend), so no two people walk alike.
 *
 * Animation is clip-driven (see npcAnim.js): the rig smooths its pivots
 * toward whatever the current clip targets, so mode/role changes blend
 * instead of snapping. Clips may leave the knees/elbows alone (target stays
 * null) and the gait solver fills in anatomically sensible bends on top of
 * whatever the clip asked for. `group.position.y` still tracks `baseY`, so
 * the logical ground alignment tests (and agent collision) are untouched.
 */

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ------------------------------------------------------------------ *
 * Shared geometry — MeshBuilder parts, one set per role, built once
 * ------------------------------------------------------------------ */

// vertex colours are MULTIPLIERS on the material colour (white = the raw
// palette colour, dark = boots/gloves/straps, bright = gear highlights)
const FULL = 0xffffff;
const SOFT = 0xdadada;
const DIM = 0xa8a8a8;
const DARK = 0x60626a;
const BOOT = 0x31343d;
const GLOVE = 0x3a3d47;

const GEO = {}; // GEO[role] = { thigh, shin, upper, fore, torso }
const HEADS = {}; // HEADS[`${role}|face|hair`] = head geometry

function part(fn) {
  const b = new MeshBuilder();
  fn(b);
  return b.isEmpty ? null : b.build();
}

const ROLE_BODY = {
  civilian: { shoulder: 0.54, chestW: 0.42, limb: 1.0, gear: null },
  guard: { shoulder: 0.63, chestW: 0.47, limb: 1.13, gear: 'guard' },
  vendor: { shoulder: 0.56, chestW: 0.45, limb: 1.0, gear: 'apron' },
  target: { shoulder: 0.52, chestW: 0.4, limb: 0.94, gear: 'coat' },
  attendant: { shoulder: 0.55, chestW: 0.43, limb: 1.0, gear: 'attendant' },
  trader: { shoulder: 0.56, chestW: 0.45, limb: 1.0, gear: 'trader' },
  warden: { shoulder: 0.58, chestW: 0.45, limb: 1.04, gear: 'warden' },
  clerk: { shoulder: 0.5, chestW: 0.4, limb: 0.96, gear: 'clerk' },
};

function buildLimbParts(role) {
  const B = ROLE_BODY[role] ?? ROLE_BODY.civilian;
  const L = B.limb;

  // ---- thigh (pivot at the hip, spans −0.44..0) --------------------------
  const thigh = part((b) => {
    b.box({ x: 0, y: -0.44, z: 0, w: 0.19 * L, h: 0.44, d: 0.22 * L, color: FULL });
    b.box({ x: 0, y: -0.07, z: 0, w: 0.195 * L, h: 0.045, d: 0.225 * L, color: DIM }); // knee seam
  });

  // ---- shin + boot (pivot at the knee, spans −0.42..0 → sole on the ground)
  const shin = part((b) => {
    b.box({ x: 0, y: -0.35, z: 0, w: 0.15 * L, h: 0.35, d: 0.19 * L, color: FULL });
    b.box({ x: 0, y: -0.42, z: 0.05, w: 0.17 * L, h: 0.09, d: 0.3 * L, color: BOOT }); // boot
  });

  // ---- upper arm (pivot at the shoulder, spans −0.30..0) -----------------
  const upper = part((b) => {
    b.box({ x: 0, y: -0.075, z: 0, w: 0.145 * L, h: 0.075, d: 0.165 * L, color: SOFT }); // shoulder cap
    b.box({ x: 0, y: -0.3, z: 0, w: 0.13 * L, h: 0.3, d: 0.15 * L, color: FULL });
  });

  // ---- forearm + hand (pivot at the elbow, spans −0.355..0) --------------
  const fore = part((b) => {
    b.box({ x: 0, y: -0.25, z: 0, w: 0.11 * L, h: 0.26, d: 0.13 * L, color: FULL });
    b.box({ x: 0, y: -0.355, z: 0.005, w: 0.11 * L, h: 0.11, d: 0.14 * L, color: GLOVE }); // gloved hand
  });

  return { thigh, shin, upper, fore };
}

function buildTorso(role) {
  const B = ROLE_BODY[role] ?? ROLE_BODY.civilian;

  const torso = part((b) => {
    // pelvis / chest / shoulder line / collar — a tapered body, not a slab
    b.box({ x: 0, y: -0.3, z: 0, w: B.chestW * 0.94, h: 0.26, d: 0.24, color: SOFT });
    b.box({ x: 0, y: -0.02, z: 0, w: B.chestW, h: 0.3, d: 0.25, color: SOFT });
    b.box({ x: 0, y: 0.22, z: 0, w: B.shoulder, h: 0.12, d: 0.24, color: SOFT });
    b.box({ x: 0, y: 0.31, z: 0, w: 0.24, h: 0.08, d: 0.19, color: DIM });

    switch (B.gear) {
      case 'guard': {
        b.box({ x: -0.24, y: 0.25, z: 0, w: 0.16, h: 0.1, d: 0.26, color: 0xcfd4dd }); // L shoulder pad
        b.box({ x: 0.24, y: 0.25, z: 0, w: 0.16, h: 0.1, d: 0.26, color: 0xcfd4dd }); // R shoulder pad
        b.box({ x: 0, y: 0.0, z: 0.14, w: B.chestW * 0.76, h: 0.24, d: 0.06, color: 0xb9bfca }); // chest plate
        b.box({ x: 0, y: -0.06, z: 0.15, w: B.chestW * 0.7, h: 0.1, d: 0.06, color: 0x9aa0ab }); // belt plate
        break;
      }
      case 'apron': {
        b.box({ x: 0, y: -0.32, z: 0.15, w: B.chestW * 0.82, h: 0.4, d: 0.06, color: FULL }); // apron
        b.box({ x: 0, y: -0.2, z: 0.185, w: B.chestW * 0.5, h: 0.12, d: 0.03, color: DIM }); // pocket
        b.box({ x: 0, y: 0.18, z: 0.145, w: 0.2, h: 0.05, d: 0.04, color: DIM }); // bib strap
        break;
      }
      case 'coat': {
        b.box({ x: 0, y: -0.36, z: -0.14, w: B.chestW * 0.86, h: 0.46, d: 0.08, color: FULL }); // coat tail
        b.box({ x: 0.02, y: -0.05, z: 0.15, w: 0.08, h: 0.34, d: 0.05, color: DARK }); // satchel strap
        b.box({ x: 0.17, y: -0.3, z: 0.1, w: 0.16, h: 0.17, d: 0.1, color: 0x8a7458 }); // satchel
        break;
      }
      case 'attendant': {
        b.box({ x: 0, y: -0.1, z: 0.14, w: B.chestW * 0.86, h: 0.32, d: 0.06, color: FULL }); // utility vest
        b.box({ x: 0, y: 0.1, z: 0.17, w: B.chestW * 0.8, h: 0.045, d: 0.03, color: 0xf2f6ff }); // reflective band
        b.box({ x: 0, y: -0.02, z: 0.17, w: B.chestW * 0.8, h: 0.045, d: 0.03, color: 0xf2f6ff }); // reflective band
        b.box({ x: 0, y: 0.17, z: 0.15, w: 0.14, h: 0.12, d: 0.03, color: 0xdfe4ee }); // lanyard
        break;
      }
      case 'trader': {
        b.box({ x: 0, y: -0.12, z: 0.14, w: B.chestW * 0.9, h: 0.3, d: 0.06, color: DIM }); // market vest
        b.box({ x: 0, y: -0.06, z: 0, w: B.chestW * 1.02, h: 0.05, d: 0.26, color: DARK }); // belt
        b.box({ x: 0.16, y: -0.29, z: 0.08, w: 0.15, h: 0.17, d: 0.11, color: 0x776c58 }); // coin satchel
        break;
      }
      case 'warden': {
        b.box({ x: 0, y: -0.44, z: -0.13, w: B.chestW * 0.9, h: 0.56, d: 0.09, color: FULL }); // long archive coat
        b.box({ x: 0, y: -0.06, z: 0, w: B.chestW * 1.02, h: 0.06, d: 0.27, color: DARK }); // belt
        b.box({ x: 0.17, y: -0.17, z: 0.11, w: 0.07, h: 0.13, d: 0.05, color: 0xb9bfca }); // key ring
        break;
      }
      case 'clerk': {
        b.box({ x: 0, y: -0.02, z: 0.15, w: 0.05, h: 0.26, d: 0.03, color: DARK }); // tie
        b.box({ x: 0.13, y: 0.13, z: 0.15, w: 0.1, h: 0.05, d: 0.03, color: 0xe8ecf4 }); // name badge
        b.box({ x: -0.13, y: 0.07, z: 0.15, w: 0.09, h: 0.09, d: 0.03, color: DIM }); // breast pocket
        break;
      }
      default:
        break; // civilians: the body alone carries the silhouette
    }
  });

  return torso;
}

/**
 * Heads are built per (role, face cell, hair colour) combination — the face
 * plate UVs into its atlas cell and hair/helmet colours bake into vertex
 * colours — then shared between every figure with that combination.
 */
function buildHead(role, faceIdx, hairHex) {
  const B = ROLE_BODY[role] ?? ROLE_BODY.civilian;
  const cell = faceCell(faceIdx);

  const head = part((b) => {
    // skull + neck default to UV (0,0) → the atlas BLANK cell (plain skin)
    b.box({ x: 0, y: -0.16, z: 0, w: 0.11, h: 0.08, d: 0.12, color: FULL }); // neck
    b.box({ x: 0, y: -0.08, z: 0, w: 0.22, h: 0.2, d: 0.22, color: FULL }); // skull
    // face plate: a thin slab whose front face maps exactly onto one atlas
    // cell (uScale = cellW / plateW → the face fills the plate edge to edge)
    b.box({
      x: 0, y: -0.055, z: 0.112, w: 0.15, h: 0.13, d: 0.016,
      color: FULL,
      uScale: 0.25 / 0.15, vScale: 0.5 / 0.13,
      uOff: cell.u0, vOff: cell.v0,
    });
    b.box({ x: 0, y: -0.075, z: 0.075, w: 0.1, h: 0.05, d: 0.06, color: FULL }); // chin
    b.box({ x: 0, y: -0.015, z: 0.118, w: 0.035, h: 0.055, d: 0.03, color: FULL }); // nose
    b.box({ x: 0, y: 0.045, z: 0.108, w: 0.19, h: 0.035, d: 0.03, color: FULL }); // brow ridge
    // hair
    b.box({ x: 0, y: 0.09, z: 0, w: 0.23, h: 0.07, d: 0.23, color: hairHex }); // crown
    b.box({ x: -0.095, y: -0.01, z: 0.02, w: 0.035, h: 0.07, d: 0.16, color: hairHex }); // L sideburn
    b.box({ x: 0.095, y: -0.01, z: 0.02, w: 0.035, h: 0.07, d: 0.16, color: hairHex }); // R sideburn

    switch (B.gear) {
      case 'guard':
        b.box({ x: 0, y: 0.055, z: 0, w: 0.245, h: 0.105, d: 0.255, color: 0x9aa2b0 }); // helmet
        b.box({ x: 0, y: 0.05, z: 0.135, w: 0.2, h: 0.03, d: 0.06, color: 0x60636d }); // helmet peak
        break;
      case 'apron':
        b.box({ x: 0, y: 0.105, z: 0, w: 0.235, h: 0.05, d: 0.235, color: 0x9a5a3a }); // bandanna band
        b.box({ x: 0, y: 0.1, z: -0.13, w: 0.05, h: 0.05, d: 0.05, color: 0x9a5a3a }); // knot
        break;
      case 'coat':
        b.box({ x: 0, y: 0.09, z: 0, w: 0.235, h: 0.075, d: 0.235, color: 0x2f3540 }); // beanie
        break;
      case 'attendant':
        b.box({ x: 0, y: 0.115, z: 0, w: 0.23, h: 0.06, d: 0.23, color: 0x8890a0 }); // peaked cap crown
        b.box({ x: 0, y: 0.095, z: 0.145, w: 0.16, h: 0.025, d: 0.1, color: 0x545a66 }); // cap peak
        break;
      case 'trader':
        b.box({ x: 0, y: 0.11, z: 0, w: 0.22, h: 0.055, d: 0.22, color: 0x6b5a44 }); // headscarf roll
        break;
      case 'warden':
        b.box({ x: 0, y: 0.1, z: 0, w: 0.3, h: 0.03, d: 0.3, color: 0x4a4640 }); // hat brim
        b.box({ x: 0, y: 0.125, z: 0, w: 0.19, h: 0.1, d: 0.19, color: 0x5a554c }); // hat crown
        break;
      case 'clerk':
        b.box({ x: 0, y: 0.1, z: -0.01, w: 0.225, h: 0.06, d: 0.225, color: hairHex }); // neatly combed
        break;
      default:
        break;
    }
  });

  return head;
}

function limbGeometries(role) {
  const key = ROLE_BODY[role] ? role : 'civilian';
  if (!GEO[key]) GEO[key] = buildLimbParts(key);
  return GEO[key];
}

function torsoGeometry(role) {
  const key = ROLE_BODY[role] ? role : 'civilian';
  const cacheKey = `torso:${key}`;
  if (!GEO[cacheKey]) GEO[cacheKey] = { torso: buildTorso(key) };
  return GEO[cacheKey].torso;
}

function headGeometry(role, faceIdx, hairHex) {
  const key = `${ROLE_BODY[role] ? role : 'civilian'}|${faceIdx}|${hairHex}`;
  if (!HEADS[key]) HEADS[key] = buildHead(ROLE_BODY[role] ? role : 'civilian', faceIdx, hairHex);
  return HEADS[key];
}

/* ------------------------------------------------------------------ *
 * Shared materials — palette-keyed, textured with cloth + faces
 * ------------------------------------------------------------------ */

let MAT = null;

const SKIN_TONES = [0x8a7a70, 0x6e5a4e, 0xb09880, 0x5a463c, 0x9c8474, 0x7d6558];
const HAIR_HEX = [0x2e2a26, 0x4a3a2c, 0x1d1b1f, 0x6b5b48, 0xa89c8c, 0x7a3f2a];

function materials() {
  if (MAT) return MAT;
  const fabric = fabricNormal();
  MAT = {
    coat: new THREE.MeshStandardMaterial({
      color: 0x3b4457, roughness: 0.82, metalness: 0.05,
      vertexColors: true, normalMap: fabric,
      normalScale: new THREE.Vector2(0.55, 0.55),
    }),
    accent: new THREE.MeshStandardMaterial({
      color: 0x564d78, roughness: 0.72, metalness: 0.1,
      vertexColors: true, normalMap: fabric,
      normalScale: new THREE.Vector2(0.5, 0.5),
    }),
    skin: new THREE.MeshStandardMaterial({
      color: 0x8a7a70, roughness: 0.66, metalness: 0,
      vertexColors: true, map: faceAtlas(),
    }),
  };
  return MAT;
}

const PALETTES = new Map();

function materialsFor(coat, accent, skin) {
  if (coat === undefined && accent === undefined) return materials();
  const key = `${coat}|${accent}|${skin}`;
  let set = PALETTES.get(key);
  if (!set) {
    const base = materials();
    set = {
      coat: new THREE.MeshStandardMaterial({
        color: coat ?? 0x3b4457, roughness: 0.82, metalness: 0.05,
        vertexColors: true, normalMap: base.coat.normalMap,
        normalScale: new THREE.Vector2(0.55, 0.55),
      }),
      skin: new THREE.MeshStandardMaterial({
        color: skin ?? 0x8a7a70, roughness: 0.66, metalness: 0,
        vertexColors: true, map: base.skin.map,
      }),
      accent: new THREE.MeshStandardMaterial({
        color: accent ?? 0x564d78, roughness: 0.72, metalness: 0.1,
        vertexColors: true, normalMap: base.accent.normalMap,
        normalScale: new THREE.Vector2(0.5, 0.5),
      }),
    };
    PALETTES.set(key, set);
  }
  return set;
}

/* ------------------------------------------------------------------ *
 * Pose targets — clips write angles; the solver may fill the joints
 * ------------------------------------------------------------------ */

const TARGET_KEYS = [
  'armLx', 'armLz', 'armRx', 'armRz', 'legLx', 'legRx',
  'kneeLx', 'kneeRx', 'elbowLx', 'elbowRx',
  'torsoX', 'torsoZ', 'headX', 'headY', 'bodyY', 'bob',
];
// joints a clip can stay silent about: target stays null until the gait
// solver below fills in an anatomically sensible bend for this frame
const SOLVER_KEYS = ['kneeLx', 'kneeRx', 'elbowLx', 'elbowRx'];

const resetTargets = (tgt) => {
  for (const k of TARGET_KEYS) tgt[k] = SOLVER_KEYS.includes(k) ? null : 0;
  return tgt;
};
const zeroPose = () => {
  const o = {};
  for (const k of TARGET_KEYS) o[k] = 0;
  return o;
};

/**
 * Build one bystander.
 * @param {{seed?:number, coat?:number, accent?:number, skin?:number, role?:string}} opts
 */
export function createBystander({ seed = 1, coat, accent, skin, role = 'civilian' } = {}) {
  const g = limbGeometries(role);
  const torsoGeo = torsoGeometry(role);

  // deterministic per-figure choices: skin, face cell, hair — and a gait
  // STYLE (stride / arm swing / tempo / resting elbow bend) so no two
  // people move alike even when they share a clip
  const rng = createRng(`fig:${seed}:${role}`);
  const skinTone = skin ?? SKIN_TONES[rng.int(0, SKIN_TONES.length - 1)];
  const hairHex = HAIR_HEX[rng.int(0, HAIR_HEX.length - 1)];
  const faceIdx =
    (role === 'guard' ? FACE_VISOR : 1 + rng.int(0, FACE_COUNT - 1));
  const headGeo = headGeometry(role, faceIdx, hairHex);
  const m = materialsFor(coat, accent, skinTone);

  const style = {
    arm: rng.range(0.8, 1.35),
    leg: rng.range(0.85, 1.2),
    bob: rng.range(0.8, 1.3),
    tempo: rng.range(0.85, 1.18),
    lean: rng.range(0.85, 1.2),
    rest: rng.range(0.06, 0.26),
  };

  const group = new THREE.Group();
  group.name = 'bystander';

  const mesh = (geo, mat, x, y, z, name) => {
    const mm = new THREE.Mesh(geo, mat);
    mm.position.set(x, y, z);
    mm.name = name;
    mm.castShadow = true;
    group.add(mm);
    return mm;
  };

  // ten articulated meshes: thigh / shin on a knee, upper / fore on an elbow
  const legL = mesh(g.thigh, m.coat, -0.12, 0.86, 0, 'thighL');
  const legR = mesh(g.thigh, m.coat, 0.12, 0.86, 0, 'thighR');
  const kneeL = mesh(g.shin, m.coat, -0.12, 0.42, 0, 'shinL');
  const kneeR = mesh(g.shin, m.coat, 0.12, 0.42, 0, 'shinR');
  const torso = mesh(torsoGeo, m.accent, 0, 1.16, 0, 'torso');
  const armL = mesh(g.upper, m.coat, -0.29, 1.44, 0, 'upperL');
  const armR = mesh(g.upper, m.coat, 0.29, 1.44, 0, 'upperR');
  const foreL = mesh(g.fore, m.coat, -0.29, 1.14, 0, 'foreL');
  const foreR = mesh(g.fore, m.coat, 0.29, 1.14, 0, 'foreR');
  const head = mesh(headGeo, m.skin, 0, 1.58, 0, 'head');

  // per-seed build jitter: height + shoulder spread so a crowd never marches
  // or stands identically
  const j = ((seed * 2.399) % 1) - 0.5; // -0.5..0.5
  const scale = 1 + j * 0.13; // 0.935..1.065
  group.scale.set(1 + j * 0.03, scale, 1 + j * 0.03);

  const phase = (seed * 2.399) % (Math.PI * 2);
  const seedPhase = phase;
  let baseY = 0;
  let headYaw = 0;
  let gait = 0;
  let stridePhase = phase;
  let anim = 'idleShift';
  const tgt = resetTargets({});
  const cur = zeroPose();

  const api = {
    group,
    height: 1.78 * scale,
    role,
    style,
    parts: { head, torso, armL, armR, foreL, foreR, legL, legR, kneeL, kneeR },

    setPosition(x, y, z) {
      group.position.set(x, y, z);
      baseY = y;
    },
    setYaw(y) {
      group.rotation.y = y;
    },
    /** 0 = idle sway, 1 = full walking stride. */
    setGait(k) {
      gait = Math.max(0, Math.min(1, k ?? 0));
    },
    /** Pick an animation clip by name (see npcAnim.js). */
    setAnim(name) {
      if (name) anim = name;
    },
    getAnim() {
      return anim;
    },

    /**
     * @param {number} dt seconds
     * @param {number} t elapsed seconds
     * @param {{x:number,y:number,z:number}|null} viewer world position to face
     */
    update(dt, t, viewer = null) {
      // stride phase advances faster the more this figure is striding
      stridePhase += dt * (1.6 + gait * 6.0) * style.tempo;

      resetTargets(tgt);
      applyClip(anim, {
        t, phase: stridePhase, gait, awareness: 0, role, seedPhase, seed, style,
      }, tgt);

      // ---- knee/elbow solver ------------------------------------------
      // The clip may leave a joint null; fill it with a bend derived from
      // the stride itself: knees fold through the swing and deepen when the
      // clip crouches (bodyY < 0), elbows keep a seeded resting bend and
      // curl as their own arm swings forward — exactly how Riven Vale's
      // locomotion reads, at bystander budget.
      const ph = ((stridePhase % TAU) + TAU) % TAU;
      const foldL = Math.sin(clamp01((ph - Math.PI) / Math.PI) * Math.PI);
      const foldR = Math.sin(clamp01(ph / Math.PI) * Math.PI);
      const s = Math.sin(ph);
      const crouch = Math.max(0, -(tgt.bodyY ?? 0));
      if (tgt.kneeLx == null) tgt.kneeLx = foldL * 0.95 * gait + crouch * 3.2;
      if (tgt.kneeRx == null) tgt.kneeRx = foldR * 0.95 * gait + crouch * 3.2;
      if (tgt.elbowLx == null) tgt.elbowLx = style.rest + Math.max(0, s) * 0.3 * gait;
      if (tgt.elbowRx == null) tgt.elbowRx = style.rest + Math.max(0, -s) * 0.3 * gait;

      // exponential smoothing so clip changes (and alert transitions) blend
      const kf = 1 - Math.exp(-11 * dt);
      for (const k of TARGET_KEYS) cur[k] += (tgt[k] - cur[k]) * kf;

      legL.rotation.x = cur.legLx;
      legR.rotation.x = cur.legRx;
      kneeL.rotation.x = cur.kneeLx; // positive x folds the shin backwards
      kneeR.rotation.x = cur.kneeRx;
      armL.rotation.x = cur.armLx;
      armL.rotation.z = cur.armLz;
      armR.rotation.x = cur.armRx;
      armR.rotation.z = cur.armRz;
      foreL.rotation.x = -cur.elbowLx; // negative x folds the forearm forwards
      foreR.rotation.x = -cur.elbowRx;
      torso.rotation.x = cur.torsoX;
      torso.rotation.z = cur.torsoZ;
      head.rotation.x = cur.headX;
      group.position.y = baseY + cur.bob + cur.bodyY;

      // head: track the player when close (overrides the clip's idle glance)
      let target = cur.headY;
      if (viewer) {
        const dx = viewer.x - group.position.x;
        const dz = viewer.z - group.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 16 * 16) {
          const worldYaw = Math.atan2(dx, dz);
          let rel = worldYaw - group.rotation.y;
          while (rel > Math.PI) rel -= Math.PI * 2;
          while (rel < -Math.PI) rel += Math.PI * 2;
          target = Math.max(-0.9, Math.min(0.9, rel));
        }
      }
      headYaw += (target - headYaw) * Math.min(1, dt * 3.2);
      head.rotation.y = headYaw;
    },

    dispose() {
      group.clear(); // geometries and materials are module-shared
    },
  };

  return api;
}

/** Release the shared module resources (only on full teardown). */
export function disposeBystanderResources() {
  for (const set of Object.values(GEO)) {
    for (const geo of Object.values(set)) geo?.dispose();
  }
  for (const k of Object.keys(GEO)) delete GEO[k];
  for (const geo of Object.values(HEADS)) geo.dispose();
  for (const k of Object.keys(HEADS)) delete HEADS[k];
  for (const m of Object.values(MAT ?? {})) m.dispose();
  for (const set of PALETTES.values()) {
    set.coat.dispose();
    set.accent.dispose();
    set.skin.dispose();
  }
  PALETTES.clear();
  MAT = null;
}
