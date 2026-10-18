/**
 * Points of interest the player can walk up to and inspect.
 *
 * Phase 2 only ships the *system*: proximity detection, a prompt and a short
 * read-out. The texts are deliberately brief environmental fragments — no
 * exposition, no quest logic. Later phases hang dialogue and memory puzzles
 * off the same records.
 *
 * Positions are derived from the layout (not hard-coded coordinates) so any
 * seed / world scale produces interactables standing in front of the real
 * geometry they describe.
 */

export function createInteractables(layout) {
  const base = layout.curb;
  const cells = {};
  for (const lm of layout.landmarks) cells[lm.type] = lm.cell;
  const list = [];

  const push = (rec) => list.push({ radius: 3.2, kind: 'note', ...rec });

  // --- PALISADE Tower: lobby directory beside the colonnade ---------------
  if (cells.tower) {
    const c = cells.tower;
    push({
      id: 'tower-directory',
      kind: 'sign',
      x: c.cx,
      y: base,
      z: c.cz + 36, // just south of the podium entrance
      label: 'Read the lobby directory',
      title: 'PALISADE TOWER — LOBBY DIRECTORY',
      body:
        'Every tenant floor is listed. 40 and above are not: those buttons are ' +
        'still on the panel, scratched out but wired.',
    });
  }

  // --- Night Market: gateway arch charter --------------------------------
  if (cells.market) {
    const c = cells.market;
    push({
      id: 'market-charter',
      kind: 'sign',
      x: c.cx,
      y: base,
      z: c.z0 + 12.5, // just south of the gateway arch
      label: 'Inspect the market charter',
      title: 'OLD QUARTER NIGHT MARKET — CHARTER',
      body:
        'Reprinted each year by order of the ward office. The ink on this copy ' +
        'is dry, but the date on it is three weeks from today.',
    });
  }

  // --- Floodworks station: departure board on the south rim ---------------
  if (cells.station) {
    const c = cells.station;
    const L = c.z1 - c.z0 - 8 - 18;
    const signZ = c.cz + L / 2 + 4.5;
    push({
      id: 'station-board',
      kind: 'sign',
      x: c.cx,
      y: base,
      z: signZ + 5,
      label: 'Check the Line 4 departures',
      title: 'FLOODWORKS TRANSIT — LINE 4',
      body:
        'The board has power and no destinations. The route glass behind it ' +
        'shows one more line than the city ever published.',
    });
  }

  // --- Underarchive: missing-person wall ---------------------------------
  if (cells.archive) {
    const c = cells.archive;
    const L = c.z1 - c.z0 - 6 - 32;
    const wallZ = c.cz - L / 2 - 4.5;
    push({
      id: 'archive-notices',
      kind: 'note',
      x: c.cx,
      y: base,
      z: wallZ - 6, // north side of the support wall, on the plaza
      label: 'Examine the missing-person notices',
      title: 'UNDERARCHIVE PERIMETER — NOTICES',
      body:
        'Sixty-two sheets, all filed this month. Eleven of them are the same ' +
        'face under different names, and none has a follow-up date.',
    });
  }

  // --- Verdant garden: conservatory plaque -------------------------------
  if (cells.garden) {
    const c = cells.garden;
    push({
      id: 'garden-plaque',
      kind: 'note',
      x: c.cx + 3.5,
      y: base,
      z: c.cz - 14, // on the cross path, beside the dome
      label: 'Read the conservatory plaque',
      title: 'VERDANT WARD CONSERVATORY — PLAQUE',
      body:
        '"…in memory of those who walked here last summer." The name list ' +
        'underneath has been sanded smooth, recently.',
    });
  }

  // --- Canal pump valve (prop is placed by the world builder) ------------
  const b = layout.canal.bridges ?? [];
  if (b.length >= 2) {
    const vx = (b[0] + b[1]) / 2;
    const vz = layout.canal.z - layout.halfRoad - 4;
    push({
      id: 'canal-valve',
      kind: 'door',
      x: vx,
      y: base,
      z: vz,
      label: 'Examine the canal pump valve',
      title: 'CANAL PUMP VALVE — MANUAL OVERRIDE',
      body:
        'Cemented in the open position. The overflow was routed here by hand, ' +
        'and the wheel is still warm.',
      prop: { type: 'valve', scale: 1.4, ry: 0, color: 0x7a8a94 },
    });
  }

  return list;
}

/**
 * Proximity helper: nearest interactable within its radius of a world point.
 * Returns null when nothing is close enough to prompt.
 */
export function nearestInteractable(list, x, y, z) {
  let best = null;
  let bestD = Infinity;
  for (const it of list) {
    const dx = x - it.x;
    const dy = y + 0.9 - (it.y + 0.9);
    const dz = z - it.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > it.radius) continue;
    if (Math.abs(dy) > 3.5) continue;
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  }
  return best;
}
