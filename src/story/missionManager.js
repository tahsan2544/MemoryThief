/**
 * MissionManager — derives mission progress from persistent state.
 *
 * Nothing here is latched: every objective recomputes from flags + held
 * memories on each refresh, so reloading an old save, talking to people out
 * of order, or recovering a fragment early can only *catch progress up*,
 * never strand it. `refresh()` diffs two computations to fire objective /
 * completion events (toasts, markers, journal re-renders) exactly once.
 *
 * The manager also owns the objective rewards: when an objective flips to
 * done it files its `grant` evidence into StoryState (idempotent).
 */

import { EVIDENCE, MISSIONS } from './missionDefs.js';

export class MissionManager {
  constructor({ state, memories, onEvent = () => {} }) {
    this.state = state;
    this.memories = memories;
    this.onEvent = onEvent;
    this._last = null; // previous summary for diffing
  }

  /* --------------------------- predicate context ----------------------- */

  /**
   * The predicate world every mission/dialogue condition runs against.
   * `obj()` re-evaluates an objective's `done` on demand (all `done`
   * predicates are flag/memory based, so this never recurses) — that lets
   * dialogue trees ask the same questions the journal does, without going
   * through view() first. Dialogue definitions read `state` directly.
   */
  _ctx() {
    const state = this.state;
    const memories = this.memories;
    const ctx = {
      state,
      memories,
      flag: (id) => state.has(id),
      mem: (id) => memories.has(id),
      obj: (objId) => {
        for (const def of MISSIONS) {
          const o = def.objectives.find((x) => x.id === objId);
          if (o) return !!o.done(ctx);
        }
        return false;
      },
    };
    return { ctx };
  }

  /** Public accessor: dialogue definitions share the journal's predicates. */
  context() {
    return this._ctx().ctx;
  }

  /* ------------------------------ computation -------------------------- */

  /** Full view model — safe to call any time (pure, no side effects). */
  view() {
    const { ctx } = this._ctx();
    const missions = MISSIONS.map((def) => {
      const objectives = def.objectives.map((o) => {
        const isDone = !!o.done(ctx);
        return {
          id: o.id,
          text: o.text,
          hint: o.hint ?? '',
          done: isDone,
          visible: !!o.visible(ctx),
          grant: o.grant ?? [],
        };
      });
      const complete = !!def.completeWhen(ctx);
      const started = !!def.startWhen(ctx);
      const status = complete ? 'complete' : started ? 'active' : 'locked';
      return {
        id: def.id,
        kind: def.kind,
        title: def.title,
        log: def.log,
        start: def.start ?? '',
        status,
        objectives,
        visibleObjectives: objectives.filter((o) => o.visible).length,
        doneObjectives: objectives.filter((o) => o.done).length,
        totalObjectives: objectives.length,
        rewards: def.rewards ?? [],
      };
    });

    const accounts = this.state.accounts();
    return {
      missions,
      evidence: this.state.listEvidence(),
      accountCount: accounts.length,
      // the witnesses contradict each other once two versions are on record
      discrepancy:
        accounts.length >= 2
          ? 'The accounts disagree: alone, watched through glass, in a ward coat. Weigh them against the memories you hold.'
          : null,
      flags: [...this.state.flags],
    };
  }

  /**
   * Recompute, grant rewards for objectives that flipped since the last
   * refresh, and report what changed.
   * @returns {{objectives:Array, completed:Array}}
   */
  refresh() {
    const view = this.view();
    const prev = this._last;
    this._last = view;

    const events = { objectives: [], completed: [] };
    if (!prev) return events; // first computation: no "newly done" noise

    for (const mission of view.missions) {
      const before = prev.missions.find((m) => m.id === mission.id);
      if (!before) continue;
      for (const obj of mission.objectives) {
        const was = before.objectives.find((o) => o.id === obj.id)?.done;
        if (obj.done && !was) {
          // reward the player for the objective, once
          for (const evId of obj.grant ?? []) {
            const res = this.state.addEvidence(EVIDENCE[evId]);
            if (res.added) this.onEvent({ type: 'evidence', entry: res.entry });
          }
          events.objectives.push({ mission: mission.title, id: obj.id, text: obj.text });
        }
      }
      if (mission.status === 'complete' && before.status !== 'complete') {
        events.completed.push({ id: mission.id, title: mission.title, rewards: mission.rewards });
      }
    }

    if (events.objectives.length) this.onEvent({ type: 'objectives', list: events.objectives });
    for (const done of events.completed) this.onEvent({ type: 'mission-complete', mission: done });
    return events;
  }

  /** After a reset/reload the baseline must match reality or nothing "flips". */
  baseline() {
    this._last = this.view();
    return this._last;
  }

  /* ------------------------------- markers ----------------------------- */

  /**
   * World markers for whatever the player should walk to next. Main-mission
   * targets win while the case is open; the optional side gets the lights
   * only once the case closes (its journal entry points the whole way).
   * Each target: { id, get() → {x, z} | null } (a getter keeps moving
   * characters honest between refreshes).
   */
  markerTargets(world) {
    const st = this.state;
    const sources = world?.memorySites?.sources ?? [];
    const byId = (id) => sources.find((s) => s.id === id);
    const tomas = (world?.storyCast?.targets ?? []).find((t) => t.id === 'tomas');
    const courier = (world?.cityLife?.agents ?? []).find((a) => a.type === 'target');
    const door = world?.memorySites?.secretState?.();
    const point = (x, z) => () => ({ x, z });

    const main = [];
    if (!st.has('met-tomas')) {
      if (tomas) main.push({ id: 'tomas', get: point(tomas.x, tomas.z) });
    } else if (!st.has('asked-trader') || !st.has('asked-attendant') || !st.has('tower-traced')) {
      if (!st.has('asked-trader')) {
        const s = byId('src-market-trader');
        if (s) main.push({ id: 'trader', get: point(s.x, s.z) });
      }
      if (!st.has('asked-attendant')) {
        const s = byId('src-station-attendant');
        if (s) main.push({ id: 'attendant', get: point(s.x, s.z) });
      }
      if (!st.has('tower-traced') && courier) {
        main.push({ id: 'courier', get: () => (world.cityLife.agents.find((a) => a.id === courier.id) ? { x: courier.x, z: courier.z } : null) });
      }
    } else if (!st.has('annex-key')) {
      if (tomas) main.push({ id: 'tomas', get: point(tomas.x, tomas.z) });
    } else if (!st.has('cage-open')) {
      if (door) main.push({ id: 'annex', get: point(door.x, door.z) });
    } else if (!st.has('case-closed')) {
      if (door) main.push({ id: 'cage', get: point(door.x, door.z - 1.3) });
    }

    if (main.length) return main;

    // case closed → point at the optional investigation until it is done
    const clerk = byId('src-glassline-clerk');
    const plaque = byId('src-garden-plaque');
    const side = [];
    if (!st.has('asked-clerk') && clerk) side.push({ id: 'clerk', get: point(clerk.x, clerk.z) });
    else if (!this.memories.has('mem-garden-observance') && plaque) {
      side.push({ id: 'plaque', get: point(plaque.x, plaque.z) });
    }
    return side;
  }
}
