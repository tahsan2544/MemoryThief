/**
 * Phase 4 — city agents: the people who actually walk Eidolon's streets.
 *
 * An agent is one of four roles (civilian / vendor / guard / investigation
 * target) following a hand-validated route of waypoints on the road network.
 * It keeps to the same solidity world the player uses (`moveAxis` slides it
 * off walls, `groundAt` follows kerbs) and it carries a small state machine:
 *
 *   route ──pause──► route ──► investigate ──► search ──► return ──► route
 *                        ▲            │            │
 *                        └────────────┴────────────┘  (player seen again)
 *
 * Perception deliberately runs on the WALL clock, not on simulation `dt`:
 * reaction time is a human property, not a physics one, and keeping it off
 * the frame step means the behaviour reads the same on a slow machine as on
 * a fast one. Movement stays on `dt` so walking is frame-rate independent.
 * (The headless smoke test simulates at ~1/40th speed; perception tests
 * still run at human speed because of this split.)
 *
 * Awareness 0 → 1 per agent: rising while the player is in view (closer =
 * faster), scaled up by conspicuous acts — sprinting, extracting, channeling
 * Resonance Sight, standing in a restricted zone. It caps at 0.5 unless a
 * conspicuous act is happening (loitering is not a crime) and at 0.85 for
 * civilians/vendors — only guards and targets can raise a full detection.
 * A detection turns the agent toward the last known position; losing the
 * player for a few seconds becomes a search; giving up becomes a walk home.
 */

import { createBystander } from './bystander.js';
import { clipFor } from './npcAnim.js';

export const AGENT_RADIUS = 0.32;

/** Per-role statistics. fov is the half-angle's full aperture, in radians. */
export const AGENT_TYPES = {
  civilian: { speed: 1.15, viewRadius: 9, fov: 2.2, maxAwareness: 0.85 },
  vendor: { speed: 0.95, viewRadius: 8, fov: 2.0, maxAwareness: 0.85 },
  guard: { speed: 1.3, viewRadius: 14, fov: 2.6, maxAwareness: 1 },
  target: { speed: 1.2, viewRadius: 11, fov: 2.4, maxAwareness: 1 },
};

const PALETTES = {
  civilian: [
    { coat: 0x4a5468, accent: 0x6b5a4a },
    { coat: 0x51464e, accent: 0x4f6b60 },
    { coat: 0x46505e, accent: 0x6e5f46 },
  ],
  vendor: [{ coat: 0x5b4a3f, accent: 0x8a5c33 }],
  guard: [{ coat: 0x2c3340, accent: 0xb08a2e }],
  target: [{ coat: 0x3a3348, accent: 0x8f4f9a }],
};

/* ----------------------------- helpers ---------------------------------- */

function angleDelta(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function turnToward(yaw, target, k) {
  return yaw + angleDelta(target, yaw) * Math.min(1, k);
}

/**
 * Line of sight between two ground points: sampled every ~0.8 m at chest
 * height. Buildings, walls and tall props block it; knee-high clutter does
 * not (you can see over a kerb). The shared world test is `isPointBlocked`.
 */
export function clearLine(colliders, x0, z0, x1, z1) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const d = Math.hypot(dx, dz);
  if (d < 0.5) return true;
  const steps = Math.min(24, Math.max(2, Math.ceil(d / 0.8)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (colliders.isPointBlocked(x0 + dx * t, 1.35, z0 + dz * t)) return false;
  }
  return true;
}

/* ------------------------------ the agent -------------------------------- */

export class NpcAgent {
  /**
   * @param {{id:string, type:string, name:string, seed?:number,
   *          route:{points:Array<{x:number,y:number,z:number,pause?:number}>, loop:boolean},
   *          colliders:object}} spec
   */
  constructor({ id, type, name, seed = 1, route, colliders }) {
    const T = AGENT_TYPES[type] ?? AGENT_TYPES.civilian;
    this.id = id;
    this.type = type;
    this.name = name;
    this.spec = T;
    this.route = route;
    this.colliders = colliders;

    const p0 = route.points[0];
    this.x = p0.x;
    this.y = colliders.groundAt(p0.x, p0.z, 0.3); // routes are 2D; height comes from the world
    this.z = p0.z;
    this.yaw = 0;
    this.yawBase = 0;
    this.scanPhase = seed * 0.7;

    this.routeIndex = route.points.length > 1 ? 1 : 0;
    this.dir = 1;

    // staggered spawn: some agents are already mid-stand, some already walking
    this.mode = 'pause';
    this.pauseUntil = performance.now() + (p0.pause ?? 2) * 1000 + (seed % 5) * 400;

    this.awareness = 0;
    this.visible = false;
    this.lastSeenAt = -1e9;
    this.lastKnown = { x: this.x, z: this.z };
    this.modeUntil = 0;
    this.stuckSince = 0;
    this.witnessed = false;
    this.perc = null;
    this.gaitK = 0;

    /** @type {null | ((agent, pos) => void)} fired on a full detection */
    this.onDetect = null;
    /** @type {null | ((agent, pos) => void)} fired when a bystander tips off guards */
    this.onWitness = null;

    const pals = PALETTES[type] ?? PALETTES.civilian;
    const pal = pals[seed % pals.length];
    this.rig = createBystander({ seed, coat: pal.coat, accent: pal.accent, role: this.type });
    this.rig.setPosition(this.x, this.y, this.z);
  }

  /* ---------------------------- perception ------------------------------ */

  /**
   * @param {{x:number,z:number,cover:boolean,sprinting:boolean,extracting:boolean,
   *          ability:boolean,zone:object|null, suspicious:boolean}} ctx
   */
  perceive(ctx, now, wdt) {
    const dx = ctx.x - this.x;
    const dz = ctx.z - this.z;
    const d = Math.hypot(dx, dz);

    let seen = false;
    let los = false;
    let ang = 0;
    let half = 0;
    if (d < this.spec.viewRadius && !ctx.cover) {
      // suspicion widens the cone: a watchful agent turns more of its head
      half = this.spec.fov / 2 + Math.min(0.7, this.awareness * 0.9);
      ang = d > 0.7 ? Math.abs(angleDelta(Math.atan2(dx, dz), this.yaw)) : 0;
      los = clearLine(this.colliders, this.x, this.z, ctx.x, ctx.z);
      if (ang <= half && los) {
        seen = true;
      }
    }
    // which gate failed, for tests/HUD debugging (see snapshot())
    this.perc = {
      seen,
      d,
      ang,
      half,
      los,
      radius: d < this.spec.viewRadius,
      cover: !!ctx.cover,
    };

    if (seen) {
      this.visible = true;
      this.lastSeenAt = now;
      this.lastKnown = { x: ctx.x, z: ctx.z };

      let rate = 0.1 + 0.55 * (1 - d / this.spec.viewRadius);
      let mult = 1;
      if (ctx.extracting) mult += 2.0;
      else if (ctx.sprinting) mult += 0.8;
      if (ctx.ability) mult += 1.2;
      if (ctx.zone) mult += 0.7;
      this.awareness = Math.min(this.spec.maxAwareness, this.awareness + rate * mult * wdt);
      // loitering looks odd but is not proof of anything: without a
      // conspicuous act the meter can only ever fill to 'watching you'
      const cap = ctx.suspicious ? this.spec.maxAwareness : 0.5;
      this.awareness = Math.min(this.awareness, cap);
    } else {
      this.visible = false;
      const decay = ctx.cover ? 0.9 : 0.45;
      this.awareness = Math.max(0, this.awareness - decay * wdt);
    }

    this.mind(ctx, now);
  }

  /** Role-flavoured reactions to the awareness meter. */
  mind(ctx, now) {
    const canDetect = this.spec.maxAwareness >= 1; // guards + targets respond
    if (canDetect) {
      if (this.awareness >= 1 && this.mode !== 'investigate') {
        this.beginInvestigate(now);
        this.onDetect?.(this, this.lastKnown);
      } else if (this.visible && this.awareness >= 0.35 && this.mode === 'search') {
        this.beginInvestigate(now); // found you again mid-search
      }
      if (this.mode === 'investigate' && !this.visible && now - this.lastSeenAt > 6000) {
        this.beginSearch(now);
      }
    } else if (this.awareness >= 0.8 && !this.witnessed) {
      // a civilian or vendor who got a good look can still tip off a guard
      this.witnessed = true;
      this.onWitness?.(this, this.lastKnown);
    }
    if (this.awareness < 0.5) this.witnessed = false;

    if (this.mode === 'search' && now >= this.modeUntil) this.beginReturn(now);
  }

  beginInvestigate(now) {
    this.mode = 'investigate';
    this.modeUntil = now + 30000;
    this.lastSeenAt = now; // a fresh lead counts as "just seen" for the grace window
    this.stuckSince = 0;
  }

  beginSearch(now) {
    this.mode = 'search';
    this.modeUntil = now + 5000; // stand and scan the area for a few seconds
    this.yawBase = this.yaw;
    this.scanPhase = 0;
    this.stuckSince = 0;
  }

  beginReturn(now) {
    this.mode = 'return';
    this.modeUntil = now + 30000; // then stop insisting on the exact approach
    // rejoin the round at the nearest waypoint
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.route.points.length; i++) {
      const p = this.route.points[i];
      const d = Math.hypot(p.x - this.x, p.z - this.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    this.routeIndex = best;
    this.stuckSince = 0;
  }

  /** A disturbance the agent noticed (see cityLife.emitDisturbance). */
  onDisturbance(evt, now) {
    const d = Math.hypot(evt.x - this.x, evt.z - this.z);
    if (d > evt.radius) return 0;
    // street noise carries, light does not: extraction and resonance flashes
    // need a line of sight, a raised voice or a slamming door would not
    if (evt.visual !== false && !clearLine(this.colliders, this.x, this.z, evt.x, evt.z)) {
      return 0;
    }
    const jump = evt.strength * (1 - d / evt.radius) * 1.1;
    if (jump <= 0.02) return 0;
    this.awareness = Math.min(this.spec.maxAwareness, this.awareness + jump);
    this.lastKnown = { x: evt.x, z: evt.z };
    if (this.spec.maxAwareness >= 1 && this.awareness >= 1 && this.mode !== 'investigate') {
      this.beginInvestigate(now);
      this.onDetect?.(this, this.lastKnown);
    }
    return 1;
  }

  /* ------------------------------ movement ------------------------------ */

  advanceRoute() {
    const n = this.route.points.length;
    if (n < 2) return;
    if (this.route.loop) {
      this.routeIndex = (this.routeIndex + 1) % n;
    } else {
      let next = this.routeIndex + this.dir;
      if (next >= n || next < 0) {
        this.dir = -this.dir;
        next = this.routeIndex + this.dir;
      }
      this.routeIndex = next;
    }
  }

  /**
   * One perception + motion tick. Ticked on a fixed wall-clock cadence by
   * cityLife (see its update loop) — NOT per render frame — so a crawling
   * renderer can never blind the city: eyes and footsteps keep their own
   * steady time.
   * @param {number} dt tick seconds (fixed)
   * @param {number} t elapsed simulation seconds
   * @param {{x:number,y:number,z:number}} viewer player position (head tracking)
   * @param {object} ctx perception context (see perceive)
   * @param {number} wdt wall-clock seconds this tick represents
   * @param {number} now performance.now()
   */
  update(dt, t, viewer, ctx, wdt, now) {
    this.perceive(ctx, now, wdt);

    let tx = this.x;
    let tz = this.z;
    let speed = this.spec.speed;
    const p = this.route.points[this.routeIndex] ?? this.route.points[0];

    switch (this.mode) {
      case 'pause':
        if (now >= this.pauseUntil) {
          this.mode = 'route';
          this.stuckSince = 0;
          // aim at the waypoint *this same tick*: tx/tz were seeded with our
          // own position and the switch has already passed `case 'route'`,
          // so without this dist reads 0 and the arrival branch would fire
          // immediately — re-pausing forever and never taking a step
          tx = p.x;
          tz = p.z;
        }
        break;
      case 'route':
        tx = p.x;
        tz = p.z;
        break;
      case 'investigate':
        tx = this.lastKnown.x;
        tz = this.lastKnown.z;
        speed *= 1.4;
        break;
      case 'search':
        break; // stand still, scan around
      case 'return':
        tx = p.x;
        tz = p.z;
        speed *= 1.25;
        break;
      default:
        break;
    }

    const dx = tx - this.x;
    const dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    let moving = false;

    if (this.mode !== 'pause' && this.mode !== 'search' && dist > 0.55) {
      const step = Math.min(speed * dt, dist);
      const [mx, mz] = this.colliders.moveAxis(
        this.x,
        this.z,
        (dx / dist) * step,
        (dz / dist) * step,
        this.y + 0.1,
        AGENT_RADIUS,
      );
      const moved = Math.hypot(mx - this.x, mz - this.z);
      this.x = mx;
      this.z = mz;
      this.y = this.colliders.groundAt(this.x, this.z, this.y + 0.2);
      moving = moved > 2e-4;
      this.yaw = turnToward(this.yaw, Math.atan2(dx, dz), dt * 6);
      // walls win eventually: stuck for ~2.5 s means skip this waypoint
      if (moving || step < 1e-4) this.stuckSince = now;
      else if (this.stuckSince && now - this.stuckSince > 2500) {
        this.stuckSince = now;
        if (this.mode === 'route') this.advanceRoute();
        else if (this.mode === 'investigate') this.beginSearch(now);
        else if (this.mode === 'return') this.mode = 'route';
      }
    } else {
      this.stuckSince = now;
    }

    // arrivals
    if (this.mode === 'route' && dist <= 0.7) {
      if (p.pause) {
        this.mode = 'pause';
        this.pauseUntil = now + p.pause * 1000;
        this.yawBase = this.yaw;
        this.scanPhase = 0;
        this.advanceRoute(); // resume at the *next* waypoint after the stand
      } else {
        this.advanceRoute();
      }
    } else if (this.mode === 'investigate' && dist <= 1.2) {
      this.beginSearch(now);
    } else if (this.mode === 'return' && (dist <= 2.0 || now >= this.modeUntil)) {
      this.mode = 'route';
      this.stuckSince = 0;
    }

    // idle scans (pause / search) and watching (suspicious while in view)
    if (this.mode === 'pause' || this.mode === 'search') {
      this.scanPhase += dt * (this.mode === 'search' ? 1.7 : 0.7);
      const sweep = this.mode === 'search' ? 1.3 : 0.8;
      this.yaw = this.yawBase + Math.sin(this.scanPhase) * sweep;
    } else if (this.visible && this.awareness >= 0.12) {
      // once you have actually been noticed (even briefly), the head keeps
      // tracking you — nobody who has clocked you looks straight back away
      this.yaw = turnToward(this.yaw, Math.atan2(ctx.x - this.x, ctx.z - this.z), dt * 5);
    }

    const gaitTarget = moving ? (this.mode === 'route' ? 0.85 : 1) : 0;
    this.gaitK += (gaitTarget - this.gaitK) * Math.min(1, dt * 5);

    this.rig.setPosition(this.x, this.y, this.z);
    this.rig.setYaw(this.yaw);
    this.rig.setGait(this.gaitK);
    // Phase 8: pick the animation that matches role + AI state, so guards
    // stand at attention, vendors call out, searching figures shield their
    // eyes and the mark is always checking a device.
    this.rig.setAnim(
      clipFor({ role: this.type, mode: this.mode, moving, awareness: this.awareness }),
    );
    this.rig.update(dt, t, viewer ?? null);
  }

  /* --------------------------- test surface ----------------------------- */

  snapshot() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      x: this.x,
      y: this.y,
      z: this.z,
      yaw: this.yaw,
      mode: this.mode,
      awareness: this.awareness,
      visible: this.visible,
      routeIndex: this.routeIndex,
      pauses: this.route.points.filter((pt) => pt.pause).length,
      route: this.route.points.map((pt) => ({ x: pt.x, z: pt.z, pause: pt.pause ?? 0 })),
      // last perception gate evaluation — shows WHY sight did or didn't land
      perc: this.perc
        ? {
            seen: this.perc.seen,
            d: +this.perc.d.toFixed(2),
            ang: +this.perc.ang.toFixed(2),
            half: +this.perc.half.toFixed(2),
            los: this.perc.los,
            radius: this.perc.radius,
            cover: this.perc.cover,
          }
        : null,
    };
  }

  /** Test fixture: drop the agent somewhere else and forget what it saw. */
  relocate(x, z, faceX, faceZ) {
    this.x = x;
    this.z = z;
    this.y = this.colliders.groundAt(x, z, 0.3);
    this.mode = 'route';
    this.awareness = 0;
    this.visible = false;
    this.witnessed = false;
    this.stuckSince = 0;
    // fixtures may also set what the agent is looking at, so detection tests
    // do not depend on a patrol route happening to face the player. A facing
    // fixture also *posts* the agent there for a few seconds — like a guard
    // at a corner who watches before resuming its round.
    if (faceX !== undefined && faceZ !== undefined) {
      this.yaw = Math.atan2(faceX - x, faceZ - z);
      this.yawBase = this.yaw;
      this.mode = 'pause';
      this.pauseUntil = performance.now() + 15000;
    }
    this.rig.setPosition(this.x, this.y, this.z);
  }

  /** Test seam: start the (otherwise game-timed) stand-and-pause early. */
  forcePause(seconds = 0.15) {
    this.mode = 'pause';
    this.pauseUntil = performance.now() + seconds * 1000;
    this.yawBase = this.yaw;
    this.scanPhase = 0;
  }

  dispose() {
    this.rig.dispose();
    this.rig.group.removeFromParent();
  }
}
