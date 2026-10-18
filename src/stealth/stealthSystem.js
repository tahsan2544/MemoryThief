/**
 * Phase 4 — the stealth read-out.
 *
 * The agents own their own awareness meters; this system folds them into the
 * player-facing answer to two questions:
 *
 *   1. What state am I in?  hidden → suspicious → detected → searching
 *   2. WHY?                 a plain-language reason the player can act on
 *
 * The reason is the important half — "you were seen extracting", "caught
 * sprinting", "caught inside the canal service lane", "behind cover — no
 * line of sight". A stealth system the player cannot read is just a number
 * that kills them; every state change here is meant to teach the rule that
 * produced it.
 */

const ROLE_LABELS = {
  guard: 'A guard',
  target: 'The courier',
  civilian: 'A bystander',
  vendor: 'A vendor',
};

export class StealthSystem {
  constructor() {
    this.reset();
  }

  reset() {
    this.state = 'hidden';
    this.reason = 'No one is watching';
    this.awareness = 0;
    this.who = '';
    this.changed = false;
  }

  /**
   * @param {Array<{type:string, awareness:number, mode:string}>} profiles
   * @param {{cover:boolean, zone:{label:string}|null, sprinting:boolean,
   *          extracting:boolean, ability:boolean}} ctx
   */
  update(profiles, ctx) {
    let max = 0;
    let who = '';
    let detector = null;
    let searching = false;

    for (const p of profiles) {
      if (p.awareness > max) {
        max = p.awareness;
        who = ROLE_LABELS[p.type] ?? 'Someone';
      }
      if (p.awareness >= 1 && (p.type === 'guard' || p.type === 'target')) detector = p;
      if (p.mode === 'investigate' || p.mode === 'search') searching = true;
    }

    const state = detector ? 'detected' : searching ? 'searching' : max >= 0.35 ? 'suspicious' : 'hidden';

    let reason;
    if (detector) {
      if (ctx.extracting) reason = 'You were seen extracting a memory';
      else if (ctx.zone) reason = `Caught inside ${ctx.zone.label}`;
      else if (ctx.sprinting) reason = 'Caught sprinting';
      else if (ctx.ability) reason = 'Resonance Sight seen from the street';
      else reason = `${who} can see you`;
    } else if (searching) {
      reason = 'Someone is searching the area for you';
    } else if (max >= 0.35) {
      reason = `${who} is watching you`;
    } else if (ctx.cover) {
      reason = 'Behind cover — no line of sight';
    } else {
      reason = 'No one is watching';
    }

    this.changed = state !== this.state || reason !== this.reason;
    this.state = state;
    this.reason = reason;
    this.awareness = max;
    this.who = who;
    return this.view();
  }

  view() {
    return {
      state: this.state,
      reason: this.reason,
      awareness: this.awareness,
      who: this.who,
    };
  }
}
