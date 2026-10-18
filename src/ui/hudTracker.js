/**
 * Mission tracker — the minimal, always-on objective readout on the HUD.
 *
 * Reads the mission view model (Phase 5's `missions.view()`) and renders at
 * most three lines: what case is open, what to do next, and a compact hint
 * for the optional side job. Nothing is stored here — this is pure
 * presentation; when the story changes, main.js calls updateTracker again.
 */

const cache = {};
const get = (id) => (cache[id] ??= document.getElementById(id));

const KIND_LABEL = { main: 'CASE', side: 'SIDE JOB' };

export function initTracker() {
  return get('tracker') ?? null;
}

/**
 * @param {object} view result of MissionManager.view()
 */
export function updateTracker(view) {
  const root = get('tracker');
  if (!root) return;
  const title = get('tracker-title');
  const objs = get('tracker-objs');
  const side = get('tracker-side');
  if (!view || !Array.isArray(view.missions)) {
    root.classList.add('hidden');
    return;
  }

  const main = view.missions.find((m) => m.kind === 'main') ?? view.missions[0];
  const sideMission = view.missions.find((m) => m.kind === 'side');

  // the main case: its title + up to three unfinished visible objectives
  const openObjectives = (main?.objectives ?? []).filter((o) => o.visible && !o.done);
  const done = main?.status === 'complete';

  if (title) title.textContent = main?.title ?? '—';
  const kicker = get('tracker-kicker');
  if (kicker) kicker.textContent = done ? 'CASE CLOSED' : KIND_LABEL[main?.kind] ?? 'ACTIVE';

  if (objs) {
    objs.innerHTML = '';
    if (done) {
      const line = document.createElement('div');
      line.className = 'tracker-line done';
      line.textContent = 'Filed and closed. Eidolon moves on.';
      objs.appendChild(line);
    } else if (!openObjectives.length) {
      const line = document.createElement('div');
      line.className = 'tracker-line';
      line.textContent = main?.start || 'Look for the commission in Old Quarter.';
      objs.appendChild(line);
    } else {
      for (const o of openObjectives.slice(0, 3)) {
        const line = document.createElement('div');
        line.className = 'tracker-line';
        line.textContent = `▸ ${o.text}`;
        if (o.hint) line.title = o.hint;
        objs.appendChild(line);
      }
      if (openObjectives.length > 3) {
        const more = document.createElement('div');
        more.className = 'tracker-line dim';
        more.textContent = `+${openObjectives.length - 3} more in the case file`;
        objs.appendChild(more);
      }
    }
  }

  // the optional side job stays a single quiet line and never blocks
  if (side) {
    const active = sideMission?.status === 'active';
    const sideDone = sideMission?.status === 'complete';
    side.classList.toggle('hidden', !active && !sideDone);
    side.textContent = active
      ? `◦ ${sideMission.title} ${sideMission.doneObjectives}/${sideMission.totalObjectives}`
      : sideDone
        ? `◦ ${sideMission.title} — done`
        : '';
  }

  root.classList.remove('hidden');
}

/** Test/DOM read-out of what the tracker currently shows. */
export function trackerSnapshot() {
  const root = get('tracker');
  if (!root || root.classList.contains('hidden')) return null;
  return {
    kicker: get('tracker-kicker')?.textContent ?? '',
    title: get('tracker-title')?.textContent ?? '',
    lines: [...(get('tracker-objs')?.children ?? [])].map((el) => el.textContent),
    side: get('tracker-side')?.classList.contains('hidden') ? '' : (get('tracker-side')?.textContent ?? ''),
  };
}
