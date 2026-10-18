/**
 * Deterministic pseudo-random number generation.
 *
 * Every procedural decision in the world generator flows through a seeded
 * stream so a given seed always produces byte-identical geometry.
 */

/** mulberry32 — small, fast, good enough distribution for content generation. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string into a 32-bit integer (FNV-1a). */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Combine several seeds into one stable 32-bit value. */
export function mixSeeds(...parts) {
  let h = 0x811c9dc5;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h = (h + 0x9e3779b9) >>> 0;
  }
  return h >>> 0;
}

/** Convenience wrapper with the helpers the generators actually use. */
export function createRng(seed) {
  const next = typeof seed === 'function' ? seed : mulberry32(typeof seed === 'string' ? hashString(seed) : seed);
  const rng = {
    next,
    /** float in [a, b) */
    range: (a, b) => a + (b - a) * next(),
    /** integer in [a, b] inclusive */
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    /** true with probability p */
    chance: (p) => next() < p,
    /** pick one element */
    pick: (arr) => arr[Math.floor(next() * arr.length) % arr.length],
    /** roughly gaussian, mean 0 sigma 1 */
    gauss: () => {
      const u = Math.max(1e-6, next());
      const v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    /** deterministic sub-stream */
    fork: (...parts) => createRng(mixSeeds(parts.join('|'), next() * 4294967296)),
  };
  return rng;
}
