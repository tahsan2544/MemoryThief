/**
 * Shared colour palette for MEMORY THIEF / Eidolon City.
 *
 * Deliberately restrained: deep blue and muted violet carry the night,
 * warm amber carries life, red is used sparingly as a warning colour.
 * Every value is an sRGB hex; three.js converts to linear working space.
 */
export const PALETTE = {
  // --- sky & atmosphere -------------------------------------------------
  skyZenith: 0x04060f,
  skyUpper: 0x0a1024,
  skyHorizon: 0x27314f,
  skyGlow: 0x4d3f60,
  star: 0xcfe0ff,
  moon: 0xe4ecff,
  fog: 0x131a2c,

  // --- key lighting -----------------------------------------------------
  moonlight: 0xa8beff,
  hemiSky: 0x38487a,
  hemiGround: 0x15131c,
  ambient: 0x28324f,

  // --- surfaces ---------------------------------------------------------
  asphalt: 0x0d0f14,
  concrete: 0x1a1d25,
  curb: 0x101218,
  steel: 0x2b3038,
  glassDark: 0x14263a,
  roof: 0x15171d,
  water: 0x0c2632,

  // --- accents ----------------------------------------------------------
  amber: 0xffa640,
  red: 0xff3b47,
  cyan: 0x63d7ff,
  violet: 0x9a7bff,
  green: 0x64d98a,
  white: 0xeef4ff,
};

/** Per-district neon / glow signature colour. */
export const NEON = {
  glassline: 0x74c8ff,
  oldquarter: 0xff9a3c,
  floodworks: 0x54e0c6,
  verdant: 0xffcf7a,
  underarchive: 0xff3b47,
};
