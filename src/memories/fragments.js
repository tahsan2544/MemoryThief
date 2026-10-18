/**
 * Memory fragments — the data behind the extraction mechanic.
 *
 * A fragment is NOT a collectible token: it is a recorded moment with a
 * source, a point of view, and a reliability problem. Each entry carries
 *
 *   - identity     id / title / source / district
 *   - recorded     what the fragment actually shows Riven
 *   - clues        the discrete facts a player can weigh
 *   - reliability  'stable' | 'suspect' | 'manipulated' + why
 *   - contradiction an optional incompatibility with another fragment
 *   - effect       the glove's visual signature while extracting
 *   - reconstruction the ghost scene played back at the recording site
 *   - consequences what holding (and replaying) it changes in the world
 *
 * Reconstruction positions are LOCAL OFFSETS from the source, so any seed
 * produces a scene that stands in the right place next to its own geometry.
 */

export const FRAGMENTS = [
  /* ------------------------------------------------------------------ *
   * 1. Floodworks — the canal valve (object)
   * ------------------------------------------------------------------ */
  {
    id: 'mem-lantern-vigil',
    title: 'THE LANTERN VIGIL',
    sourceId: 'src-canal-valve',
    sourceName: 'Canal pump valve',
    sourceType: 'object',
    district: 'floodworks',
    effect: 'shimmer',
    tint: 0x8fb6ff,
    recorded:
      'Rain on hot metal. A hand — not Riven’s, not the gloved hand from the ' +
      'other fragments — turns the override wheel while the canal lamps are ' +
      'still burning. The water comes up the walkway in four minutes, and the ' +
      'lamps never go out. Someone wanted the flood lit.',
    clues: [
      'The wheel was turned from the north walkway, against its cemented position.',
      'A second set of handprints dries on the rail — smaller, deliberate.',
      'The flood arrived in four minutes: the gate was opened wide, not throttled.',
    ],
    reliability: 'suspect',
    reliabilityNote:
      'The fragment ends before the turn is finished. Whoever recorded it ' +
      'looked away at the exact moment that mattered.',
    contradiction: null,
    reconstruction: {
      sound: 'drone',
      distortion: 'flicker',
      fog: { color: 0x16324a, density: 0.0021 },
      reveal:
        'The wheel turns on its own for half a revolution — then a shadow ' +
        'steps out of the lamp glow and steadies it. The shadow is wearing a ' +
        'ward-issue coat with the badge torn off.',
      actors: [
        { dx: 1.6, dz: -2.2, yaw: 2.4, pose: 'reach', tint: 0xa8c4ff },
        { dx: -3.4, dz: -1.0, yaw: 0.7, pose: 'still', tint: 0x6f86b8 },
      ],
      panels: [
        { dx: -6, dz: -4, w: 7, h: 2.6, y: 0, tint: 0x4d7fbf, opacity: 0.16 },
        { dx: 2.5, dz: -5.5, w: 0.14, h: 3.4, y: 0, tint: 0xbfd8ff, opacity: 0.22 },
      ],
    },
    consequences: [
      {
        kind: 'door',
        target: 'canal-service-door',
        note:
          'A service door on the Floodworks canal walk unlocks — the shadow ' +
          'left it unbarred.',
      },
    ],
  },

  /* ------------------------------------------------------------------ *
   * 2. Floodworks — the station attendant (NPC)
   * ------------------------------------------------------------------ */
  {
    id: 'mem-station-last-look',
    title: 'THE LAST LOOK',
    sourceId: 'src-station-attendant',
    sourceName: 'Station attendant',
    sourceType: 'npc',
    district: 'floodworks',
    effect: 'pulse',
    tint: 0x7fd8e8,
    recorded:
      'The attendant remembers a platform, three seconds long. A coat, wet ' +
      'through, facing the departure board. The board reads 23:40. No service ' +
      'runs Line 4 at 23:40 — the attendant knows this, and remembers knowing ' +
      'it, and still watched the figure wait.',
    clues: [
      'The departure board read 23:40 during the three-second glance.',
      'The figure’s coat was wet from the flood, not the rain.',
      'The attendant’s memory holds no train, no announcement, no other passengers.',
    ],
    reliability: 'suspect',
    reliabilityNote:
      'A three-second memory is honest about its length, but three seconds ' +
      'cannot hold a whole platform. Something is cropped here.',
    contradiction: {
      with: 'mem-archive-seal',
      detail:
        'Both fragments fix an event at 23:40: the attendant sees the figure ' +
        'on the platform, the warden seals the archive around someone inside. ' +
        'One of these memories has the wrong minute — or the right one.',
    },
    reconstruction: {
      sound: 'chime',
      distortion: 'stutter',
      fog: { color: 0x123a44, density: 0.0024 },
      reveal:
        'The board flips one line: 23:40 becomes 23:04, and the figure turns ' +
        'its head exactly as the fragment cuts out. The attendant was watching ' +
        'a reflection in the board glass.',
      actors: [
        { dx: 0.4, dz: -4.6, yaw: 3.0, pose: 'still', tint: 0x9fe4f2 },
        { dx: -2.2, dz: -7.2, yaw: 0.2, pose: 'turn', tint: 0x5f8fa0 },
      ],
      panels: [
        { dx: 0.2, dz: -7.8, w: 4.2, h: 1.7, y: 1.5, tint: 0x8fe8ff, opacity: 0.24 },
        { dx: -5, dz: -6, w: 0.12, h: 2.4, y: 0, tint: 0x6fb9c8, opacity: 0.14 },
        { dx: 5, dz: -6, w: 0.12, h: 2.4, y: 0, tint: 0x6fb9c8, opacity: 0.14 },
      ],
    },
    consequences: [
      {
        kind: 'clue',
        target: 'station-board',
        note:
          'The Line 4 board is now worth a second look: 23:40 is not a ' +
          'timetable entry, it is a reflection.',
      },
      { kind: 'contradiction', with: 'mem-archive-seal' },
    ],
  },

  /* ------------------------------------------------------------------ *
   * 3. Old Quarter — the market trader (NPC)
   * ------------------------------------------------------------------ */
  {
    id: 'mem-market-bargain',
    title: 'SOLD ONCE, BOUGHT TWICE',
    sourceId: 'src-market-trader',
    sourceName: 'Night market trader',
    sourceType: 'npc',
    district: 'oldquarter',
    effect: 'flicker',
    tint: 0xffb46b,
    recorded:
      'A stall, late. A memory coil changes hands twice in the same minute ' +
      'for the same price, to the same buyer. The trader’s own hand comes up ' +
      'to take the second payment — and the hand is Riven’s gloved hand, ' +
      'rewritten into the memory where it does not belong.',
    clues: [
      'The coil was sold twice: one sale recorded, one sale hidden.',
      'A violet-gloved hand appears in the trader’s memory but not in the stall.',
      'The second payment was made in ward scrip dated next month.',
    ],
    reliability: 'manipulated',
    reliabilityNote:
      'This memory has been edited, badly and recently. The gloved hand was ' +
      'pasted in to implicate Riven — which means someone expected this ' +
      'fragment to be found.',
    contradiction: null,
    reconstruction: {
      sound: 'count',
      distortion: 'scrub',
      fog: { color: 0x3a2416, density: 0.0026 },
      reveal:
        'Play it back and the paste-work shows: the trader’s hands sell the ' +
        'coil once. The second sale is a projection thrown from a hooded ' +
        'figure across the stall — and the figure is copying Riven’s glove, ' +
        'frame by frame, badly.',
      actors: [
        { dx: 0.2, dz: -2.8, yaw: 0.1, pose: 'still', tint: 0xffcf9a },
        { dx: -1.9, dz: -3.1, yaw: 1.2, pose: 'reach', tint: 0xd98f4d },
        { dx: 2.4, dz: -3.4, yaw: -1.1, pose: 'turn', tint: 0x7a5bff },
      ],
      panels: [
        { dx: 0, dz: -3.6, w: 3.4, h: 1.1, y: 0.9, tint: 0xffb066, opacity: 0.2 },
        { dx: 0, dz: -3.6, w: 3.6, h: 0.1, y: 2.4, tint: 0xff9a4d, opacity: 0.16 },
      ],
    },
    consequences: [
      {
        kind: 'dialogue',
        target: 'src-market-trader',
        note:
          'The trader will talk about the second sale — carefully, and with ' +
          'the stall shutter down.',
        line:
          '"You saw it too, then." The trader weighs your glove, and decides ' +
          'you are the wrong kind of trouble. "The second buyer never existed. ' +
          'Someone pasted him in — same violet light as that hand of yours. ' +
          'I sold one coil that night. Whoever bought it twice is building ' +
          'an alibi out of my memory." They name the price: ward scrip, dated ' +
          'next month, the same note the archive pays its wardens in.',
      },
    ],
  },

  /* ------------------------------------------------------------------ *
   * 4. Glassline — the tower directory (object)
   * ------------------------------------------------------------------ */
  {
    id: 'mem-tower-elevator',
    title: 'FORTY, PRESSED TWICE',
    sourceId: 'src-tower-directory',
    sourceName: 'Palisade Tower directory',
    sourceType: 'object',
    district: 'glassline',
    effect: 'warp',
    tint: 0xb9c6ff,
    recorded:
      'The lobby is empty and the directory panel is live. A finger presses ' +
      'the scratched-out button for floor 40. It registers twice, though it is ' +
      'only pressed once. The lift arrives from above — lifts do not arrive ' +
      'from above.',
    clues: [
      'Floor 40 is scratched out of the directory but wired into the panel.',
      'The button logged two presses from one touch.',
      'The lift came down from a floor the building does not list.',
    ],
    reliability: 'stable',
    reliabilityNote:
      'The recorder stood still and let the panel record itself. Little has ' +
      'been cropped, but a lobby empty at that hour is its own omission.',
    contradiction: null,
    reconstruction: {
      sound: 'drone',
      distortion: 'warp',
      fog: { color: 0x1a2140, density: 0.0022 },
      reveal:
        'The lift interior is a memory archive in miniature — shelves where ' +
        'the mirror should be — and someone is standing in it, facing the ' +
        'wall, wearing a coat with a torn badge.',
      actors: [
        { dx: 1.1, dz: -3.2, yaw: 3.14, pose: 'reach', tint: 0xcfd8ff },
        { dx: 0, dz: -6.4, yaw: 0, pose: 'still', tint: 0x8fa0e8 },
      ],
      panels: [
        { dx: 0, dz: -6.9, w: 2.2, h: 2.5, y: 0, tint: 0xc9d4ff, opacity: 0.2 },
        { dx: 0, dz: -4.0, w: 0.9, h: 2.2, y: 0, tint: 0x9fb0ff, opacity: 0.26 },
      ],
    },
    consequences: [
      {
        kind: 'dialogue',
        target: 'src-glassline-clerk',
        note:
          'The night clerk will admit what runs the lift — if you already ' +
          'know to ask about floor 40.',
        line:
          'The clerk checks the empty lobby twice before answering. "Floor 40 ' +
          'is not a floor, it is a *shelf*." The lift serves the archive, they ' +
          'say — the Underarchive logs its sealed memories as freight, and ' +
          'Palisade Tower is the freight entrance. "Every night at 23:40 it ' +
          'goes up empty and comes back down full. I stopped asking what ' +
          'carries it." They will not say how they know the minute.',
      },
    ],
  },

  /* ------------------------------------------------------------------ *
   * 5. Verdant Ward — the conservatory plaque (object)
   * ------------------------------------------------------------------ */
  {
    id: 'mem-garden-observance',
    title: 'THE OBSERVANCE',
    sourceId: 'src-garden-plaque',
    sourceName: 'Conservatory plaque',
    sourceType: 'object',
    district: 'verdant',
    effect: 'drift',
    tint: 0x9fe8b8,
    recorded:
      'A gardener works after closing, turning soil under the plaque, and ' +
      'ties a red thread to its edge. The memory is filmed from behind the ' +
      'gardener’s shoulder and never shows a face — not even in the glass ' +
      'of the dome.',
    clues: [
      'Soil was turned beneath the plaque after the conservatory closed.',
      'A red thread marks the spot; the plaque list was sanded to hide it.',
      'The memory avoids every reflective surface it passes.',
    ],
    reliability: 'suspect',
    reliabilityNote:
      'A memory that ducks mirrors is a memory hiding its recorder. Assume ' +
      'the gardener is in the frame somewhere you were not shown.',
    contradiction: null,
    reconstruction: {
      sound: 'chime',
      distortion: 'drift',
      fog: { color: 0x14321f, density: 0.002 },
      reveal:
        'The gardener lifts a sealed coffer from the turned soil. Under the ' +
        'dome glass, for one frame, their reflection has no face at all — ' +
        'and the coffer is stamped with the archive seal.',
      actors: [
        { dx: 0.3, dz: -1.8, yaw: 2.9, pose: 'reach', tint: 0xc8f5d8 },
        { dx: -1.4, dz: -2.4, yaw: 1.4, pose: 'still', tint: 0x6fae86 },
      ],
      panels: [
        { dx: 0, dz: -5.2, w: 9, h: 4.4, y: 0, tint: 0x7fd8a0, opacity: 0.1 },
        { dx: 0.3, dz: -1.2, w: 0.7, h: 0.5, y: 0.2, tint: 0xff8080, opacity: 0.3 },
      ],
    },
    consequences: [
      {
        kind: 'clue',
        target: 'garden-plaque',
        note:
          'The plaque is now marked: something is buried directly beneath it.',
      },
    ],
  },

  /* ------------------------------------------------------------------ *
   * 6. Underarchive — the warden (NPC)
   * ------------------------------------------------------------------ */
  {
    id: 'mem-archive-seal',
    title: 'THE SEALING',
    sourceId: 'src-archive-warden',
    sourceName: 'Underarchive warden',
    sourceType: 'npc',
    district: 'underarchive',
    effect: 'scrub',
    tint: 0xff6b7a,
    recorded:
      'The warden turns the archive lock twice. A count comes from inside ' +
      'the sealed dark — patient, unhurried, matching each turn of the key. ' +
      'The warden’s own face has been scrubbed out of the memory, not by ' +
      'Riven’s glove: by the archive itself.',
    clues: [
      'The lock was turned twice; a single turn seals the archive.',
      'The count came from inside, in time with the key.',
      'The face scrub is archival, not human — the memory was edited by the system it came from.',
    ],
    reliability: 'manipulated',
    reliabilityNote:
      'This fragment was altered by the archive’s own machinery. The count ' +
      'is likely real; the rest may be what the archive wants believed.',
    contradiction: {
      with: 'mem-station-last-look',
      detail:
        'The sealing is recorded at 23:40, the same minute the attendant ' +
        'places the figure on the platform. Both cannot hold.',
    },
    reconstruction: {
      sound: 'count',
      distortion: 'scrub',
      fog: { color: 0x2a0e14, density: 0.003 },
      reveal:
        'The count is a person: seven turns in, a voice from inside says ' +
        '“nine, ten” — ahead of the key. Whatever is sealed in the ' +
        'Underarchive is keeping its own time, and it knows the ending.',
      actors: [
        { dx: 0.8, dz: -2.6, yaw: 3.0, pose: 'reach', tint: 0xff9aa6 },
        { dx: -0.4, dz: -6.2, yaw: 0.1, pose: 'still', tint: 0xb0404f },
      ],
      panels: [
        { dx: 0, dz: -7.2, w: 3.2, h: 3.6, y: 0, tint: 0xff5f70, opacity: 0.18 },
        { dx: -3.4, dz: -7.2, w: 0.12, h: 3.6, y: 0, tint: 0xff8f9a, opacity: 0.24 },
        { dx: 3.4, dz: -7.2, w: 0.12, h: 3.6, y: 0, tint: 0xff8f9a, opacity: 0.24 },
      ],
    },
    consequences: [
      {
        kind: 'ability',
        target: 'resonance',
        note: 'Resonance Sight unlocks: press V to trace echoes through walls.',
      },
      { kind: 'contradiction', with: 'mem-station-last-look' },
    ],
  },
];

/** id → fragment, for O(1) lookups. */
export const FRAGMENT_BY_ID = Object.fromEntries(FRAGMENTS.map((f) => [f.id, f]));

/** All fragments sourced from one site id (sites and fragments pair 1:1 here). */
export function fragmentForSource(sourceId) {
  return FRAGMENTS.find((f) => f.sourceId === sourceId) ?? null;
}

/** Both sides of every contradiction pair, de-duplicated. */
export function contradictionPairs() {
  const seen = new Set();
  const pairs = [];
  for (const f of FRAGMENTS) {
    if (!f.contradiction) continue;
    const key = [f.id, f.contradiction.with].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ id: key, a: f.id, b: f.contradiction.with, detail: f.contradiction.detail });
  }
  return pairs;
}

export const RECONSTRUCTION_DURATION = 9; // seconds, wall clock
export const EXTRACTION_DURATION = 1.3; // seconds, wall clock
export const EXTRACTION_COOLDOWN = 3.5; // seconds between glove uses
