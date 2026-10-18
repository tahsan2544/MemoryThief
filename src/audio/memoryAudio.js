/**
 * Procedural audio for MEMORY THIEF.
 *
 * No sample files: every sound is synthesised at runtime with WebAudio
 * (oscillators, noise buffers, filters). The context is created lazily on
 * the first user gesture — browsers refuse to start audio otherwise — and
 * every entry point is wrapped so a missing/blocked AudioContext degrades to
 * silence instead of throwing (headless tests run with no audio device).
 *
 * Three buses feed the master output so the settings panel can mix the game:
 *   master    — final volume (audio checkbox zeroes it)
 *   ambience  — city hum, distant machinery, rain
 *   effects   — footsteps, interactions, memory cues
 *
 * Volume preferences persist in `mt.audio.v1` and, like the accessibility
 * options, are never erased by starting a new game.
 */

const VOL_KEY = 'mt.audio.v1';
const VOL_DEFAULTS = Object.freeze({ master: 0.8, ambience: 0.6, effects: 0.8 });

let ctx = null;
let master = null;
let ambienceBus = null;
let effectsBus = null;
let enabled = true;
let drone = null; // { nodes: [...], stop() }
let ambience = null; // { nodes: [...], timer, stop() }
let steps = 0; // footstep counter (tests read this)

/* ------------------------------ volumes -------------------------------- */

function sanitizeVolumes(raw) {
  const out = { ...VOL_DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  for (const k of Object.keys(VOL_DEFAULTS)) {
    const v = Number(raw[k]);
    if (Number.isFinite(v)) out[k] = Math.min(1, Math.max(0, v));
  }
  return out;
}

function loadVolumes() {
  try {
    const raw = window.localStorage?.getItem(VOL_KEY);
    return raw ? sanitizeVolumes(JSON.parse(raw)) : { ...VOL_DEFAULTS };
  } catch {
    return { ...VOL_DEFAULTS };
  }
}

let volumes = loadVolumes();

function persistVolumes() {
  try {
    window.localStorage?.setItem(VOL_KEY, JSON.stringify({ v: 1, ...volumes }));
  } catch {
    /* private mode: volumes simply won't persist */
  }
}

function applyVolumes() {
  if (master) master.gain.value = enabled ? volumes.master : 0;
  if (ambienceBus) ambienceBus.gain.value = volumes.ambience;
  if (effectsBus) effectsBus.gain.value = volumes.effects;
}

export function getVolumes() {
  return { ...volumes };
}

/** Merge a patch, clamp 0..1, persist, apply. Returns the new volumes. */
export function setVolumes(patch = {}) {
  volumes = sanitizeVolumes({ ...volumes, ...patch });
  persistVolumes();
  applyVolumes();
  return { ...volumes };
}

export function resetVolumes() {
  volumes = { ...VOL_DEFAULTS };
  persistVolumes();
  applyVolumes();
  return { ...volumes };
}

/* ------------------------------ context -------------------------------- */

function ensure() {
  if (!enabled) return null;
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) {
      enabled = false;
      return null;
    }
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volumes.master;
    master.connect(ctx.destination);
    ambienceBus = ctx.createGain();
    ambienceBus.gain.value = volumes.ambience;
    ambienceBus.connect(master);
    effectsBus = ctx.createGain();
    effectsBus.gain.value = volumes.effects;
    effectsBus.connect(master);
  } catch (err) {
    console.warn('[audio] disabled:', err?.message ?? err);
    enabled = false;
    ctx = null;
    master = null;
    ambienceBus = null;
    effectsBus = null;
  }
  return ctx;
}

/** Call from a user gesture (pointer-lock click) so cues can actually play. */
export function unlockAudio() {
  const c = ensure();
  if (!c) return false;
  try {
    if (c.state === 'suspended') c.resume();
    return true;
  } catch {
    return false;
  }
}

export function setAudioEnabled(on) {
  enabled = !!on;
  if (!enabled) {
    stopDrone();
    stopAmbience();
  }
  applyVolumes();
}

export function isAudioEnabled() {
  return enabled;
}

/** 'ready' | 'suspended' | 'running' | 'unavailable' — for tests and HUD. */
export function audioState() {
  if (!enabled) return 'disabled';
  if (!ctx) return 'idle';
  return ctx.state;
}

/* ------------------------------ internals ------------------------------ */

// bus: 'effects' (default) | 'ambience'
function tone({ type = 'sine', freq = 440, end = null, t = 0, dur = 0.2, gain = 0.12, bus = 'effects' }) {
  const c = ensure();
  if (!c) return;
  try {
    const now = c.currentTime + t;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (end) osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + Math.min(0.03, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g).connect(bus === 'ambience' ? ambienceBus : effectsBus);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  } catch (err) {
    console.warn('[audio] tone failed:', err?.message ?? err);
  }
}

function noiseBurst({ t = 0, dur = 0.3, gain = 0.05, freq = 1200, q = 1, bus = 'effects' }) {
  const c = ensure();
  if (!c) return;
  try {
    const now = c.currentTime + t;
    const frames = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, frames, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter).connect(g).connect(bus === 'ambience' ? ambienceBus : effectsBus);
    src.start(now);
    src.stop(now + dur);
  } catch (err) {
    console.warn('[audio] noise failed:', err?.message ?? err);
  }
}

/* -------------------------------- cues --------------------------------- */

/**
 * Named cues. Unknown names are ignored (forward compatible with later
 * phases adding fragments without touching call sites).
 */
export function playCue(name) {
  if (!enabled) return false;
  switch (name) {
    case 'extract-charge': // the glove winding up during the channel
      tone({ type: 'sawtooth', freq: 140, end: 660, dur: 0.9, gain: 0.05 });
      noiseBurst({ dur: 0.5, gain: 0.02, freq: 2400, q: 4 });
      return true;
    case 'extract-done': // fragment lands in the journal
      tone({ type: 'triangle', freq: 660, dur: 0.16, gain: 0.09 });
      tone({ type: 'triangle', freq: 990, t: 0.09, dur: 0.22, gain: 0.07 });
      tone({ type: 'sine', freq: 1320, t: 0.16, dur: 0.3, gain: 0.04 });
      return true;
    case 'extract-fail': // cooldown / cancelled / already held
      tone({ type: 'square', freq: 160, end: 110, dur: 0.18, gain: 0.05 });
      return true;
    case 'recon-start':
      tone({ type: 'sine', freq: 96, dur: 1.4, gain: 0.08 });
      noiseBurst({ dur: 0.8, gain: 0.03, freq: 700, q: 1.4 });
      return true;
    case 'recon-reveal': // the moment the reconstruction shows its clue
      tone({ type: 'triangle', freq: 528, dur: 0.5, gain: 0.1 });
      tone({ type: 'sine', freq: 1056, t: 0.14, dur: 0.7, gain: 0.06 });
      return true;
    case 'recon-end':
      tone({ type: 'sine', freq: 440, end: 220, dur: 0.8, gain: 0.06 });
      return true;
    case 'ability-on':
      tone({ type: 'sine', freq: 220, end: 880, dur: 0.4, gain: 0.07 });
      return true;
    case 'ability-off':
      tone({ type: 'sine', freq: 660, end: 220, dur: 0.4, gain: 0.05 });
      return true;
    case 'deduce': // player tags a contradiction
      tone({ type: 'square', freq: 300, dur: 0.08, gain: 0.05 });
      tone({ type: 'square', freq: 450, t: 0.1, dur: 0.12, gain: 0.05 });
      return true;
    case 'interact': // E pressed on anything readable
      tone({ type: 'triangle', freq: 720, dur: 0.07, gain: 0.05 });
      tone({ type: 'triangle', freq: 540, t: 0.05, dur: 0.09, gain: 0.04 });
      return true;
    case 'pickup': // something small is pocketed
      tone({ type: 'sine', freq: 880, dur: 0.09, gain: 0.06 });
      tone({ type: 'sine', freq: 1320, t: 0.07, dur: 0.14, gain: 0.045 });
      return true;
    case 'ui': // menus opening / closing, buttons
      noiseBurst({ dur: 0.05, gain: 0.045, freq: 3200, q: 2.4 });
      tone({ type: 'sine', freq: 1180, dur: 0.05, gain: 0.03 });
      return true;
    case 'land': // hitting the ground after a jump
      noiseBurst({ dur: 0.13, gain: 0.06, freq: 420, q: 0.8 });
      tone({ type: 'sine', freq: 84, end: 58, dur: 0.14, gain: 0.07 });
      return true;
    default:
      return false;
  }
}

/**
 * One footstep. Called from the player controller on stride heel-strikes;
 * sprints hit harder and slightly higher.
 */
export function playFootstep(run = false) {
  if (!enabled) return false;
  steps++;
  const jitter = 0.86 + Math.random() * 0.3; // never a machine-gun loop
  noiseBurst({ dur: run ? 0.11 : 0.14, gain: (run ? 0.05 : 0.032) * jitter, freq: (run ? 760 : 560) * jitter, q: 0.9 });
  tone({ type: 'sine', freq: (run ? 96 : 78) * jitter, dur: 0.07, gain: run ? 0.05 : 0.03 });
  return true;
}

/** How many footsteps have played since page load (tests read this). */
export function footstepCount() {
  return steps;
}

/* ------------------------------- ambience ------------------------------ */

/**
 * A looping noise bed (filtered + slowly breathing) that stands in for the
 * city itself: distant traffic hum, air over the canals. Runs until stopped.
 */
function makeNoiseLoop(bus, { dur = 4, filterType = 'lowpass', freq = 320, q = 0.8, gain = 0.05, lfoHz = 0.06, lfoAmt = 0.35 }) {
  const c = ensure();
  if (!c) return null;
  try {
    const frames = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, frames, c.sampleRate);
    const data = buf.getChannelData(0);
    // brown-ish noise: integrate white noise, then remove the DC drift
    let last = 0;
    let mean = 0;
    for (let i = 0; i < frames; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
      mean += (data[i] - mean) / Math.max(1, i + 1);
    }
    for (let i = 0; i < frames; i++) data[i] -= mean;

    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = c.createGain();
    g.gain.value = gain;

    // slow breathing so the bed never sounds like a frozen loop
    const lfo = c.createOscillator();
    lfo.frequency.value = lfoHz;
    const lfoGain = c.createGain();
    lfoGain.gain.value = gain * lfoAmt;
    lfo.connect(lfoGain).connect(g.gain);

    src.connect(filter).connect(g).connect(bus);
    src.start();
    lfo.start();
    return { src, lfo, g, stop() {
      try {
        src.stop();
        lfo.stop();
      } catch {
        /* already stopped */
      }
    } };
  } catch (err) {
    console.warn('[audio] ambience bed failed:', err?.message ?? err);
    return null;
  }
}

/** One distant machinery event: a far-off clank or thrum through the hum. */
function machineryEvent() {
  const r = Math.random();
  if (r < 0.55) {
    // metal clank: two detuned partials through a bandpass + a soft thud
    tone({ type: 'square', freq: 182 + Math.random() * 90, dur: 0.5, gain: 0.028, bus: 'ambience' });
    tone({ type: 'square', freq: 273 + Math.random() * 120, t: 0.05, dur: 0.7, gain: 0.02, bus: 'ambience' });
    noiseBurst({ dur: 0.4, gain: 0.014, freq: 1600, q: 3, bus: 'ambience' });
  } else if (r < 0.85) {
    // heavy thrum: an elevator or a freight lift two blocks over
    tone({ type: 'sine', freq: 58, end: 52, dur: 1.6, gain: 0.045, bus: 'ambience' });
    tone({ type: 'triangle', freq: 116, dur: 1.2, gain: 0.018, bus: 'ambience' });
  } else {
    // a horn or a starting motor, far away
    tone({ type: 'sawtooth', freq: 196, end: 172, dur: 0.7, gain: 0.02, bus: 'ambience' });
  }
}

/**
 * Start the ambient city bed (idempotent). The machinery scheduler only
 * fires while audio is enabled, and every event is a tiny scheduled synth —
 * no timers hold audio nodes beyond their own stop().
 */
export function startAmbience() {
  const c = ensure();
  if (!c || ambience) return false;
  try {
    const hum = makeNoiseLoop(ambienceBus, {
      dur: 5, filterType: 'lowpass', freq: 340, q: 0.7, gain: 0.05, lfoHz: 0.05, lfoAmt: 0.4,
    });
    const wind = makeNoiseLoop(ambienceBus, {
      dur: 7, filterType: 'bandpass', freq: 860, q: 1.6, gain: 0.016, lfoHz: 0.11, lfoAmt: 0.5,
    });
    const rainBed = makeNoiseLoop(ambienceBus, {
      dur: 3, filterType: 'highpass', freq: 2400, q: 0.6, gain: 0.0001, lfoHz: 0.9, lfoAmt: 0.0,
    });
    const nodes = [hum, wind, rainBed].filter(Boolean);

    // distant machinery: sparse, irregular, quiet — scheduled by wall clock
    let timer = null;
    const schedule = () => {
      const wait = 6000 + Math.random() * 9000;
      timer = setTimeout(() => {
        if (enabled && ambience) {
          machineryEvent();
          schedule();
        }
      }, wait);
    };
    schedule();

    ambience = {
      nodes,
      rainBed,
      get timer() { return timer; },
      stop() {
        try {
          if (timer) clearTimeout(timer);
        } catch {
          /* noop */
        }
        for (const n of nodes) n.stop();
      },
    };
    setRainLevel(ambience.rainOn ?? 0);
    return true;
  } catch (err) {
    console.warn('[audio] ambience failed:', err?.message ?? err);
    ambience = null;
    return false;
  }
}

export function stopAmbience() {
  if (!ambience) return false;
  try {
    ambience.stop();
  } catch {
    /* nothing to stop */
  }
  ambience = null;
  return true;
}

export function isAmbienceRunning() {
  return !!ambience;
}

/** 0..1 — how hard the rain layer plays (driven by the weather setting). */
export function setRainLevel(level) {
  if (!ambience) return false;
  const v = Math.min(1, Math.max(0, Number(level) || 0));
  if (ambience.rainOn === v) return true;
  ambience.rainOn = v;
  try {
    const g = ambience.rainBed?.g;
    if (!g || !ctx) return false;
    const now = ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
    g.gain.linearRampToValueAtTime(v > 0 ? 0.028 + v * 0.03 : 0.0001, now + 1.2);
    return true;
  } catch {
    return false;
  }
}

/** Duck the ambience while a menu owns the screen (pause, map, journal). */
export function setAmbienceActive(on) {
  if (!ambience) return false;
  try {
    const now = ctx.currentTime;
    const target = on ? volumes.ambience : volumes.ambience * 0.25;
    ambienceBus.gain.cancelScheduledValues(now);
    ambienceBus.gain.setValueAtTime(Math.max(0.0001, ambienceBus.gain.value), now);
    ambienceBus.gain.linearRampToValueAtTime(Math.max(0.0001, target), now + 0.4);
    ambience.active = !!on;
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------- drone -------------------------------- */

/** Low two-voice drone that runs for the length of a reconstruction. */
export function startDrone(tint = 1) {
  const c = ensure();
  if (!c || drone) return false;
  try {
    const now = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.06, now + 1.2);
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240 * (0.7 + tint * 0.6);
    filter.Q.value = 2;

    const a = c.createOscillator();
    a.type = 'sawtooth';
    a.frequency.value = 54;
    const b = c.createOscillator();
    b.type = 'sine';
    b.frequency.value = 81.5;

    // slow shimmer so the drone breathes rather than sits flat
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.16;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(g.gain);

    a.connect(filter);
    b.connect(filter);
    filter.connect(g).connect(ambienceBus ?? master);
    a.start(now);
    b.start(now);
    lfo.start(now);

    drone = {
      nodes: [a, b, lfo, g],
      stop() {
        try {
          const t = c.currentTime;
          g.gain.cancelScheduledValues(t);
          g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
          for (const n of [a, b, lfo]) n.stop(t + 0.55);
        } catch {
          /* already stopped */
        }
      },
    };
    return true;
  } catch (err) {
    console.warn('[audio] drone failed:', err?.message ?? err);
    return false;
  }
}

export function stopDrone() {
  if (!drone) return false;
  try {
    drone.stop();
  } catch {
    /* nothing to stop */
  }
  drone = null;
  return true;
}
