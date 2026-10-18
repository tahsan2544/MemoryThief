import * as THREE from 'three';
import { MeshBuilder, rgb } from '../utils/geo.js';

/**
 * RIVEN VALE — the playable character, built entirely from procedural
 * geometry so the project stays asset-free.
 *
 * Silhouette brief: a practical dark coat over layered technical wear, a
 * thigh pouch and a back recorder, a hooded head with a thin visor, and the
 * signature memory-extraction glove on the LEFT hand (violet emitter + a real
 * point light so it spills onto wet ground).
 *
 * The rig is ARTICULATED: every limb is two segments joined by a real pivot
 * (knee at mid-leg, elbow at mid-arm). That is what makes the walk read as a
 * person rather than a rocking board — the animator can bend the knee while
 * the thigh swings, fold the elbow while the arm pumps, and plant the foot.
 *
 *   root ─ hips ─ legL ─ kneeL ─ (shin + boot)
 *               │      └ legR ─ kneeR
 *               └ torso ─ head (+visor glow)
 *                      └ armL ─ elbowL ─ (forearm + glove + glove light)
 *                      │      └ armR ─ elbowR ─ hand
 *                      └ coatL / coatR
 *
 * NOTE on MeshBuilder: `box({ y })` is the *bottom* of the box, `x`/`z` are
 * the centre — every offset below is written with that in mind.
 *
 * Replace path: swap this module for a GLTF loader and expose the same
 * `{ group, parts, height, dispose }` shape — the animator only reads the
 * pivots in `parts`.
 */

const COAT = 0x181b27;
const COAT_LIT = 0x232839;
const TRIM = 0x2f3448;
const TROUSER = 0x12141c;
const BOOT = 0x0c0e13;
const STRAP = 0x3b4156;
const METAL = 0x646c84;
const GLOVE = 0x232739;

const VIOLET = rgb(0x9a7bff);
const AMBER = rgb(0xffa640);

let sharedMaterials = null;

function getMaterials() {
  if (!sharedMaterials) {
    sharedMaterials = {
      solid: new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.7,
        metalness: 0.14,
        envMapIntensity: 0.7,
      }),
      glow: new THREE.MeshBasicMaterial({
        vertexColors: true,
        toneMapped: false,
        fog: true,
      }),
    };
  }
  return sharedMaterials;
}

function meshFrom(builder, material, name) {
  const geo = builder.build();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.castShadow = material === getMaterials().solid;
  mesh.receiveShadow = true;
  return mesh;
}

/** One merged vertex-coloured solid geometry from a callback. */
function part(name, fn) {
  const b = new MeshBuilder();
  fn(b);
  return b.isEmpty ? null : meshFrom(b, getMaterials().solid, name);
}

/** Same, but for the unlit glow material. */
function glowPart(name, fn) {
  const b = new MeshBuilder();
  fn(b);
  return b.isEmpty ? null : meshFrom(b, getMaterials().glow, name);
}

export function createRivenVale() {
  const mats = getMaterials();

  const group = new THREE.Group();
  group.name = 'riven-vale';

  const hips = new THREE.Group();
  hips.name = 'hips';
  group.add(hips);

  /* ------------------------------- legs -------------------------------- */
  // thigh (hip pivot) ─ knee pivot ─ shin + boot. Boot sole lands exactly on
  // y = 0 when the knee is straight: 0.92 hip − 0.44 thigh − 0.48 lower leg.

  function buildLeg(side) {
    const g = new THREE.Group();
    g.name = `leg${side}`;

    const thigh = part(`leg${side}-thigh`, (b) => {
      b.box({ x: 0, y: -0.47, z: 0, w: 0.2, h: 0.46, d: 0.23, color: TROUSER }); // thigh
      b.box({ x: 0, y: -0.3, z: 0.09, w: 0.17, h: 0.16, d: 0.07, color: TRIM }); // knee pad
      b.box({ x: 0, y: -0.12, z: 0, w: 0.205, h: 0.05, d: 0.235, color: STRAP }); // thigh strap
    });
    if (thigh) g.add(thigh);

    const knee = new THREE.Group();
    knee.name = `knee${side}`;
    knee.position.set(0, -0.44, 0);
    g.add(knee);

    const shin = part(`leg${side}-shin`, (b) => {
      b.box({ x: 0, y: -0.32, z: 0, w: 0.165, h: 0.33, d: 0.2, color: TROUSER }); // shin
      b.box({ x: 0, y: -0.2, z: -0.015, w: 0.17, h: 0.15, d: 0.21, color: TROUSER }); // calf
      b.box({ x: 0, y: -0.4, z: 0, w: 0.175, h: 0.09, d: 0.205, color: TRIM }); // boot cuff
      b.box({ x: 0, y: -0.47, z: 0.05, w: 0.185, h: 0.08, d: 0.31, color: BOOT }); // boot
      b.box({ x: 0, y: -0.48, z: 0.05, w: 0.19, h: 0.02, d: 0.32, color: BOOT }); // sole
    });
    if (shin) knee.add(shin);

    return { g, knee };
  }

  const legLs = buildLeg('L');
  const legRs = buildLeg('R');
  const legL = legLs.g;
  const legR = legRs.g;
  legL.position.set(0.11, 0.92, 0);
  legR.position.set(-0.11, 0.92, 0);
  hips.add(legL, legR);

  // thigh pouch rides the right thigh
  const pouch = part('thigh-pouch', (b) => {
    b.box({ x: 0.1, y: -0.51, z: 0, w: 0.14, h: 0.22, d: 0.12, color: STRAP });
    b.box({ x: 0.1, y: -0.305, z: 0, w: 0.15, h: 0.05, d: 0.13, color: METAL });
  });
  if (pouch) legR.add(pouch);

  /* ------------------------------- torso ------------------------------- */

  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.set(0, 0.95, 0);
  hips.add(torso);

  const body = part('torso-mesh', (b) => {
    // pelvis + tapered ribcage under the coat, so the waist reads narrower
    // than the chest instead of one slab
    b.box({ x: 0, y: -0.08, z: 0, w: 0.4, h: 0.18, d: 0.27, color: TROUSER });
    b.box({ x: 0, y: 0.06, z: 0, w: 0.42, h: 0.2, d: 0.29, color: TROUSER });
    b.box({ x: 0, y: 0.22, z: 0, w: 0.46, h: 0.24, d: 0.31, color: TROUSER });
    // coat shell over it
    b.box({ x: 0, y: -0.01, z: 0, w: 0.53, h: 0.5, d: 0.36, color: COAT });
    // shoulders
    b.box({ x: 0, y: 0.43, z: 0, w: 0.57, h: 0.14, d: 0.34, color: COAT_LIT });
    // collar behind the neck
    b.box({ x: 0, y: 0.51, z: -0.02, w: 0.3, h: 0.1, d: 0.3, color: COAT_LIT });
    // neck
    b.cylinder({ x: 0, y: 0.5, z: 0, rBottom: 0.075, rTop: 0.07, height: 0.12, segments: 8, color: TROUSER });
    // belt at the waist + buckle
    b.box({ x: 0, y: 0.02, z: 0, w: 0.5, h: 0.11, d: 0.35, color: STRAP });
    b.box({ x: 0, y: 0.035, z: 0.18, w: 0.11, h: 0.08, d: 0.03, color: METAL });
    // chest straps
    b.box({ x: 0.1, y: 0.315, z: 0.185, w: 0.13, h: 0.09, d: 0.03, color: STRAP });
    b.box({ x: -0.12, y: 0.13, z: 0.185, w: 0.1, h: 0.14, d: 0.03, color: STRAP });
    b.box({ x: 0, y: 0.41, z: 0.175, w: 0.5, h: 0.06, d: 0.03, color: STRAP });
    // shoulder straps running over the collar bones
    b.box({ x: 0.15, y: 0.44, z: 0.1, w: 0.06, h: 0.05, d: 0.13, color: STRAP });
    b.box({ x: -0.15, y: 0.44, z: 0.1, w: 0.06, h: 0.05, d: 0.13, color: STRAP });
    // back recorder unit
    b.box({ x: 0, y: 0.11, z: -0.2, w: 0.26, h: 0.32, d: 0.1, color: TRIM });
    b.box({ x: 0, y: 0.41, z: -0.2, w: 0.2, h: 0.06, d: 0.12, color: METAL });
  });
  if (body) torso.add(body);

  const torsoGlow = glowPart('torso-glow', (b) => {
    b.box({ x: 0, y: 0.04, z: 0.19, w: 0.11, h: 0.07, d: 0.02, color: AMBER.map((v) => v * 1.6) });
    b.box({ x: 0.07, y: 0.27, z: -0.255, w: 0.06, h: 0.06, d: 0.02, color: VIOLET.map((v) => v * 1.7) });
  });
  if (torsoGlow) torso.add(torsoGlow);

  /* -------------------------------- head -------------------------------- */

  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.58, 0);
  torso.add(head);

  const headMesh = part('head-mesh', (b) => {
    b.cylinder({ x: 0, y: -0.025, z: 0, rBottom: 0.075, rTop: 0.075, height: 0.09, segments: 8, color: TROUSER });
    b.box({ x: 0, y: 0.055, z: 0.01, w: 0.21, h: 0.25, d: 0.23, color: GLOVE }); // face shell
    b.box({ x: 0, y: -0.005, z: 0.055, w: 0.15, h: 0.06, d: 0.15, color: TRIM }); // jaw
    b.box({ x: 0, y: 0.03, z: 0.125, w: 0.1, h: 0.07, d: 0.05, color: TRIM }); // respirator
    b.box({ x: 0, y: 0.07, z: -0.05, w: 0.25, h: 0.26, d: 0.24, color: COAT }); // hood
    b.box({ x: 0, y: 0.1, z: -0.16, w: 0.15, h: 0.11, d: 0.1, color: COAT }); // hood point
    b.box({ x: 0, y: 0.28, z: 0.06, w: 0.24, h: 0.06, d: 0.17, color: COAT_LIT }); // brim
    b.box({ x: 0.11, y: 0.06, z: -0.06, w: 0.03, h: 0.2, d: 0.2, color: TRIM }); // seam
  });
  if (headMesh) head.add(headMesh);

  const visor = glowPart('visor', (b) => {
    b.box({ x: 0, y: 0.16, z: 0.13, w: 0.17, h: 0.04, d: 0.03, color: VIOLET.map((v) => v * 1.9) });
    b.box({ x: 0, y: 0.16, z: -0.17, w: 0.05, h: 0.04, d: 0.03, color: VIOLET.map((v) => v * 1.1) });
  });
  if (visor) head.add(visor);

  /* -------------------------------- arms -------------------------------- */
  // shoulder ─ upper arm ─ elbow pivot ─ forearm (+ hand / glove)

  function buildArm(side) {
    const g = new THREE.Group();
    g.name = `arm${side}`;
    const upper = part(`arm${side}-upper`, (b) => {
      b.box({ x: 0, y: -0.05, z: 0, w: 0.2, h: 0.14, d: 0.22, color: COAT_LIT }); // shoulder pad
      b.box({ x: 0, y: -0.2, z: 0, w: 0.175, h: 0.16, d: 0.2, color: COAT }); // deltoid
      b.box({ x: 0, y: -0.34, z: 0, w: 0.15, h: 0.2, d: 0.175, color: COAT }); // upper arm
    });
    if (upper) g.add(upper);

    const elbow = new THREE.Group();
    elbow.name = `elbow${side}`;
    elbow.position.set(0, -0.33, 0);
    g.add(elbow);

    return { g, elbow };
  }

  const armLs = buildArm('L');
  const armRs = buildArm('R');
  const armL = armLs.g;
  const armR = armRs.g;
  armL.position.set(0.3, 0.47, 0);
  armR.position.set(-0.3, 0.47, 0);
  torso.add(armL, armR);

  const foreR = part('forearm-R', (b) => {
    b.box({ x: 0, y: -0.27, z: 0, w: 0.145, h: 0.26, d: 0.165, color: COAT }); // forearm
    b.box({ x: 0, y: -0.33, z: 0, w: 0.155, h: 0.09, d: 0.175, color: TRIM }); // cuff
    b.box({ x: 0, y: -0.46, z: 0.01, w: 0.135, h: 0.14, d: 0.155, color: GLOVE }); // hand
    b.box({ x: 0, y: -0.44, z: 0.09, w: 0.135, h: 0.07, d: 0.06, color: GLOVE }); // knuckles
  });
  if (foreR) armRs.elbow.add(foreR);

  // LEFT forearm: the memory-extraction glove
  const foreL = part('forearm-L-glove', (b) => {
    b.box({ x: 0, y: -0.27, z: 0, w: 0.145, h: 0.26, d: 0.165, color: COAT }); // forearm
    b.box({ x: 0, y: -0.33, z: 0, w: 0.17, h: 0.08, d: 0.185, color: METAL }); // emitter collar
    b.box({ x: 0, y: -0.2, z: 0.09, w: 0.1, h: 0.16, d: 0.05, color: TRIM }); // forearm unit
    b.box({ x: 0, y: -0.47, z: 0.01, w: 0.16, h: 0.15, d: 0.17, color: GLOVE }); // glove hand
  });
  if (foreL) armLs.elbow.add(foreL);

  const gloveGlow = glowPart('glove-glow', (b) => {
    b.box({ x: 0, y: -0.44, z: 0.1, w: 0.1, h: 0.09, d: 0.03, color: VIOLET.map((v) => v * 2.4) });
    b.box({ x: 0, y: -0.17, z: 0.12, w: 0.06, h: 0.1, d: 0.02, color: VIOLET.map((v) => v * 1.6) });
  });
  if (gloveGlow) armLs.elbow.add(gloveGlow);

  // the glove lights the ground it passes over
  const gloveLight = new THREE.PointLight(0x9a7bff, 6, 5.5, 2);
  gloveLight.position.set(0, -0.42, 0.16);
  gloveLight.name = 'glove-light';
  armLs.elbow.add(gloveLight);

  /* ------------------------------ coat tails ---------------------------- */

  function buildTail(side) {
    const g = new THREE.Group();
    g.name = `coat${side}`;
    const tail = part(`coat${side}-mesh`, (b) => {
      b.box({ x: 0, y: -0.52, z: 0.01, w: 0.25, h: 0.52, d: 0.34, color: COAT });
      b.box({ x: 0, y: -0.53, z: 0.01, w: 0.26, h: 0.06, d: 0.35, color: COAT_LIT });
    });
    if (tail) g.add(tail);
    return g;
  }

  const coatL = buildTail('L');
  const coatR = buildTail('R');
  coatL.position.set(0.135, 0.06, 0);
  coatR.position.set(-0.135, 0.06, 0);
  torso.add(coatL, coatR);

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.material === mats.solid;
      o.receiveShadow = true;
    }
  });

  return {
    group,
    height: 1.86,
    parts: {
      hips,
      torso,
      head,
      armL,
      armR,
      legL,
      legR,
      kneeL: legLs.knee,
      kneeR: legRs.knee,
      elbowL: armLs.elbow,
      elbowR: armRs.elbow,
      coatL,
      coatR,
      gloveLight,
    },
    dispose() {
      group.traverse((o) => {
        if (o.isMesh) o.geometry.dispose();
      });
    },
  };
}

/** Shared materials are module-level: only dispose them on a full teardown. */
export function disposeRivenValeMaterials() {
  sharedMaterials?.solid.dispose();
  sharedMaterials?.glow.dispose();
  sharedMaterials = null;
}
