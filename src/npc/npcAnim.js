/**
 * NPC animation library.
 *
 * Procedural, code-driven poses — no clips, no skeleton, no assets. Every
 * bystander is ten pivoted meshes (torso / head / two upper arms / two
 * forearms / two thighs / two shins); a "clip" here is just a function that
 * writes *target* angles for those pivots for one frame. The rig smooths its
 * current pose toward the targets, so switching clips (walking -> searching,
 * idle -> talking) blends instead of snapping.
 *
 * Clips read one shared context:
 *   t          elapsed seconds      phase  stride phase (radians)
 *   gait       0 idle .. 1 stride   role   civilian|vendor|guard|target|...
 *   awareness  0..1 suspicion       seedPhase  per-figure phase offset
 *   seed       figure id (for variant picks)
 *   style      seeded per-figure gait signature:
 *                arm/leg/bob/lean multipliers, tempo, resting elbow bend
 *
 * and write any subset of these targets:
 *   armLx/armLz, armRx/armRz, legLx, legRx,           shoulders + hips
 *   kneeLx/kneeRx, elbowLx/elbowRx,                   joint bends (below)
 *   torsoX, torsoZ, headX, headY, bodyY, bob.
 *
 * JOINT SEMANTICS: kneeLx/kneeRx are ABSOLUTE bends (positive folds the shin
 * backwards); elbowLx/elbowRx are absolute forward folds. A clip that stays
 * silent on them (leaves them null) hands the joint to the rig's gait
 * solver, which derives knees/elbows from the stride itself — so every
 * walking figure gets real joint motion for free, and bespoke poses can
 * override any of them exactly.
 *
 * GAIT STYLE: the shared `stride()` helper multiplies every amplitude by
 * ctx.style, so two figures running the same 'walk' clip still stride with
 * different arm swing, step length, bounce and tempo — the crowd's walk is
 * per-person, not per-clip.
 *
 * The set is deliberately broad — the city shows people walking, working,
 * greeting, searching, reading, counting and idling in a dozen distinct
 * ways, and the four memory-source archetypes each own a clip nobody else
 * plays.
 */

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const breathe = (ctx, amt = 1) => Math.sin(ctx.t * 1.7 + ctx.seedPhase) * 0.02 * amt;
const styleOf = (ctx) => ctx.style ?? null;

/* ------------------------------------------------------------------ *
 * Locomotion
 * ------------------------------------------------------------------ */

function stride(ctx, tgt, { lean, arm, leg, bob }) {
  const st = styleOf(ctx);
  const A = st ? st.arm : 1;
  const L = st ? st.leg : 1;
  const B = st ? st.bob : 1;
  const N = st ? st.lean : 1;
  const s = Math.sin(ctx.phase);
  const g = clamp01(ctx.gait);
  tgt.legLx = s * leg * L * g;
  tgt.legRx = -s * leg * L * g;
  // arms swing opposite the same-side leg — the single most important tell
  // that a walk cycle reads as human rather than as a rocking toy
  tgt.armLx = -s * arm * A * g;
  tgt.armRx = s * arm * A * g;
  tgt.torsoX = lean * N * g;
  tgt.bob = Math.abs(Math.cos(ctx.phase)) * bob * B * g;
}

const CLIPS = {
  walk(ctx, tgt) {
    stride(ctx, tgt, { lean: 0.06, arm: 0.5, leg: 0.62, bob: 0.03 });
  },
  walkGuard(ctx, tgt) {
    // the march: chin up, measured steps, arms nearly rigid at the sides
    stride(ctx, tgt, { lean: 0.01, arm: 0.3, leg: 0.7, bob: 0.05 });
    tgt.armLz = 0.08;
    tgt.armRz = -0.08;
    tgt.elbowLx = 0.05;
    tgt.elbowRx = 0.05;
    tgt.headX = -0.03;
  },
  walkBrisk(ctx, tgt) {
    stride(ctx, tgt, { lean: 0.13, arm: 0.66, leg: 0.72, bob: 0.04 });
    tgt.headX = 0.05;
    // elbows left to the gait solver so the arm curls through the swing
  },
  run(ctx, tgt) {
    stride(ctx, tgt, { lean: 0.26, arm: 0.95, leg: 0.95, bob: 0.06 });
    tgt.armLz = 0.14;
    tgt.armRz = -0.14;
    tgt.elbowLx = 1.0;
    tgt.elbowRx = 1.0;
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
    // head down, phone up, thumbs working
    tgt.torsoX = 0.08;
    tgt.headX = 0.42;
    tgt.armLx = -0.3;
    tgt.armRx = -0.3;
    tgt.armLz = 0.28;
    tgt.armRz = -0.28;
    tgt.elbowLx = 1.3;
    tgt.elbowRx = 1.35;
    tgt.bob = breathe(ctx, 0.6);
  },
  idleStretch(ctx, tgt) {
    // arms wide, chest open, looking up at the rain
    const k = 0.5 + 0.5 * Math.sin(ctx.t * 0.9 + ctx.seedPhase);
    tgt.armLz = -(0.85 + 0.35 * k); // negative z = outward on the left arm
    tgt.armRz = 0.85 + 0.35 * k;
    tgt.armLx = -0.12;
    tgt.armRx = -0.12;
    tgt.elbowLx = 0.18;
    tgt.elbowRx = 0.18;
    tgt.torsoX = -0.08;
    tgt.headX = -0.16;
    tgt.bodyY = -0.015 * k;
    tgt.bob = breathe(ctx, 0.4);
  },
  armsCrossed(ctx, tgt) {
    tgt.armLx = -0.7;
    tgt.armRx = -0.7;
    tgt.armLz = 0.5;
    tgt.armRz = -0.5;
    tgt.elbowLx = 1.35;
    tgt.elbowRx = 1.35;
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
    tgt.elbowLx = 0.05;
    tgt.elbowRx = 0.05;
    tgt.headX = -0.04;
    tgt.bob = breathe(ctx, 0.35);
  },
  guardScan(ctx, tgt) {
    // hand on hip, slow double-take across the street
    const sweep = Math.sin(ctx.t * 0.55 + ctx.seedPhase);
    tgt.headY = sweep * 0.5;
    tgt.armRx = -0.35;
    tgt.armRz = -0.3;
    tgt.elbowRx = 1.05;
    tgt.armLx = 0.06;
    tgt.armLz = 0.1;
    tgt.elbowLx = 0.12;
    tgt.torsoZ = -0.04 + sweep * 0.03;
    tgt.headX = 0.05;
    tgt.bob = breathe(ctx, 0.4);
  },
  lean(ctx, tgt) {
    // resting against a wall/kerb: weight on one hip, torso canted
    tgt.torsoZ = 0.1;
    tgt.bodyY = -0.04;
    tgt.legLx = -0.18;
    tgt.legRx = 0.06;
    tgt.armLx = 0.12;
    tgt.armRx = -0.2;
    tgt.elbowLx = 0.25;
    tgt.elbowRx = 0.4;
    tgt.headY = Math.sin(ctx.t * 0.3 + ctx.seedPhase) * 0.2;
  },
  sit(ctx, tgt) {
    // perched on a crate/stall edge — joints pose absolutely here
    tgt.bodyY = -0.32;
    tgt.legLx = -1.25;
    tgt.legRx = -1.2;
    tgt.kneeLx = 1.15;
    tgt.kneeRx = 1.05;
    tgt.torsoX = 0.08;
    tgt.armLx = -0.4;
    tgt.armRx = -0.35;
    tgt.elbowLx = 0.5;
    tgt.elbowRx = 0.45;
    tgt.headX = Math.sin(ctx.t * 0.4 + ctx.seedPhase) * 0.05;
    tgt.bob = breathe(ctx, 0.4);
  },
  carry(ctx, tgt) {
    // both arms wrapped around a load; hurried small steps
    tgt.armLx = -0.55;
    tgt.armRx = -0.55;
    tgt.armLz = 0.22;
    tgt.armRz = -0.22;
    tgt.elbowLx = 0.85;
    tgt.elbowRx = 0.82;
    tgt.torsoX = 0.14;
    tgt.bob = Math.abs(Math.sin(ctx.phase)) * 0.02;
  },
  vendorWipe(ctx, tgt) {
    // wiping hands on the apron between customers
    const g = Math.sin(ctx.t * 3.1 + ctx.seedPhase);
    tgt.armLx = -0.42 + g * 0.06;
    tgt.armRx = -0.42 - g * 0.06;
    tgt.elbowLx = 0.95 + g * 0.18;
    tgt.elbowRx = 0.95 - g * 0.18;
    tgt.armLz = 0.2;
    tgt.armRz = -0.2;
    tgt.torsoX = 0.06;
    tgt.headX = 0.14;
    tgt.bob = breathe(ctx, 0.5);
  },

  /* ---------------------------------------------------------------- *
   * Gesture family — talking, greeting, hailing
   * ---------------------------------------------------------------- */
  talk(ctx, tgt) {
    // conversational: weight on one foot, hands punctuating the sentence
    const g = Math.sin(ctx.t * 2.3 + ctx.seedPhase);
    const g2 = Math.sin(ctx.t * 1.6 + ctx.seedPhase + 1.1);
    tgt.torsoZ = 0.04 * g2;
    tgt.armRx = -0.35 + g * 0.22;
    tgt.armRz = -0.2 + g2 * 0.15;
    tgt.elbowRx = 0.95 + g * 0.35;
    tgt.armLx = 0.08;
    tgt.elbowLx = 0.35;
    tgt.headY = g2 * 0.14;
    tgt.headX = 0.04 + g * 0.03;
    tgt.bodyY = -0.01;
  },
  point(ctx, tgt) {
    const g = Math.sin(ctx.t * 1.3 + ctx.seedPhase);
    tgt.armRx = -1.35 + g * 0.1;
    tgt.armRz = -0.15;
    tgt.elbowRx = 0.08;
    tgt.elbowLx = 0.3;
    tgt.torsoZ = -0.05;
    tgt.headY = -0.1;
    tgt.armLx = 0.06;
  },
  wave(ctx, tgt) {
    const g = Math.sin(ctx.t * 5.5 + ctx.seedPhase);
    tgt.armRx = -1.6;
    tgt.armRz = -0.3 + g * 0.4;
    tgt.elbowRx = 0.35;
    tgt.headY = 0.08;
    tgt.torsoZ = 0.03;
  },
  vendorHail(ctx, tgt) {
    // calling across the market: big open arms, bouncing on the spot
    const g = Math.sin(ctx.t * 3.4 + ctx.seedPhase);
    tgt.armLx = -1.0 + g * 0.35;
    tgt.armRx = -1.0 - g * 0.35;
    tgt.armLz = 0.35;
    tgt.armRz = -0.35;
    tgt.elbowLx = 0.45 + g * 0.15;
    tgt.elbowRx = 0.45 - g * 0.15;
    tgt.torsoX = 0.08;
    tgt.headX = -0.1;
    tgt.bob = Math.abs(g) * 0.03;
    tgt.bodyY = -0.02;
  },
  checkDevice(ctx, tgt) {
    // reading a scanner/terminal held at chest height
    tgt.armLx = -0.55;
    tgt.armRx = -0.55;
    tgt.armLz = 0.3;
    tgt.armRz = -0.3;
    tgt.elbowLx = 1.15;
    tgt.elbowRx = 1.1;
    tgt.headX = 0.3;
    tgt.torsoX = 0.05;
    tgt.bob = breathe(ctx, 0.5);
  },

  /* ---------------------------------------------------------------- *
   * Memory-source archetypes — four clips nobody else plays
   * ---------------------------------------------------------------- */
  attendantBoard(ctx, tgt) {
    // the station attendant reads the departure board: chin up, hand to cap
    const t = ctx.t + ctx.seedPhase;
    tgt.headX = -0.16 + Math.sin(t * 0.35) * 0.07;
    tgt.headY = Math.sin(t * 0.4) * 0.22;
    tgt.armRx = -0.3;
    tgt.armRz = -0.18;
    tgt.elbowRx = 1.45; // fingers to the cap brim
    tgt.armLx = 0.05;
    tgt.elbowLx = 0.18;
    tgt.torsoX = -0.03;
    tgt.bodyY = -0.012;
    tgt.bob = breathe(ctx, 0.4);
  },
  traderCount(ctx, tgt) {
    // the market trader counts coins into a palm
    const t = ctx.t + ctx.seedPhase;
    const g = Math.sin(t * 2.4);
    tgt.armLx = -0.5;
    tgt.armLz = 0.24;
    tgt.elbowLx = 1.2; // open palm waiting
    tgt.armRx = -0.55 + g * 0.05;
    tgt.armRz = -0.26;
    tgt.elbowRx = 1.3 + g * 0.12; // counting thumb working
    tgt.headX = 0.3;
    tgt.headY = -0.06 + g * 0.03;
    tgt.torsoX = 0.05;
    tgt.bodyY = -0.015;
    tgt.bob = breathe(ctx, 0.5);
  },
  wardenKeys(ctx, tgt) {
    // the underarchive warden weighs a key ring and scans the stacks
    const t = ctx.t + ctx.seedPhase;
    const j = Math.sin(t * 6.2);
    tgt.armLx = -0.18;
    tgt.armLz = 0.14;
    tgt.elbowLx = 0.9 + j * 0.1; // hand at the hip ring, jingling
    tgt.armRx = 0.05;
    tgt.elbowRx = 0.22;
    tgt.headY = Math.sin(t * 0.33) * 0.4;
    tgt.headX = 0.06;
    tgt.torsoZ = 0.04 * Math.sin(t * 0.21);
    tgt.bodyY = -0.01;
    tgt.bob = breathe(ctx, 0.4);
  },
  clerkGaze(ctx, tgt) {
    // the night clerk: hands clasped, an occasional polite nod
    const t = ctx.t + ctx.seedPhase;
    const greet = Math.sin(t * 0.5 + ctx.seedPhase * 0.7);
    const k = greet > 0.82 ? (greet - 0.82) * 5.5 : 0;
    tgt.armLx = -0.4;
    tgt.armRx = -0.4;
    tgt.armLz = 0.18;
    tgt.armRz = -0.18;
    tgt.elbowLx = 1.05;
    tgt.elbowRx = 1.05;
    tgt.headX = 0.05 + k * 0.18;
    tgt.headY = Math.sin(t * 0.3) * 0.12;
    tgt.torsoX = -0.02;
    tgt.bodyY = -0.008 + Math.sin(t * 0.18) * 0.006;
    tgt.bob = breathe(ctx, 0.4);
  },

  /* ---------------------------------------------------------------- *
   * Alert family — hunting the player
   * ---------------------------------------------------------------- */
  searchSweep(ctx, tgt) {
    // hand shielding the eyes, scanning side to side (body yaw comes from
    // the agent's own scan logic)
    const g = Math.sin(ctx.t * 2.1 + ctx.seedPhase);
    tgt.armRx = -1.1;
    tgt.armRz = -0.4;
    tgt.elbowRx = 1.35; // forearm braced across the brow
    tgt.headX = -0.18 + g * 0.05;
    tgt.torsoX = 0.05;
    tgt.armLx = 0.1;
    tgt.elbowLx = 0.2;
    tgt.bodyY = -0.02;
  },
  investigateCautious(ctx, tgt) {
    // hurrying toward a lead: quick short stride, head on a swivel, one arm
    // out ready
    stride(ctx, tgt, { lean: 0.18, arm: 0.55, leg: 0.7, bob: 0.045 });
    tgt.armRx = -0.5;
    tgt.armRz = -0.2;
    tgt.elbowRx = 0.4;
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
    tgt.elbowLx = 0.4 * k;
    tgt.elbowRx = 0.4 * k;
    tgt.torsoX = -0.18 * k;
    tgt.headX = -0.15 * k;
    tgt.bodyY = -0.06 * k;
  },
};

export const NPC_CLIP_NAMES = Object.keys(CLIPS);

/**
 * Per-role pools of pause idles. clipFor picks with the figure's own seed,
 * so half the civilians lean while the other half scroll their phones and
 * the crowd never repeats one idle in lockstep.
 */
const IDLE_POOLS = {
  guard: ['standAttention', 'armsCrossed', 'guardScan', 'standAttention'],
  vendor: ['vendorHail', 'idleShift', 'vendorWipe'],
  target: ['idleDevice', 'checkDevice', 'idleShift', 'checkDevice'],
  civilian: ['idleShift', 'idleDevice', 'lean', 'idleStretch'],
};

/**
 * Resolve the best clip for an agent from its role + AI mode + awareness.
 * This is where "many animations" becomes "the right animation", so the city
 * reads as inhabited rather than as a crowd of identical walkers.
 * `seed` selects the pause-idle variant so each figure keeps its own habit.
 */
export function clipFor({ role, mode, moving, awareness, seed = 0 }) {
  const alert = awareness >= 0.35;
  if (mode === 'search') return 'searchSweep';
  if (mode === 'investigate') return alert ? 'investigateCautious' : 'walkBrisk';
  if (mode === 'return') return 'walkBrisk';

  if (moving) {
    // four roles, four distinct gaits — guard march / vendor carry /
    // courier brisk / civilian stroll (further differentiated per figure
    // by the rig's seeded gait style)
    if (role === 'guard') return 'walkGuard';
    if (role === 'vendor') return 'carry';
    if (role === 'target') return 'walkBrisk';
    return 'walk';
  }

  // standing still: role decides what "waiting" looks like, the figure's
  // seed decides which of that role's habits it performs
  if (alert) return role === 'guard' ? 'standAttention' : 'idleShift';
  const pool = IDLE_POOLS[role];
  if (pool) {
    const i = (((seed | 0) % pool.length) + pool.length) % pool.length;
    return pool[i];
  }
  return 'idleShift';
}

/** Apply one clip's targets for this frame (unknown names fall back to idle). */
export function applyClip(name, ctx, tgt) {
  (CLIPS[name] ?? CLIPS.idle)(ctx, tgt);
}
