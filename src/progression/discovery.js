/**
 * Discovery — what of the city the player has actually laid eyes on.
 *
 * Feeds the map screen (Phase 6): districts are discovered the moment you
 * walk into them, landmarks the moment you get close. Both are *derived
 * checks with one-shot recording* — visiting twice never matters, and the
 * sets survive reloads exactly like memories and story flags do.
 *
 * Data only, no DOM: the map screen reads it, main.js records visits.
 */

export const DISTRICT_TOTAL = 5; // glassline, oldquarter, floodworks, verdant, underarchive
export const LANDMARK_TOTAL = 5; // tower, market, station, garden, archive

/** In-world display names for map pins (keep in sync with layout types). */
export const LANDMARK_NAMES = Object.freeze({
  tower: 'Palisade Tower',
  market: 'Charter Market',
  station: 'Floodworks Station',
  garden: 'Mnemonic Garden',
  archive: 'The Archive',
});

export class Discovery {
  constructor({ storageKey = 'mt.discovery.v1', persist = true } = {}) {
    this.storageKey = storageKey;
    this.persist = persist;
    /** @type {Set<string>} district ids */
    this.districts = new Set();
    /** @type {Set<string>} landmark types */
    this.landmarks = new Set();
    this._load();
  }

  hasDistrict(id) {
    return this.districts.has(id);
  }

  hasLandmark(type) {
    return this.landmarks.has(type);
  }

  /** @returns {boolean} true only the first time */
  visitDistrict(id) {
    if (!id || this.districts.has(id)) return false;
    this.districts.add(id);
    this._save();
    return true;
  }

  /** @returns {boolean} true only the first time */
  visitLandmark(type) {
    if (!type || this.landmarks.has(type)) return false;
    this.landmarks.add(type);
    this._save();
    return true;
  }

  counts() {
    return {
      districts: this.districts.size,
      districtsTotal: DISTRICT_TOTAL,
      landmarks: this.landmarks.size,
      landmarksTotal: LANDMARK_TOTAL,
    };
  }

  /* ----------------------------- persistence --------------------------- */

  snapshot() {
    return { districts: [...this.districts], landmarks: [...this.landmarks] };
  }

  applySnapshot(raw = {}) {
    this.districts.clear();
    this.landmarks.clear();
    for (const d of Array.isArray(raw?.districts) ? raw.districts : []) this.districts.add(String(d));
    for (const l of Array.isArray(raw?.landmarks) ? raw.landmarks : []) this.landmarks.add(String(l));
    this._save();
  }

  reset() {
    this.districts.clear();
    this.landmarks.clear();
    this._save();
  }

  _load() {
    if (!this.persist) return;
    try {
      const raw = window.localStorage?.getItem(this.storageKey);
      if (!raw) return;
      this.applySnapshot(JSON.parse(raw));
    } catch (err) {
      console.warn('[progress] could not load discovery:', err);
      this.districts.clear();
      this.landmarks.clear();
    }
  }

  _save() {
    if (!this.persist) return;
    try {
      window.localStorage?.setItem(this.storageKey, JSON.stringify({ v: 1, ...this.snapshot() }));
    } catch (err) {
      console.warn('[progress] could not save discovery:', err);
      this.persist = false;
    }
  }
}
