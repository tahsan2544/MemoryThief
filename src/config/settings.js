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

/** URL overrides that pinned a value. The software-GL fallback (below) steps
 * aside when the caller — tests, screenshots, power users — decided
 * explicitly, so every automated run measures exactly what it asks for. */
const urlPinned = { quality: false, renderScale: false };

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
    urlPinned.quality = true;
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
    if (!Number.isNaN(r)) {
      settings.renderScale = Math.min(1, Math.max(0.5, r));
      urlPinned.renderScale = true;
    }
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

/* --------------------------------------------------------------------- *
 * Software-GL fallback — performance honesty
 *
 * A machine whose GPU is missing, blocklisted or unclaimed renders through
 * SwiftShader / llvmpipe / Microsoft Basic Render. This project's own
 * probes measure that at well under one frame per second at Medium, so the
 * boot path reads the unmasked renderer string once and — unless the URL
 * pinned a preset — starts on Low at half internal resolution instead of
 * quietly handing the player a slideshow. The probe result (including
 * whether the fallback acted) is exposed through `bootReport.software`
 * and the game's stats hook, so the degraded start is visible, not silent.
 * --------------------------------------------------------------------- */

export const bootReport = { software: null };

const SOFTWARE_RENDERER_RE =
  /swiftshader|llvmpipe|softwarerenderer|software rasterizer|basic render|microsoft basic/i;

/** One-shot WebGL probe: does this machine rasterise in software? */
export function detectSoftwareRenderer() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { detected: false, renderer: '', applied: false, reason: 'no webgl context' };
    let renderer = '';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '');
    if (!renderer) renderer = String(gl.getParameter(gl.RENDERER) ?? '');
    // release the throwaway context immediately — browsers allow few of them
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { detected: SOFTWARE_RENDERER_RE.test(renderer), renderer, applied: false };
  } catch (err) {
    return { detected: false, renderer: '', applied: false, reason: String(err?.message ?? err) };
  }
}

/**
 * Boot-time degradation when GL rasterises in software. Idempotent; explicit
 * URL pins win unless `force` (the test hook) asks for the applied branch.
 * Callers that switch quality afterwards must re-apply the renderer side
 * (the game's preset-switch path already does).
 */
export function applySoftwareFallback({ force = false } = {}) {
  const report = bootReport.software ?? (bootReport.software = detectSoftwareRenderer());
  if (report.applied || !report.detected) return report;
  if (!force && (urlPinned.quality || urlPinned.renderScale)) return report;
  settings.quality = 'low';
  settings.renderScale = Math.min(settings.renderScale, 0.5);
  applyQuality();
  report.applied = true;
  console.warn(
    `[memory-thief] software GL detected (${report.renderer || 'unknown renderer'}) — ` +
      'starting on Low at 50% internal resolution. Settings → Graphics overrides this.',
  );
  return report;
}
