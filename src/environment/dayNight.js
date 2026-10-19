/**
 * Day/night clock — and the weather that follows it.
 *
 * One authoritative game hour drives everything that changes with time:
 * sky gradient, star/moon/sun visibility, key-light colour and direction,
 * fog colour and thickness, district lamp intensity, and a seeded weather
 * schedule (rain fronts + morning fog) that arrives by the clock.
 *
 * Design rules, kept deliberately boring so tests can rely on them:
 *  - The clock boots at 22:00 — the archive hour, the city's signature
 *    night. Night palettes ARE the project's shipped PALETTE values, so
 *    a frozen clock renders exactly the look the game has always had.
 *  - A full day takes 12 real minutes (30 real seconds per game hour) —
 *    slow enough to walk through, fast enough to watch a sunset.
 *  - Variation is seeded only: the same city seed always gets the same
 *    weather timeline, and day 0 always opens on an evening rain front so
 *    the city boots wet and neon-lit. No Math.random anywhere.
 *  - The clock is presentation, not simulation state: it is not saved,
 *    and every test can pin it (`?time=12&cycle=0`) exactly like the
 *    quality presets.
 */

import { createRng } from '../core/rng.js';

/** Real seconds for one game hour → 720 s (12 min) per full day. */
export const HOUR_SECONDS = 30;

/** North/south lean of the sun arc (radians-ish tilt of the orbit plane). */
const TILT_Z = -0.42;

/**
 * Palettes. `night` is a copy of PALETTE's shipped values (the game's look);
 * `day` is overcast teal-grey (this city rarely sees a blue sky); `warm` is
 * the dawn/dusk band the sun paints while it sits on the horizon.
 */
export const TIME_PALETTES = {
  night: {
    zenith: 0x04060f, upper: 0x0a1024, horizon: 0x27314f, glow: 0x4d3f60,
    fog: 0x131a2c, ambient: 0x28324f, hemiSky: 0x38487a, hemiGround: 0x15131c,
    key: 0xa8beff,
  },
  day: {
    zenith: 0x1d3f66, upper: 0x4f7ea8, horizon: 0x9fb6c4, glow: 0xcfd8d9,
    fog: 0x8fa3b0, ambient: 0x8fa0bd, hemiSky: 0x9fc4e8, hemiGround: 0x6f6a5e,
    key: 0xfff3dd,
  },
  warm: {
    zenith: 0x2a3557, upper: 0x6d5a80, horizon: 0xd98a5a, glow: 0xff9e5e,
    fog: 0xa57a68, ambient: 0x6b6076, hemiSky: 0xb98a7a, hemiGround: 0x3a2c28,
    key: 0xffb37a,
  },
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mixHex = (a, b, t) => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
};

/** Sun elevation proxy: > 0 between 06:00 and 18:00, peaks at noon. */
export function elevationAt(hour) {
  return Math.sin(((hour - 6) / 12) * Math.PI);
}

/**
 * 0 = deep night, 1 = full day. Deliberately time-shaped rather than a raw
 * sine: smooth ~2.5 h shoulders at dawn and dusk so both are long enough to
 * watch (a pure elevation curve put full night on the clock at 18:46).
 */
export function daynessAt(hour) {
  const rise = smoothstep(5.25, 7.75, hour);
  const set = 1 - smoothstep(16.75, 19.25, hour);
  return Math.min(rise, set);
}

/** Dawn/dusk amber: a bell over 06:30 and 18:00 (0 deep night/noon, 1 peak). */
export function warmthAt(hour) {
  const bell = (c) => Math.exp(-Math.pow((hour - c) / 1.1, 2));
  return Math.min(1, Math.max(bell(6.5), bell(18)));
}

export function phaseOf(hour) {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 21) return 'dusk';
  return 'night';
}

export function clockText(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Blended palette for an hour: night→day by elevation, warmed at the horizon band. */
export function paletteAt(hour) {
  const k = daynessAt(hour);
  const w = warmthAt(hour) * 0.85;
  const N = TIME_PALETTES.night;
  const D = TIME_PALETTES.day;
  const W = TIME_PALETTES.warm;
  const blend = (key) => mixHex(mixHex(N[key], D[key], k), W[key], w);
  return {
    k,
    warm: warmthAt(hour),
    zenith: blend('zenith'),
    upper: blend('upper'),
    horizon: blend('horizon'),
    glow: blend('glow'),
    fog: blend('fog'),
    ambient: blend('ambient'),
    hemiSky: blend('hemiSky'),
    hemiGround: blend('hemiGround'),
    key: blend('key'),
  };
}

/** Celestial direction for an hour, as a plain {x,y,z} (unit-ish). */
export function lightDirAt(hour, out = { x: 0, y: 0, z: 0 }) {
  const e = elevationAt(hour);
  const theta = ((hour - 6) / 12) * Math.PI;
  const sun = { x: Math.cos(theta), y: Math.sin(theta), z: TILT_Z };
  const moon = { x: -sun.x, y: -sun.y, z: -sun.z };
  // The sun lights the day, the moon the night. The swap happens at the
  // horizon under a deliberate twilight dip in key intensity (see lighting.js),
  // which is where the shadow direction visibly changes hands.
  const b = e > 0 ? sun : moon;
  const len = Math.hypot(b.x, b.y, b.z) || 1;
  out.x = b.x / len;
  out.y = b.y / len;
  out.z = b.z / len;
  return out;
}

/* --------------------------- weather by the clock ---------------------- */

function pulse(hour, win) {
  const x = (hour - win.at) / win.len;
  if (x <= 0 || x >= 1) return 0;
  const s = Math.sin(Math.PI * x);
  return s * s; // smooth front: rises, peaks, dies
}

function scheduleFor(seed, day, cache) {
  const key = `${seed}·${day}`;
  let s = cache.get(key);
  if (s) return s;
  const rng = createRng(key);
  const fronts = [];
  const count = 1 + Math.floor(rng.next() * 3); // 1–3 rain fronts per day
  for (let i = 0; i < count; i++) {
    fronts.push({
      at: rng.range(0, 23),
      len: rng.range(1.2, 3.4),
      str: rng.range(0.55, 1),
    });
  }
  if (day === 0) {
    // the boot evening: the signature rain front the city opens under
    fronts[0] = { at: 20.8, len: 3.4, str: 1 };
  }
  s = {
    fronts,
    fog: { at: rng.range(3.5, 8.5), len: rng.range(1.6, 3.2), str: rng.range(0.35, 0.7) },
  };
  cache.set(key, s);
  return s;
}

/**
 * Rain (0..1) and fog thickness (>= 1) for an hour — seamless across
 * midnight by probing the neighbouring days' windows too.
 */
function weatherOn(cache, seed, hour) {
  let rain = 0;
  let fogMul = 1;
  for (const day of [-1, 0, 1]) {
    const s = scheduleFor(seed, day, cache);
    const h = hour - day * 24;
    for (const f of s.fronts) rain = Math.max(rain, f.str * pulse(h, f));
    fogMul = Math.max(fogMul, 1 + s.fog.str * pulse(h, s.fog));
  }
  return { rain, fogMul };
}

/* ------------------------------- the clock ----------------------------- */

export function createDayNight({ seed = 'eidolon-77', hour = 22, cycle = true, daySeconds = HOUR_SECONDS * 24 } = {}) {
  const state = {
    hour: ((hour % 24) + 24) % 24,
    cycle: !!cycle,
    seed,
    daySeconds,
  };
  const cache = new Map();
  const dirTmp = { x: 0, y: 0, z: 0 };

  return {
    state,
    /** Advance the clock; returns true when the hour moved. */
    step(dt) {
      if (!state.cycle || dt <= 0) return false;
      state.hour += (dt * 24) / state.daySeconds;
      if (state.hour >= 24) state.hour -= 24;
      return true;
    },
    setHour(h) {
      state.hour = ((h % 24) + 24) % 24;
    },
    setCycle(v) {
      state.cycle = !!v;
    },
    setSeed(s) {
      state.seed = s;
      cache.clear();
    },
    hour: () => state.hour,
    phase: () => phaseOf(state.hour),
    dayness: () => daynessAt(state.hour),
    warmth: () => warmthAt(state.hour),
    lightDir: (out) => lightDirAt(state.hour, out ?? dirTmp),
    /** The seeded schedule, readable at any hour (and any seed) without side effects. */
    weatherAt: (h, seed) => weatherOn(cache, seed || state.seed, h),
    snapshot() {
      return {
        hour: state.hour,
        phase: phaseOf(state.hour),
        dayness: daynessAt(state.hour),
        warmth: warmthAt(state.hour),
        cycle: state.cycle,
        daySeconds: state.daySeconds,
        weather: weatherOn(cache, state.seed, state.hour),
      };
    },
  };
}
