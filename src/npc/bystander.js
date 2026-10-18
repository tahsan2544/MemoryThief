import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyClip } from './npcAnim.js';

/**
 * Bystanders — the city's people, and Phase 3's NPC memory sources.
 *
 * Phase 8 rebuild. The original figure was six flat boxes; this one assembles
 * each *limb* from several merged boxes (thigh/shin/foot, upper-fore-hand,
 * pelvis/chest/shoulders/collar, neck/skull/hair) so a person reads as a
 * person — while still costing the SAME six draw calls, because everything in
 * a limb is merged into one geometry.
 *
 * Roles get distinct silhouettes: guards are broad with shoulder pads and a
 * helmet, vendors wear an apron, targets carry a coat tail and satchel, and
 * every figure gets a small per-seed height/build jitter so a crowd never
 * looks cloned.
 *
 * Animation is clip-driven (see npcAnim.js): the rig smooths its pivots toward
 * whatever the current clip targets, so mode/role changes blend instead of
 * snapping. `group.position.y` still tracks `baseY`, so the logical ground
 * alignment tests (and agent collision) are untouched.
 */

/* ------------------------------------------------------------------ *
 * Shared geometry — one merged set per role, built once
 * ------------------------------------------------------------------ */

const GEO = {}; // GEO[role] = { leg, arm, torso, head }

/** Merge a list of box specs { w,h,d,x?,y?,z? } into one geometry. */
function merged(list) {
  const parts = list.map(({ w, h, d, x = 0, y = 0, z = 0 }) => {
    const b = new THREE.BoxGeometry(w, h, d);
    b.translate(x, y, z);
    return b;
  });
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

const ROLE_BODY = {
  civilian: { shoulder: 0.54, chestW: 0.42, limb: 1.0, gear: null },
  guard: { shoulder: 0.63, chestW: 0.47, limb: 1.13, gear: 'guard' },
  vendor: { shoulder: 0.56, chestW: 0.45, limb: 1.0, gear: 'apron' },
  target: { shoulder: 0.52, chestW: 0.4, limb: 0.94, gear: 'coat' },
};

function buildRole(role) {
  const B = ROLE_BODY[role] ?? ROLE_BODY.civilian;
  const L = B.limb;

  // ---- leg: thigh / shin / foot (pivot at the hip, extends downward) ----
  const leg = merged([
    { w: 0.19 * L, h: 0.44, d: 0.22 * L, y: -0.22 }, // thigh
    { w: 0.15 * L, h: 0.36, d: 0.19 * L, y: -0.62 }, // shin
    { w: 0.17 * L, h: 0.09, d: 0.3 * L, y: -0.815, z: 0.05 }, // foot
  ]);

  // ---- arm: upper / fore / hand (pivot at the shoulder) ----------------
  const arm = merged([
    { w: 0.13 * L, h: 0.3, d: 0.15 * L, y: -0.15 }, // upper
    { w: 0.11 * L, h: 0.26, d: 0.13 * L, y: -0.42 }, // forearm
    { w: 0.11 * L, h: 0.11, d: 0.14 * L, y: -0.6 }, // hand
  ]);

  // ---- torso: pelvis / chest / shoulders / collar (+ role gear) --------
  const torsoBoxes = [
    { w: B.chestW * 0.94, h: 0.26, d: 0.24, y: -0.17 }, // pelvis
    { w: B.chestW, h: 0.3, d: 0.25, y: 0.13 }, // chest
    { w: B.shoulder, h: 0.12, d: 0.24, y: 0.28 }, // shoulder line
    { w: 0.24, h: 0.08, d: 0.19, y: 0.35 }, // collar
  ];
  if (B.gear === 'guard') {
    torsoBoxes.push(
      { w: 0.16, h: 0.1, d: 0.26, x: -0.24, y: 0.3 }, // L shoulder pad
      { w: 0.16, h: 0.1, d: 0.26, x: 0.24, y: 0.3 }, // R shoulder pad
      { w: B.chestW * 0.7, h: 0.12, d: 0.06, y: 0.05, z: 0.15 }, // belt plate
    );
  } else if (B.gear === 'apron') {
    torsoBoxes.push({ w: B.chestW * 0.82, h: 0.4, d: 0.06, y: -0.14, z: 0.15 }); // apron
  } else if (B.gear === 'coat') {
    torsoBoxes.push({ w: B.chestW * 0.86, h: 0.46, d: 0.08, y: -0.2, z: -0.14 }); // coat tail
    torsoBoxes.push({ w: 0.08, h: 0.34, d: 0.05, y: -0.05, z: 0.15 }); // satchel strap
  }
  const torso = merged(torsoBoxes);

  // ---- head: neck / skull / hair or headwear (pivot at head centre) ----
  const headBoxes = [
    { w: 0.11, h: 0.08, d: 0.12, y: -0.12 }, // neck
    { w: 0.22, h: 0.2, d: 0.22, y: 0.02 }, // skull
    { w: 0.23, h: 0.07, d: 0.23, y: 0.13 }, // hair / cap crown
  ];
  if (B.gear === 'guard') headBoxes.push({ w: 0.24, h: 0.09, d: 0.25, y: 0.09 }); // helmet
  else if (B.gear === 'apron') headBoxes.push({ w: 0.05, h: 0.05, d: 0.05, y: 0.0, z: 0.13 }); // bandanna knot
  const head = merged(headBoxes);

  return { leg, arm, torso, head };
}

function geometries(role) {
  const key = ROLE_BODY[role] ? role : 'civilian';
  if (!GEO[key]) GEO[key] = buildRole(key);
  return GEO[key];
}

/* ------------------------------------------------------------------ *
 * Shared materials — cached by colour pair
 * ------------------------------------------------------------------ */

let MAT = null;

function materials() {
  if (MAT) return MAT;
  MAT = {
    coat: new THREE.MeshStandardMaterial({ color: 0x3b4457, roughness: 0.85, metalness: 0.08 }),
    skin: new THREE.MeshStandardMaterial({ color: 0x8a7a70, roughness: 0.72, metalness: 0 }),
    accent: new THREE.MeshStandardMaterial({ color: 0x564d78, roughness: 0.7, metalness: 0.12 }),
  };
  return MAT;
}

const PALETTES = new Map();

function materialsFor(coat, accent) {
  if (coat === undefined && accent === undefined) return materials();
  const key = `${coat}|${accent}`;
  let set = PALETTES.get(key);
  if (!set) {
    const base = materials();
    set = {
      coat: new THREE.MeshStandardMaterial({ color: coat ?? 0x3b4457, roughness: 0.85, metalness: 0.08 }),
      skin: base.skin,
      accent: new THREE.MeshStandardMaterial({ color: accent ?? 0x564d78, roughness: 0.7, metalness: 0.12 }),
    };
    PALETTES.set(key, set);
  }
  return set;
}

/* ------------------------------------------------------------------ *
 * Pose smoothing
 * ------------------------------------------------------------------ */

const TARGET_KEYS = [
  'armLx', 'armLz', 'armRx', 'armRz', 'legLx', 'legRx',
  'torsoX', 'torsoZ', 'headX', 'headY', 'bodyY', 'bob',
];
const zeroTarget = () => {
  const o = {};
  for (const k of TARGET_KEYS) o[k] = 0;
  return o;
};

/**
 * Build one bystander.
 * @param {{seed?:number, coat?:number, accent?:number, role?:string}} opts
 */
export function createBystander({ seed = 1, coat, accent, role = 'civilian' } = {}) {
  const g = geometries(role);
  const m = materialsFor(coat, accent);

  const group = new THREE.Group();
  group.name = 'bystander';

  const mesh = (geo, mat, x, y, z) => {
    const mm = new THREE.Mesh(geo, mat);
    mm.position.set(x, y, z);
    mm.castShadow = true;
    group.add(mm);
    return mm;
  };

  // pivots kept identical to the original rig so animation reads the same;
  // geometry is now merged detail instead of a single flat box
  const legL = mesh(g.leg, m.coat, -0.12, 0.86, 0);
  const legR = mesh(g.leg, m.coat, 0.12, 0.86, 0);
  const torso = mesh(g.torso, m.accent, 0, 1.16, 0);
  const armL = mesh(g.arm, m.coat, -0.29, 1.44, 0);
  const armR = mesh(g.arm, m.coat, 0.29, 1.44, 0);
  const head = mesh(g.head, m.skin, 0, 1.58, 0);

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
  const tgt = zeroTarget();
  const cur = zeroTarget();

  const api = {
    group,
    height: 1.78 * scale,
    role,
    parts: { head, torso, armL, armR, legL, legR },

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
      stridePhase += dt * (1.6 + gait * 6.0);

      for (const k of TARGET_KEYS) tgt[k] = 0;
      applyClip(anim, { t, phase: stridePhase, gait, awareness: 0, role, seedPhase }, tgt);

      // exponential smoothing so clip changes (and alert transitions) blend
      const kf = 1 - Math.exp(-11 * dt);
      for (const k of TARGET_KEYS) cur[k] += (tgt[k] - cur[k]) * kf;

      legL.rotation.x = cur.legLx;
      legR.rotation.x = cur.legRx;
      armL.rotation.x = cur.armLx;
      armL.rotation.z = cur.armLz;
      armR.rotation.x = cur.armRx;
      armR.rotation.z = cur.armRz;
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
    set.leg.dispose();
    set.arm.dispose();
    set.torso.dispose();
    set.head.dispose();
  }
  for (const k of Object.keys(GEO)) delete GEO[k];
  for (const m of Object.values(MAT ?? {})) m.dispose();
  for (const set of PALETTES.values()) {
    set.coat.dispose();
    set.accent.dispose();
  }
  PALETTES.clear();
  MAT = null;
}
