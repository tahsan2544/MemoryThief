/**
 * StoryState — the single owner of Phase 5 mission/dossier state.
 *
 * Responsibilities:
 *   - flags: one-way facts about what has happened ("met-tomas", "annex-key")
 *   - evidence: the ordered dossier of findings the case journal records
 *   - events: a tiny emitter so the mission manager, markers and toasts can
 *     react to every change without polling
 *   - persistence: survives page reloads and world rebuilds, exactly like
 *     MemoryManager does for fragments
 *
 * Design rules that keep the chapter unwinnable-proof:
 *   - flags are monotonic (set, never cleared) except by an explicit reset
 *   - objectives are *derived* from flags/memories, never one-shot latches,
 *     so loading an old save or talking out of order can only catch up
 *   - evidence additions are idempotent (first write wins, order preserved)
 */

export class StoryState {
  constructor({ storageKey = 'mt.story.v1', persist = true } = {}) {
    this.storageKey = storageKey;
    this.persist = persist;

    /** @type {Set<string>} */
    this.flags = new Set();
    /** @type {Map<string, {id:string,title:string,body:string,tag:string}>} */
    this.evidence = new Map();
    /** @type {Map<string, Function[]>} */
    this.listeners = new Map();

    this._load();
  }

  /* ------------------------------- flags ------------------------------- */

  has(flagId) {
    return this.flags.has(flagId);
  }

  /** @returns {boolean} true when the flag was newly set */
  setFlag(flagId) {
    if (this.flags.has(flagId)) return false;
    this.flags.add(flagId);
    this._save();
    this.emit('change', { kind: 'flag', id: flagId });
    return true;
  }

  /* ------------------------------ evidence ----------------------------- */

  /**
   * File a dossier entry (idempotent — the first version filed is the one
   * the player reads back).
   * @returns {{added:boolean, entry:object|null}}
   */
  addEvidence(entry) {
    if (!entry || !entry.id) return { added: false, entry: null };
    if (this.evidence.has(entry.id)) return { added: false, entry: this.evidence.get(entry.id) };
    this.evidence.set(entry.id, { ...entry });
    this._save();
    this.emit('change', { kind: 'evidence', id: entry.id, entry });
    return { added: true, entry };
  }

  evidence(id) {
    return this.evidence.get(id) ?? null;
  }

  listEvidence() {
    return [...this.evidence.values()];
  }

  /** Witness statements that describe the same night differently. */
  accounts() {
    return this.listEvidence().filter((e) => e.tag === 'account');
  }

  /* ------------------------------- events ------------------------------ */

  on(type, cb) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(cb);
    return () => this.off(type, cb);
  }

  off(type, cb) {
    const list = this.listeners.get(type);
    if (!list) return;
    const i = list.indexOf(cb);
    if (i >= 0) list.splice(i, 1);
  }

  emit(type, payload) {
    for (const cb of this.listeners.get(type) ?? []) {
      try {
        cb(payload);
      } catch (err) {
        console.error('[story] listener failed:', err);
      }
    }
  }

  /* ----------------------------- persistence --------------------------- */

  snapshot() {
    return {
      flags: [...this.flags],
      evidence: this.listEvidence(),
      accounts: this.accounts().length,
    };
  }

  reset() {
    this.flags.clear();
    this.evidence.clear();
    this._save();
    this.emit('change', { kind: 'reset' });
  }

  /**
   * Replace all state from a raw document (boot load, or a Phase 6
   * checkpoint restore). Malformed entries are dropped; never throws.
   * The new state is persisted immediately so a reload agrees with it.
   */
  applyState(data = {}) {
    this.flags.clear();
    this.evidence.clear();
    for (const f of Array.isArray(data.flags) ? data.flags : []) this.flags.add(String(f));
    for (const e of Array.isArray(data.evidence) ? data.evidence : []) {
      if (e && e.id) {
        this.evidence.set(e.id, { id: e.id, title: e.title ?? e.id, body: e.body ?? '', tag: e.tag ?? 'case' });
      }
    }
    this._save();
    this.emit('change', { kind: 'state' });
  }

  /** Raw snapshot in storage shape — the Phase 6 checkpoint reads this. */
  exportState() {
    return { flags: [...this.flags], evidence: this.listEvidence() };
  }

  _load() {
    if (!this.persist) return;
    try {
      const raw = window.localStorage?.getItem(this.storageKey);
      if (!raw) return;
      const data = JSON.parse(raw);
      for (const f of data.flags ?? []) this.flags.add(String(f));
      for (const e of data.evidence ?? []) {
        if (e && e.id) this.evidence.set(e.id, { id: e.id, title: e.title ?? e.id, body: e.body ?? '', tag: e.tag ?? 'case' });
      }
    } catch (err) {
      console.warn('[story] could not load saved state:', err);
    }
  }

  _save() {
    if (!this.persist) return;
    try {
      const data = {
        v: 1,
        flags: [...this.flags],
        evidence: this.listEvidence(),
      };
      window.localStorage?.setItem(this.storageKey, JSON.stringify(data));
    } catch (err) {
      console.warn('[story] could not save state:', err);
      this.persist = false;
    }
  }
}
