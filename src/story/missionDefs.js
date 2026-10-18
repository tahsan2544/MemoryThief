/**
 * Mission + evidence definitions — pure data, no logic beyond predicates.
 *
 * This file is the reusable half of the mission system: a future chapter is
 * added by writing another MISSIONS entry (and the dialogue that feeds it),
 * never by rewriting code. Each mission declares
 *
 *   startWhen(ctx)   when it becomes available (its start condition)
 *   objectives[]     ordered list; `visible` gates display, `done` derives
 *                    completion from persistent state, `grant` files the
 *                    objective's reward evidence exactly once
 *   completeWhen     the mission's completion condition
 *   rewards          shown in the journal once complete
 *
 * Context (`ctx`) passed to every predicate:
 *   ctx.flag(id)   story flag            ctx.mem(id)   held memory fragment
 *   ctx.obj(id)    an earlier objective's derived state (array order)
 *
 * Evidence granted by a *choice* is filed by the dialogue effect instead of
 * the objective (the reward differs by which line the player picked).
 */

/* --------------------------------------------------------------------- *
 * Evidence — the dossier the case journal records
 * --------------------------------------------------------------------- */

export const EVIDENCE = {
  'ev-hiring': {
    id: 'ev-hiring',
    title: 'Tomas Venn’s commission',
    tag: 'case',
    body:
      'Handwritten, folded to fit a coat pocket: “Find Mira Venn. Records ' +
      'clerk, Underarchive annex. Four nights gone. The ward says she ' +
      'resigned — Mira does not resign.” Signed only with a T.',
  },
  'ev-route': {
    id: 'ev-route',
    title: 'Mira’s route note',
    tag: 'case',
    body:
      'In Mira’s hand, folded twice: “23:10 — night market, coil sleeve. ' +
      '23:30 — Floodworks, last board. 23:52 — Palisade, freight lift.” ' +
      'Every stop she planned that night, written down before she took it.',
  },
  'ev-retainer': {
    id: 'ev-retainer',
    title: 'Ward scrip — the retainer',
    tag: 'case',
    body:
      'One month’s pay, counted out in ward scrip. The date on the note is ' +
      'next week. Neither of you mentioned it. The market trader remembers ' +
      'the same kind of note — dated a month ahead of the calendar.',
  },
  'ev-trader-account': {
    id: 'ev-trader-account',
    title: 'The trader’s account',
    tag: 'account',
    body:
      'Coil sleeve, cash, no face — and ward scrip dated next month, which ' +
      'he argued about at the time. She was alone, he swears. She asked when ' +
      'the night freight runs; he told her nothing runs here.',
  },
  'ev-sighting': {
    id: 'ev-sighting',
    title: 'Last sighting — 23:40, Line 4',
    tag: 'account',
    body:
      'The attendant watched a wet coat ask for a platform at 23:40. The ' +
      'timetables carry no Line 4 at that hour — no Line 4 at any hour. ' +
      '“There was someone behind her in the glass,” the attendant says. ' +
      'Officially, this never happened.',
  },
  'ev-tower-ledger': {
    id: 'ev-tower-ledger',
    title: 'Tower ledger — cut page',
    tag: 'account',
    body:
      'The courier’s torn page: 23:52, freight lift, floor 40 — M. Venn, ' +
      'wearing a ward coat that was never issued to her, no escort. He cut ' +
      'it from the book, and will not admit that to anyone else.',
  },
  'ev-tower-sight': {
    id: 'ev-tower-sight',
    title: 'The courier’s sight',
    tag: 'account',
    body:
      'The courier signs for the lift but does not load it: 23:40, up empty, ' +
      'back down full. He saw a woman in an unissued ward coat cross the ' +
      'lobby like she owned the freight. He never saw her face.',
  },
  'ev-ledger': {
    id: 'ev-ledger',
    title: 'Mira’s ledger — intake audit',
    tag: 'finding',
    body:
      'Four nights of intake rows, copied by hand. Every memory the ' +
      'Underarchive takes is logged — except three rows dated the night of ' +
      'the sealing, which do not exist on any copy she could reach. The ' +
      'notices wall outside carries sixty-two sheets; her ledger counts ' +
      'sixty-two names.',
  },
  'ev-intake': {
    id: 'ev-intake',
    title: 'An intake row with your name',
    tag: 'finding',
    body:
      'Folded into the box lid: an intake line for RIVEN VALE, the date ' +
      'rubbed out, initials that are not the warden’s. Someone logged your ' +
      'memories before you lost them. On the reverse, in Mira’s hand: ' +
      '“If you are reading this, they took mine too. Do not trust the ' +
      'lists. — M”',
  },
  'ev-vigil-note': {
    id: 'ev-vigil-note',
    title: 'The clerk on the Lantern Vigil',
    tag: 'side',
    body:
      'Eleven of them, every quarter, no permit and no record: the ward ' +
      'breaks the vigil up before dawn. The conservatory plaque sanded its ' +
      'name list smooth. Nobody does that for nothing.',
  },
  'ev-eleven-names': {
    id: 'ev-eleven-names',
    title: 'The eleven names',
    tag: 'side',
    body:
      'A copy of the page buried under the conservatory plaque: eleven ' +
      'names, one of them a warden with a torn badge, one a gardener. The ' +
      'vigil happened. The night’s three accounts can finally be weighed ' +
      'against it.',
  },
};

/* --------------------------------------------------------------------- *
 * Missions
 * --------------------------------------------------------------------- */

const TRIO = ['ask-trader', 'last-sighting', 'tower-log'];

export const MISSIONS = [
  {
    id: 'venn-case',
    kind: 'main',
    title: 'THE VENN CASE',
    log:
      'A missing person in Old Quarter. Tomas Venn hires Riven to find his ' +
      'sister Mira, records clerk — gone four nights the ward says nothing ' +
      'about.',
    start: 'Opens on a fresh story: Tomas Venn waits by the night-market charter.',
    startWhen: () => true,
    objectives: [
      {
        id: 'meet-tomas',
        text: 'Meet Tomas Venn at the Old Quarter night market',
        hint: 'South of the gateway arch, by the charter board',
        visible: () => true,
        done: (c) => c.flag('met-tomas'),
        grant: [], // the meeting's reward is choice-dependent (dialogue effect)
      },
      {
        id: 'ask-trader',
        text: 'Ask the night market trader what Mira Venn bought',
        hint: 'Old Quarter — the stalls past the charter',
        visible: (c) => c.flag('met-tomas'),
        done: (c) => c.flag('asked-trader'),
        grant: ['ev-trader-account'],
      },
      {
        id: 'last-sighting',
        text: 'Find the last person who saw her — Floodworks station',
        hint: 'The departure board on the south rim',
        visible: (c) => c.flag('met-tomas'),
        done: (c) => c.flag('asked-attendant'),
        grant: ['ev-sighting'],
      },
      {
        id: 'tower-log',
        text: 'Trace Mira into Palisade Tower',
        hint: 'The courier who signs for crates with no manifest',
        visible: (c) => c.flag('met-tomas'),
        done: (c) => c.flag('tower-traced'),
        grant: [], // choice-dependent: the cut page or the courier's sight
      },
      {
        id: 'annex-key',
        text: 'Get Mira’s work-box key from Tomas',
        hint: 'Bring him all three findings',
        visible: (c) => TRIO.every((id) => c.obj(id)),
        done: (c) => c.flag('annex-key'),
        grant: [],
      },
      {
        id: 'open-cage',
        text: 'Open the records cage in the Floodworks service annex',
        hint: 'Unbar the annex door with the canal-vigil memory first',
        visible: (c) => c.flag('annex-key'),
        done: (c) => c.flag('cage-open'),
        grant: [],
      },
      {
        id: 'read-box',
        text: 'Read Mira’s work box',
        hint: 'Inside the cage',
        visible: (c) => c.flag('cage-open'),
        done: (c) => c.flag('case-closed'),
        grant: ['ev-ledger', 'ev-intake'],
      },
    ],
    completeWhen: (c) => c.flag('case-closed'),
    rewards: ['Records cage access', 'Mira’s ledger', 'The intake row with your name'],
  },

  {
    id: 'third-watch',
    kind: 'side',
    title: 'THE OBSERVANCE',
    log:
      'Optional. A vigil the city does not remember, and a plaque in the ' +
      'Verdant Ward whose name list was sanded smooth.',
    start: 'Available once Tomas Venn’s commission is taken.',
    startWhen: (c) => c.flag('met-tomas'),
    objectives: [
      {
        id: 'ask-clerk',
        text: 'Ask the night clerk who keeps the vigil',
        hint: 'Glassline — the tower lobby directory',
        visible: (c) => c.flag('met-tomas'),
        done: (c) => c.flag('asked-clerk'),
        grant: ['ev-vigil-note'],
      },
      {
        id: 'observance-memory',
        text: 'Recover the conservatory memory (optional)',
        hint: 'Verdant Ward — the plaque by the dome',
        visible: (c) => c.flag('met-tomas'),
        done: (c) => c.mem('mem-garden-observance'),
        grant: ['ev-eleven-names'],
      },
    ],
    completeWhen: (c) => c.flag('asked-clerk') && c.mem('mem-garden-observance'),
    rewards: ['The eleven names — a read on the night’s accounts'],
  },
];

export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));
