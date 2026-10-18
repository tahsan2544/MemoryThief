/**
 * MemoryManager — the single owner of story state for the memory mechanic.
 *
 * Responsibilities:
 *   - collect fragments (once each) with cooldown + feedback reasons
 *   - remember which fragments have been reconstructed
 *   - persist across interface close/reopen, page reloads and world rebuilds
 *   - track contradiction deductions (the player's own weighed conclusions)
 *   - gate the one unlockable ability (Resonance Sight) with cooldowns
 *
 * Time is measured with the wall clock (`performance.now`), never the
 * render delta, so channel/cooldown/ability durations stay honest even when
 * the renderer is crawling (headless tests) or hitching (real play).
 */

import {
  EXTRACTION_COOLDOWN,
  FRAGMENTS,
  FRAGMENT_BY_ID,
  contradictionPairs,
} from './fragments.js';

const ABILITY_DURATION = 16; // seconds active
const ABILITY_COOLDOWN = 45; // seconds between uses

export class MemoryManager {
  constructor({ storageKey = 'mt.memories.v1', persist = true } = {}) {
    this.storageKey = storageKey;
    this.persist = persist;

    /** @type {Map<string, {collectedAt:number, reconstructed:boolean}>} */
    this.collected = new Map();
    /** contradiction pair id → fragment id the player believes */
    this.deductions = new Map();
    this.gloveReadyAt = 0; // wall-clock time the glove may fire again
    this.ability = { unlocked: false, active: false, readyAt: 0, startedAt: 0 };
    /**
     * Phase 6 upgrade tunings — plain multipliers the progression system
     * pushes in (1 = stock behaviour, so Phases 1–3 are unchanged).
     */
    this.abilityTuning = { durationScale: 1, cooldownScale: 1 };

    this._load();
  }

  /* ----------------------------- collection ---------------------------- */

  /**
   * Try to record a fragment.
   * @returns {{ok:boolean, reason?:string, fragment?:object}}
   */
  collect(fragmentId) {
    const fragment = FRAGMENT_BY_ID[fragmentId];
    if (!fragment) return { ok: false, reason: 'unknown-fragment' };

    const now = performance.now();
    if (now < this.gloveReadyAt) {
      return { ok: false, reason: 'cooldown', remaining: (this.gloveReadyAt - now) / 1000 };
    }
    // the glove always needs a moment to settle, even on failure paths
    this.gloveReadyAt = now + EXTRACTION_COOLDOWN * 1000;

    if (this.collected.has(fragmentId)) return { ok: false, reason: 'already-held', fragment };

    this.collected.set(fragmentId, { collectedAt: now, reconstructed: false });
    this._save();
    return { ok: true, fragment };
  }

  /** Cooldown seconds remaining before the glove may fire again (0 = ready). */
  gloveCooldown() {
    return Math.max(0, (this.gloveReadyAt - performance.now()) / 1000);
  }

  has(id) {
    return this.collected.has(id);
  }

  get(id) {
    return this.collected.has(id) ? FRAGMENT_BY_ID[id] ?? null : null;
  }

  count() {
    return this.collected.size;
  }

  total() {
    return FRAGMENTS.length;
  }

  /** Collected fragments in catalogue order (stable journal listing). */
  list() {
    return FRAGMENTS.filter((f) => this.collected.has(f.id));
  }

  markReconstructed(id) {
    const rec = this.collected.get(id);
    if (!rec) return false;
    if (rec.reconstructed) return false; // consequences fire only once
    rec.reconstructed = true;
    this._save();
    return true;
  }

  isReconstructed(id) {
    return this.collected.get(id)?.reconstructed === true;
  }

  /** Consequences granted by a fragment, once it has been reconstructed. */
  consequencesOf(id) {
    return FRAGMENT_BY_ID[id]?.consequences ?? [];
  }

  /* --------------------------- contradictions -------------------------- */

  /** Pairs where BOTH fragments are held — a contradiction can be weighed. */
  activeContradictions() {
    return contradictionPairs().filter((p) => this.has(p.a) && this.has(p.b));
  }

  setDeduction(pairId, believedId) {
    const pair = contradictionPairs().find((p) => p.id === pairId);
    if (!pair) return { ok: false, reason: 'unknown-pair' };
    if (pair.a !== believedId && pair.b !== believedId) {
      return { ok: false, reason: 'not-in-pair' };
    }
    if (!this.has(believedId)) return { ok: false, reason: 'fragment-not-held' };
    this.deductions.set(pairId, believedId);
    this._save();
    return { ok: true, believedId };
  }

  getDeduction(pairId) {
    return this.deductions.get(pairId) ?? null;
  }

  /* ------------------------------- ability ----------------------------- */

  unlockAbility(sourceId) {
    if (this.ability.unlocked) return false;
    this.ability.unlocked = true;
    this.ability.sourceId = sourceId ?? null;
    this._save();
    return true;
  }

  abilityState() {
    const now = performance.now();
    const duration = ABILITY_DURATION * (this.abilityTuning?.durationScale ?? 1);
    return {
      unlocked: this.ability.unlocked,
      active: this.ability.active,
      cooldown: Math.max(0, (this.ability.readyAt - now) / 1000),
      remaining: this.ability.active ? Math.max(0, duration - (now - this.ability.startedAt) / 1000) : 0,
      duration, // effective active seconds after upgrade tunings
    };
  }

  /** @returns {{ok:boolean, reason?:string}} */
  toggleAbility() {
    if (!this.ability.unlocked) return { ok: false, reason: 'locked' };
    const now = performance.now();
    const cooldown = ABILITY_COOLDOWN * (this.abilityTuning?.cooldownScale ?? 1);
    if (this.ability.active) {
      // switching it off by hand still counts as a use — resonance does not
      // come free just because you released the switch early
      this.ability.active = false;
      this.ability.readyAt = now + cooldown * 1000;
      return { ok: true, ended: true };
    }
    if (now < this.ability.readyAt) {
      return { ok: false, reason: 'cooldown', remaining: (this.ability.readyAt - now) / 1000 };
    }
    this.ability.active = true;
    this.ability.startedAt = now;
    return { ok: true, started: true };
  }

  /** Called every frame: retires the ability when its duration lapses. */
  tick() {
    if (!this.ability.active) return false;
    const duration = ABILITY_DURATION * (this.abilityTuning?.durationScale ?? 1);
    const cooldown = ABILITY_COOLDOWN * (this.abilityTuning?.cooldownScale ?? 1);
    if (performance.now() - this.ability.startedAt >= duration * 1000) {
      this.ability.active = false;
      this.ability.readyAt = performance.now() + cooldown * 1000;
      return true; // caller shows feedback
    }
    return false;
  }

  /* ----------------------------- persistence --------------------------- */

  snapshot() {
    return {
      collected: this.list().map((f) => ({
        id: f.id,
        title: f.title,
        source: f.sourceName,
        reliability: f.reliability,
        reconstructed: this.isReconstructed(f.id),
      })),
      count: this.count(),
      total: this.total(),
      gloveCooldown: this.gloveCooldown(),
      contradictions: this.activeContradictions().map((p) => ({
        id: p.id,
        a: p.a,
        b: p.b,
        believed: this.getDeduction(p.id),
      })),
      ability: this.abilityState(),
    };
  }

  reset() {
    this.collected.clear();
    this.deductions.clear();
    this.gloveReadyAt = 0;
    this.ability = { unlocked: false, active: false, readyAt: 0, startedAt: 0 };
    this._save();
  }

  _load() {
    if (!this.persist) return;
    try {
      const raw = window.localStorage?.getItem(this.storageKey);
      if (!raw) return;
      this.applyState(JSON.parse(raw));
    } catch (err) {
      console.warn('[memory] could not load saved state:', err);
    }
  }

  /**
   * Replace all state from a raw document (boot load, or a Phase 6
   * checkpoint restore). Unknown fragments are dropped; never throws.
   * The new state is persisted immediately so a reload agrees with it.
   */
  applyState(data = {}) {
    this.collected.clear();
    this.deductions.clear();
    for (const [id, rec] of Object.entries(data.collected ?? {})) {
      if (!FRAGMENT_BY_ID[id]) continue; // ignore fragments from older builds
      this.collected.set(id, { collectedAt: 0, reconstructed: !!(rec && rec.reconstructed) });
    }
    for (const [pair, believed] of Object.entries(data.deductions ?? {})) {
      if (FRAGMENT_BY_ID[believed]) this.deductions.set(pair, believed);
    }
    this.ability.unlocked = !!data.abilityUnlocked;
    this.ability.active = false;
    this.ability.readyAt = 0;
    this.ability.startedAt = 0;
    if (this.ability.unlocked) this.ability.sourceId = data.abilitySource ?? null;
    this.gloveReadyAt = 0;
    this._save();
  }

  /** Raw snapshot in storage shape — the Phase 6 checkpoint reads this. */
  exportState() {
    return {
      collected: Object.fromEntries([...this.collected].map(([id, rec]) => [id, { reconstructed: !!rec.reconstructed }])),
      deductions: Object.fromEntries(this.deductions),
      abilityUnlocked: this.ability.unlocked,
      abilitySource: this.ability.sourceId ?? null,
    };
  }

  _save() {
    if (!this.persist) return;
    try {
      const data = {
        v: 1,
        collected: Object.fromEntries(
          [...this.collected].map(([id, rec]) => [id, { reconstructed: rec.reconstructed }]),
        ),
        deductions: Object.fromEntries(this.deductions),
        abilityUnlocked: this.ability.unlocked,
        abilitySource: this.ability.sourceId ?? null,
      };
      window.localStorage?.setItem(this.storageKey, JSON.stringify(data));
    } catch (err) {
      // private mode / quota — the game continues, it just won't remember
      console.warn('[memory] could not save state:', err);
      this.persist = false;
    }
  }
}

export { FRAGMENTS, FRAGMENT_BY_ID };
