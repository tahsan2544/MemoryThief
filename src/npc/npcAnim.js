/**
 * NPC animation library (Phase 8).
 *
 * Procedural, code-driven poses — no clips, no skeleton, no assets. Every
 * bystander is a handful of pivoted meshes (torso / head / two arms / two
 * legs); a "clip" here is just a function that writes *target* angles for
 * those pivots for one frame. The rig smooths its current pose toward the
 * targets, so switching clips (walking -> searching, idle -> talking) blends
 * instead of snapping.
 *
 * Clips read one shared context:
 *   t          elapsed seconds      phase  stride phase (radians)
 *   gait       0 idle .. 1 stride   speed  metres/second
 *   awareness  0..1 suspicion       role   civilian|vendor|guard|target
 *   seedPhase  per-figure offset so a crowd never marches in lockstep
 *
 * and write any subset of these targets:
 *   armLx/armLz, armRx/armRz, legLx, legRx, torsoX, torsoZ, headX, headY,
 *   bodyY (vertical crouch offset, metres), bob (extra vertical bob).
 *
 * The set is deliberately broad — the user asked for many kinds of motion, so
 * the city can show people walking, working, talking, searching, leaning,
 * sitting, greeting, reacting and idling in a dozen distinct ways.
 */

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const breathe = (ctx, amt = 1) => Math.sin(ctx.t * 1.7 + ctx.seedPhase) * 0.02 * amt;

/* ------------------------------------------------------------------ *
 * Locomotion
 * ------------------------------------------------------------------ */

function stride(ctx, tgt, { lean, arm, leg, bob }) {
  const s = Math.sin(ctx.phase);
  const g = clamp01(ctx.gait);
  tgt.legLx = s * leg * g;
  tgt.legRx = -s * leg * g;
  // arms swing opposite the same-side leg — the single most important tell
  // that a walk cycle reads as human rather than as a rocking toy
  tgt.armLx = -s * arm * g;
  tgt.armRx = s * arm * g;
  tgt.torsoX = lean * g;
  tgt.bob = Math.abs(Math.cos(ctx.phase)) * bob * g;
}

const CLIPS = {
  walk(ctx, tgt) {
    stride(ctx, tgt, { lean: 0.06, arm: 0.5, leg: 0.62, bob: 0.03 });
  },
  walkBrisk(ctx, tgt) {
    stride(ctx, tgt, { lean: 0.13, arm: 0.66, leg: 0.72, bob: 0.04 });
    tgt.headX = 0.05;
  },
  run(ctx, tgt) {
    stride(ctx, tgt, { lean: 0.26, arm: 0.95, leg: 0.95, bob: 0.06 });
    tgt.armLz = 0.14;
    tgt.armRz = -0.14;
  },

  /* ---------------------------------------------------------------- *
   * Idle family — nobody stands perfectly still
   * ---------------------------------------------------------------- */
  idle(ctx, tgt) {
    tgt.torsoX = breathe(ctx) * 0.6;
    tgt.armLx = 0.05 + breathe(ctx, 1.4);
    tgt.armRx = 0.05 - breathe(ctx, 1.4);
    tgt.headX = Math.sin(ctx.t * 0.42 + ctx.seedPhase) * 0.05;
    tgt.bob = breathe(ctx, 0.5);
  },
  idleShift(ctx, tgt) {
    // a slow weight shift every few seconds, with a glance the other way
    const cyc = (ctx.t * 0.16 + ctx.seedPhase / TAU) % 1;
    const shift = Math.sin(cyc * TAU);
    tgt.torsoZ = shift * 0.06;
    tgt.bodyY = -Math.abs(shift) * 0.02;
    tgt.armLx = 0.06 + breathe(ctx, 1.2);
    tgt.armRx = 0.06 - breathe(ctx, 1.2);
    tgt.headY = Math.sin(cyc * TAU * 0.5) * 0.4;
    tgt.legLx = 0.02;
  },
  idleDevice(ctx, tgt) {
    // head down, both forearms up, thumbs working — someone on their phone
    tgt.torsoX = 0.08;
    tgt.headX = 0.42;
    tgt.armLx = -0.85;
    tgt.armRx = -0.85;
    tgt.armLz = 0.3;
    tgt.armRz = -0.3;
    tgt.bob = breathe(ctx, 0.6);
  },
  armsCrossed(ctx, tgt) {
    tgt.armLx = -0.95;
    tgt.armRx = -0.95;
    tgt.armLz = 0.55;
    tgt.armRz = -0.55;
    tgt.torsoX = -0.03;
    tgt.headX = Math.sin(ctx.t * 0.5 + ctx.seedPhase) * 0.04;
    tgt.bodyY = -0.01;
  },
  standAttention(ctx, tgt) {
    // a posted guard: chest out, chin up, almost motionless
    tgt.torsoX = -0.06;
    tgt.armLz = 0.09;
    tgt.armRz = -0.09;
    tgt.armLx = 0.02;
    tgt.armRx = 0.02;
    tgt.headX = -0.04;
    tgt.bob = breathe(ctx, 0.35);
  },
  lean(ctx, tgt) {
    // resting against a wall/kerb: weight on one hip, torso canted
    tgt.torsoZ = 0.1;
    tgt.bodyY = -0.04;
    tgt.legLx = -0.18;
    tgt.legRx = 0.06;
    tgt.armLx = 0.12;
    tgt.armRx = -0.2;
    tgt.headY = Math.sin(ctx.t * 0.3 + ctx.seedPhase) * 0.2;
  },
  sit(ctx, tgt) {
    // perched on a crate/stall edge
    tgt.bodyY = -0.32;
    tgt.legLx = -1.25;
    tgt.legRx = -1.2;
    tgt.torsoX = 0.08;
    tgt.armLx = -0.4;
    tgt.armRx = -0.35;
    tgt.headX = Math.sin(ctx.t * 0.4 + ctx.seedPhase) * 0.05;
    tgt.bob = breathe(ctx, 0.4);
  },
  carry(ctx, tgt) {
    // both arms out in front, holding something heavy; hurried small steps
    tgt.armLx = -0.7;
    tgt.armRx = -0.7;
    tgt.armLz = 0.22;
    tgt.armRz = -0.22;
    tgt.torsoX = 0.14;
    tgt.bob = Math.abs(Math.sin(ctx.phase)) * 0.02;
  },

  /* ---------------------------------------------------------------- *
   * Gesture family — talking, greeting, hailing
   * ---------------------------------------------------------------- */
  talk(ctx, tgt) {
    // conversational: weight on one foot, hands punctuating the sentence
    const g = Math.sin(ctx.t * 2.3 + ctx.seedPhase);
    const g2 = Math.sin(ctx.t * 1.6 + ctx.seedPhase + 1.1);
    tgt.torsoZ = 0.04 * g2;
    tgt.armRx = -0.5 + g * 0.3;
    tgt.armRz = -0.2 + g2 * 0.15;
    tgt.armLx = 0.08;
    tgt.headY = g2 * 0.14;
    tgt.headX = 0.04 + g * 0.03;
    tgt.bodyY = -0.01;
  },
  point(ctx, tgt) {
    const g = Math.sin(ctx.t * 1.3 + ctx.seedPhase);
    tgt.armRx = -1.35 + g * 0.1;
    tgt.armRz = -0.15;
    tgt.torsoZ = -0.05;
    tgt.headY = -0.1;
    tgt.armLx = 0.06;
  },
  wave(ctx, tgt) {
    const g = Math.sin(ctx.t * 5.5 + ctx.seedPhase);
    tgt.armRx = -1.9;
    tgt.armRz = -0.3 + g * 0.4;
    tgt.headY = 0.08;
    tgt.torsoZ = 0.03;
  },
  vendorHail(ctx, tgt) {
    // calling across the market: big open arms, bouncing on the spot
    const g = Math.sin(ctx.t * 3.4 + ctx.seedPhase);
    tgt.armLx = -1.1 + g * 0.35;
    tgt.armRx = -1.1 - g * 0.35;
    tgt.armLz = 0.35;
    tgt.armRz = -0.35;
    tgt.torsoX = 0.08;
    tgt.headX = -0.1;
    tgt.bob = Math.abs(g) * 0.03;
    tgt.bodyY = -0.02;
  },
  checkDevice(ctx, tgt) {
    // reading a scanner/terminal held at chest height
    tgt.armLx = -1.0;
    tgt.armRx = -1.0;
    tgt.armLz = 0.34;
    tgt.armRz = -0.34;
    tgt.headX = 0.3;
    tgt.torsoX = 0.05;
    tgt.bob = breathe(ctx, 0.5);
  },

  /* ---------------------------------------------------------------- *
   * Alert family — hunting the player
   * ---------------------------------------------------------------- */
  searchSweep(ctx, tgt) {
    // hand shielding the eyes, scanning side to side (body yaw comes from
    // the agent's own scan logic)
    const g = Math.sin(ctx.t * 2.1 + ctx.seedPhase);
    tgt.armRx = -1.5;
    tgt.armRz = -0.5;
    tgt.headX = -0.18 + g * 0.05;
    tgt.torsoX = 0.05;
    tgt.armLx = 0.1;
    tgt.bodyY = -0.02;
  },
  investigateCautious(ctx, tgt) {
    // hurrying toward a lead: quick short stride, head on a swivel, one arm
    // out ready
    stride(ctx, tgt, { lean: 0.18, arm: 0.55, leg: 0.7, bob: 0.045 });
    tgt.armRx = -0.5;
    tgt.armRz = -0.2;
    const g = Math.sin(ctx.t * 3.1 + ctx.seedPhase);
    tgt.headY = g * 0.35;
    tgt.headX = 0.08;
  },
  startle(ctx, tgt) {
    // recoil: arms up, weight back
    const k = clamp01(ctx.recoil ?? 1);
    tgt.armLx = -1.2 * k;
    tgt.armRx = -1.2 * k;
    tgt.armLz = 0.3 * k;
    tgt.armRz = -0.3 * k;
    tgt.torsoX = -0.18 * k;
    tgt.headX = -0.15 * k;
    tgt.bodyY = -0.06 * k;
  },
};

export const NPC_CLIP_NAMES = Object.keys(CLIPS);

/**
 * Resolve the best clip for an agent from its role + AI mode + awareness.
 * This is where "many animations" becomes "the right animation", so the city
 * reads as inhabited rather than as a crowd of identical walkers.
 */
export function clipFor({ role, mode, moving, awareness }) {
  const alert = awareness >= 0.35;
  if (mode === 'search') return 'searchSweep';
  if (mode === 'investigate') return alert ? 'investigateCautious' : 'walkBrisk';
  if (mode === 'return') return 'walkBrisk';

  if (moving) {
    if (role === 'guard') return 'walkBrisk';
    if (role === 'vendor') return 'carry';
    return 'walk';
  }

  // standing still: role decides what "waiting" looks like
  if (alert) return role === 'guard' ? 'standAttention' : 'idleShift';
  switch (role) {
    case 'guard':
      return 'standAttention';
    case 'vendor':
      return 'vendorHail';
    case 'target':
      return 'idleDevice'; // the mark is always checking something
    default:
      return 'idleShift';
  }
}

/** Apply one clip's targets for this frame (unknown names fall back to idle). */
export function applyClip(name, ctx, tgt) {
  (CLIPS[name] ?? CLIPS.idle)(ctx, tgt);
}
