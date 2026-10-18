/**
 * Glove upgrades — Phase 6 progression.
 *
 * A deliberately small catalogue: four single-purchase improvements to the
 * memory glove, each with one readable effect. Every effect is a *modifier*
 * against a base value the gameplay code already uses, so an unupgraded game
 * behaves exactly as it did in Phases 1–5.
 *
 * Economy — "resonance motes" are not farmed, they are *derived* from what
 * the player has already done (reconstructing memories).
 * Earnings are a pure function of game state, so the total is idempotent:
 * loading an old save can never double-pay, and progress made before this
 * system existed counts retroactively.
 *
 * This module owns data + rules only. It never touches the DOM — the
 * equipment screen renders it, main.js applies the effects to gameplay.
 */

/** Base values gameplay falls back to when no upgrade is owned. */
export const DEFAULT_EFFECTS = Object.freeze({
  reconRange: 14, // metres you may stand from a recording site to replay
  channelScale: 1, // × EXTRACTION_DURATION for the glove channel
  noiseScale: 1, // × extraction disturbance radius in cityLife
  sightDurationScale: 1, // × Resonance Sight active seconds
  sightCooldownScale: 1, // × Resonance Sight recharge seconds
});

export const UPGRADES = [
  {
    id: 'keen-lens',
    name: 'KEEN LENS',
    tagline: 'Improved clue detection',
    cost: 6,
    line: 'Faint traces hold longer: replay a memory from up to 21 m away (was 14 m).',
    effects: { reconRange: 21 },
  },
  {
    id: 'muffled-channel',
    name: 'MUFFLED CHANNEL',
    tagline: 'Reduced extraction noise',
    cost: 5,
    line: 'Discharge is damped: extraction noise reaches 6 m instead of 12 m.',
    effects: { noiseScale: 0.5 },
  },
  {
    id: 'swift-channel',
    name: 'SWIFT CHANNEL',
    tagline: 'Faster extraction',
    cost: 4,
    line: 'Reads finish in 0.91 s instead of 1.30 s — a shorter window to be seen in.',
    effects: { channelScale: 0.7 },
  },
  {
    id: 'echo-cell',
    name: 'ECHO CELL',
    tagline: 'Resonance Sight endurance',
    cost: 5,
    line: 'Sight lasts 20 s and recharges in 31 s (was 16 s / 45 s).',
    effects: { sightDurationScale: 1.25, sightCooldownScale: 0.7 },
  },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

/**
 * Lifetime earnings from game state (pure).
 * 4 motes per reconstructed memory (6 fragments → 24 total; the shop's
 * full price list is 20, so every upgrade stays reachable by playing).
 */
export function motesEarned({ reconstructed = 0 } = {}) {
  return Math.max(0, reconstructed | 0) * 4;
}

/** The player's progression: which upgrades are owned, what they cost. */
export class Progression {
  constructor({ storageKey = 'mt.progress.v1', persist = true } = {}) {
    this.storageKey = storageKey;
    this.persist = persist;
    /** @type {Set<string>} owned upgrade ids */
    this.spent = new Set();
    this._load();
  }

  owned(id) {
    return this.spent.has(id);
  }

  /** Motes spent so far (whole cost of every owned upgrade). */
  motesSpent() {
    let n = 0;
    for (const u of UPGRADES) if (this.spent.has(u.id)) n += u.cost;
    return n;
  }

  /**
   * @param {{reconstructed?:number}} ctx lifetime earnings
   * @returns {{earned:number, spent:number, available:number}}
   */
  motes(ctx = {}) {
    const earned = motesEarned(ctx);
    const spent = this.motesSpent();
    return { earned, spent, available: Math.max(0, earned - spent) };
  }

  /** Aggregated effects of every owned upgrade, merged over the defaults. */
  effects() {
    const fx = { ...DEFAULT_EFFECTS };
    for (const u of UPGRADES) {
      if (!this.spent.has(u.id)) continue;
      Object.assign(fx, u.effects);
    }
    return fx;
  }

  /**
   * Buy an upgrade.
   * @returns {{ok:boolean, reason?:string}}
   */
  buy(id, ctx = {}) {
    const up = UPGRADE_BY_ID[id];
    if (!up) return { ok: false, reason: 'unknown' };
    if (this.spent.has(id)) return { ok: false, reason: 'owned' };
    const { available } = this.motes(ctx);
    if (available < up.cost) return { ok: false, reason: 'motes' };
    this.spent.add(id);
    this._save();
    return { ok: true };
  }

  /* ----------------------------- persistence --------------------------- */

  snapshot() {
    return { spent: [...this.spent] };
  }

  /** Import a (validated) snapshot — unknown ids are dropped. */
  applySnapshot(raw = {}) {
    this.spent.clear();
    for (const id of Array.isArray(raw?.spent) ? raw.spent : []) {
      if (UPGRADE_BY_ID[id]) this.spent.add(id);
    }
    this._save();
  }

  reset() {
    this.spent.clear();
    this._save();
  }

  _load() {
    if (!this.persist) return;
    try {
      const raw = window.localStorage?.getItem(this.storageKey);
      if (!raw) return;
      this.applySnapshot(JSON.parse(raw));
    } catch (err) {
      console.warn('[progress] could not load upgrades:', err);
      this.spent.clear();
    }
  }

  _save() {
    if (!this.persist) return;
    try {
      window.localStorage?.setItem(this.storageKey, JSON.stringify({ v: 1, ...this.snapshot() }));
    } catch (err) {
      console.warn('[progress] could not save upgrades:', err);
      this.persist = false;
    }
  }
}
