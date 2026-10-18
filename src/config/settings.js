/**
 * Runtime world settings.
 *
 * Defaults live here, quality presets live here, and URL query parameters can
 * override anything (`?seed=abc&grid=16&quality=low&fog=900&rain=0`).
 * The settings panel in the UI writes into `settings` and calls the
 * appropriate rebuild/apply callback.
 */

export const QUALITY_PRESETS = {
  low: {
    label: 'Low',
    maxPixelRatio: 1,
    // Measured: ~80% of a frame is per-pixel rasterisation (frame time fell
    // 3.0 s → 1.2 s between 100% and 50% scale on identical content), while
    // turning features off bought almost nothing — every preset converged on
    // the same rate. So Low, the tier whose whole job is to be fast, cuts
    // pixels as well: 75% internal resolution, composed with whatever the
    // render-scale slider asks for.
    renderScale: 0.75,
    shadows: false,
    shadowMapSize: 1024,
    shadowRadius: 90,
    shadowHz: 0, // shadow map is never re-rendered (shadows off entirely)
    propDensity: 0.55,
    detailLevel: 0,
    viewDistanceScale: 0.8,
    rain: false,
    districtLights: 0,
    landmarkLights: 0,
    moteCount: 0,
    maxAnisotropy: 1,
    // Phase 8 — post + contact shadows are the first things to go on the
    // cheapest tier: both are full-screen / per-character fill cost.
    bloom: false,
    contactShadows: false,
  },
  medium: {
    label: 'Medium',
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 1536,
    shadowRadius: 120,
    shadowHz: 4, // refresh the shadow map 4x per second, not per frame
    propDensity: 1,
    detailLevel: 1,
    viewDistanceScale: 1,
    rain: true,
    districtLights: 5,
    landmarkLights: 3,
    moteCount: 240,
    maxAnisotropy: 4,
    bloom: true,
    bloomStrength: 0.55,
    bloomRadius: 0.6,
    bloomThreshold: 0.8,
    contactShadows: true,
  },
  high: {
    label: 'High',
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    shadowRadius: 150,
    shadowHz: 6,
    propDensity: 1.3,
    detailLevel: 2,
    viewDistanceScale: 1.35,
    rain: true,
    districtLights: 5,
    landmarkLights: 5,
    moteCount: 460,
    maxAnisotropy: 8,
    bloom: true,
    bloomStrength: 0.78,
    bloomRadius: 0.72,
    bloomThreshold: 0.72,
    contactShadows: true,
  },
};

export const DEFAULTS = {
  seed: 'eidolon-77',
  grid: 12, // cells per axis; cell = 100 m -> 1200 m city
  quality: 'medium',
  density: 1.0,
  fogFar: 1150,
  rain: true,
  shadows: true,
  wet: true,
  // Internal render resolution of the 3D scene (the DOM HUD always draws at
  // native size). 1 = native pixels, 0.75 = 44% fewer, 0.5 = a quarter of them.
  // Measured as the dominant cost under software GL: every preset converged on
  // the same frame rate despite differing by 2x in triangles and by 0-10 lights,
  // which only happens when all of them are paying the same per-pixel bill.
  renderScale: 1,
  // controls (Phase 2) — live values, no rebuild needed
  sensitivity: 1.0, // mouse look multiplier (0.3 – 2.5)
  invertY: false,
  camDistance: 4.6, // third-person boom length in metres
  // audio (Phase 3) — procedural cues only, no samples
  audio: true,
};

export const CELL_SIZE = 100; // metres per city cell
export const ROAD_WIDTH = 16; // metres, centred on cell boundaries
export const CURB_HEIGHT = 0.18;

export const settings = { ...DEFAULTS };

/** Mutable state derived from settings; refreshed by applyQuality(). */
export const derived = {
  viewDistance: 900,
  quality: QUALITY_PRESETS[DEFAULTS.quality],
};

function parseBool(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(v).toLowerCase());
}

/** Read overrides from the URL so builds/screenshots can be parameterised. */
export function applyUrlOverrides(search = window.location.search) {
  const q = new URLSearchParams(search);
  if (q.has('seed')) settings.seed = q.get('seed');
  if (q.has('grid')) {
    const g = parseInt(q.get('grid'), 10);
    if ([8, 12, 16].includes(g)) settings.grid = g;
  }
  if (q.has('quality') && QUALITY_PRESETS[q.get('quality')]) {
    settings.quality = q.get('quality');
  }
  if (q.has('density')) {
    const d = parseFloat(q.get('density'));
    if (!Number.isNaN(d)) settings.density = Math.min(1.6, Math.max(0.5, d));
  }
  if (q.has('fog')) {
    const f = parseInt(q.get('fog'), 10);
    if (!Number.isNaN(f)) settings.fogFar = Math.min(1400, Math.max(250, f));
  }
  if (q.has('rain')) settings.rain = parseBool(q.get('rain'), settings.rain);
  if (q.has('shadows')) settings.shadows = parseBool(q.get('shadows'), settings.shadows);
  if (q.has('wet')) settings.wet = parseBool(q.get('wet'), settings.wet);
  if (q.has('rs')) {
    const r = parseFloat(q.get('rs'));
    if (!Number.isNaN(r)) settings.renderScale = Math.min(1, Math.max(0.5, r));
  }
  if (q.has('sens')) {
    const s = parseFloat(q.get('sens'));
    if (!Number.isNaN(s)) settings.sensitivity = Math.min(2.5, Math.max(0.3, s));
  }
  if (q.has('invert')) settings.invertY = parseBool(q.get('invert'), settings.invertY);
  if (q.has('audio')) settings.audio = parseBool(q.get('audio'), settings.audio);
  if (q.has('dist')) {
    const d = parseFloat(q.get('dist'));
    if (!Number.isNaN(d)) settings.camDistance = Math.min(9, Math.max(2.2, d));
  }
  if (q.has('dev') || q.has('cam')) {
    // start in the Phase 1 inspection camera instead of gameplay
    settings.startInInspect = parseBool(q.get('dev') ?? q.get('cam'), true);
  }
}

/** Re-derive everything that depends on the quality preset. */
export function applyQuality() {
  const preset = QUALITY_PRESETS[settings.quality] ?? QUALITY_PRESETS.medium;
  derived.quality = preset;
  derived.viewDistance = settings.fogFar * preset.viewDistanceScale + 200;
  return preset;
}

export function setQuality(quality) {
  if (QUALITY_PRESETS[quality]) settings.quality = quality;
  return applyQuality();
}
