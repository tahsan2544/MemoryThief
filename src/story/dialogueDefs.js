/**
 * Dialogue definitions — Phase 5's conversations, as data.
 *
 * `resolveTree(who, ctx)` returns the node to show for a character *given the
 * current story state*, or null when the caller should fall back to the
 * one-line read-outs Phase 3/4 already own (nothing is replaced: before the
 * commission is taken, every character answers exactly as before).
 *
 * Node shape:
 *   { kicker, title, body, onEnter?: effect[], choices?: Choice[] }
 *   Choice = { label, effects?: effect[], reply?: { body, onEnter? } }
 *
 * effects = [{ t:'flag', id } | { t:'evidence', id }] — applied through the
 * runner's onEffect callback (StoryState), so choosing a line can grant
 * different rewards than the other line (the two meaningful choices below).
 */

const E = {
  flag: (id) => ({ t: 'flag', id }),
  ev: (id) => ({ t: 'evidence', id }),
};

const node = (n) => n;

/* --------------------------------------------------------------------- *
 * Tomas Venn — the commissioner (story target)
 * --------------------------------------------------------------------- */

function tomasTree(ctx) {
  const st = ctx.state;

  // ---- the meeting: two choices, two different rewards -------------------
  if (!st.has('met-tomas')) {
    return node({
      id: 'tomas-meeting',
      speaker: 'Tomas Venn',
      kicker: 'CONVERSATION',
      title: 'TOMAS VENN — THE COMMISSION',
      body:
        'Tomas Venn waits by the charter board, turning a ward note over and ' +
        'over. “You’re Vale. My sister is Mira Venn — records clerk at the ' +
        'Underarchive annex. Four nights off the map, and the ward says she ' +
        'resigned.” He stops turning the note. “Mira doesn’t resign. Will you ' +
        'take it?”',
      choices: [
        {
          label: '“I’ll take it. Where did she go?”',
          effects: [E.flag('met-tomas'), E.flag('route-note'), E.ev('ev-hiring'), E.ev('ev-route')],
          reply: {
            body:
              'He hands over her route note, folded twice. “23:10 the market, ' +
              '23:30 the station, 23:52 the tower — she wrote everything down.” ' +
              'He almost smiles. “Find what she wrote, and you’ll find her.”',
          },
        },
        {
          label: '“What’s in it for me?”',
          effects: [E.flag('met-tomas'), E.flag('retainer'), E.ev('ev-hiring'), E.ev('ev-retainer')],
          reply: {
            body:
              '“Fair.” He counts ward scrip into your hand — the note is dated ' +
              'next week, and he pretends not to see you look. “Four nights. ' +
              'Ask around: the market, the station, the tower. That is what ' +
              'you are paid for.”',
          },
        },
      ],
    });
  }

  // ---- choice-B consequence: the route note comes late, but it comes ------
  if (st.has('retainer') && !st.has('route-note') && investigativeDone(ctx) > 0) {
    return node({
      id: 'tomas-route-late',
      speaker: 'Tomas Venn',
      kicker: 'CONVERSATION',
      title: 'TOMAS VENN — MIRA’S ROUTE',
      body:
        '“You are still on it — good.” Tomas takes out Mira’s route note, ' +
        'folded twice, and holds it a moment too long before handing it over. ' +
        '“Market, station, tower. She wrote it down. I should have given you ' +
        'this when you asked.”',
      onEnter: [E.flag('route-note'), E.ev('ev-route')],
    });
  }

  // ---- all three findings in → the key (the locked location opens) --------
  if (investigativeDone(ctx) >= 3 && !st.has('annex-key')) {
    return node({
      id: 'tomas-key',
      speaker: 'Tomas Venn',
      kicker: 'CONVERSATION',
      title: 'TOMAS VENN — THE WORK BOX',
      body:
        'Tomas goes quiet for the length of a canal boat. “The market. The ' +
        'station. The tower — you have walked her whole week.” He drops a key ' +
        'into your hand. “One place left: her work box, in the records cage of ' +
        'the Floodworks service annex. The ward sealed it.” You ask what is ' +
        'inside. “Her work. Her words. She said the box would talk louder ' +
        'than the ward ever could.” A beat. “The canal-walk door bars itself ' +
        '— the lantern vigil memory shows who left it unbarred. Reconstruct ' +
        'that, then use the key.”',
      onEnter: [E.flag('annex-key')],
    });
  }

  // ---- closing states -----------------------------------------------------
  if (st.has('case-closed')) {
    const warm = st.has('route-note');
    const names = st.has('ev-eleven-names');
    return node({
      id: 'tomas-closed',
      speaker: 'Tomas Venn',
      kicker: 'CONVERSATION',
      title: 'TOMAS VENN — AFTER THE BOX',
      body:
        (warm
          ? '“Mira left a trail on purpose.” Tomas reads the ledger page ' +
            'twice, the way you read a name you hoped to see. “Thank you, Vale.”'
          : '“You found the trail.” He folds the retainer away. “You were ' +
            'paid to.” A pause, longer than the street. “…Thank you.”') +
        (names
          ? ' He looks up. “The names under the plaque — I read your copy. ' +
            'Mira’s is not among them. Good.”'
          : ''),
    });
  }

  if (st.has('annex-key')) {
    return node({
      id: 'tomas-post-key',
      speaker: 'Tomas Venn',
      kicker: 'CONVERSATION',
      title: 'TOMAS VENN — WAITING',
      body: st.has('cage-open')
        ? '“You are in. Read it — then come back and tell me she is alive.”'
        : '“The canal walk. The key answers to that cage now; the vigil ' +
          'memory opens the door ahead of you.”',
    });
  }

  // ---- mid-investigation status (delayed / repeated actions stay useful) --
  const missing = [];
  if (!ctx.obj('ask-trader')) missing.push('the market trader');
  if (!ctx.obj('last-sighting')) missing.push('the station attendant');
  if (!ctx.obj('tower-log')) missing.push('the tower courier');
  return node({
    id: 'tomas-mid',
    speaker: 'Tomas Venn',
    kicker: 'CONVERSATION',
    title: 'TOMAS VENN — WHERE THINGS STAND',
    body:
      'Tomas nods at the street like it owes him something. “Anything?”' +
      (missing.length
        ? ' Not yet, then. ' +
          missing
            .map((m, i) => (i === 0 ? m.charAt(0).toUpperCase() + m.slice(1) : m))
            .join(', ') +
          ' — start anywhere. She was not hiding; she was checking.'
        : ''),
  });
}

function investigativeDone(ctx) {
  return ['ask-trader', 'last-sighting', 'tower-log'].filter((id) => ctx.obj(id)).length;
}

/* --------------------------------------------------------------------- *
 * Memory-source NPCs — mission talk layered on the Phase 3 read-outs
 * --------------------------------------------------------------------- */

function sourceTree(who, ctx) {
  const st = ctx.state;
  if (!st.has('met-tomas')) return null; // pre-commission: exact legacy behaviour
  const legacy = who.legacy ?? '';

  const asks = {
    'src-market-trader': {
      pendingFlag: 'asked-trader',
      question: '“Different question: a woman named Mira Venn. What did she buy?”',
      reply:
        'The shutter comes down a hand’s width. “Coil sleeve. Cash. Ward ' +
        'scrip dated next month — I argued about the date and she laughed.” ' +
        'He watches the street instead of you. “She was alone, if you are ' +
        'going to ask that. And she asked when the night freight runs. I told ' +
        'her nothing runs here.”',
    },
    'src-station-attendant': {
      pendingFlag: 'asked-attendant',
      question: '“Mira Venn. You had the late board — did she pass through?”',
      reply:
        'The attendant looks at the board she is not reading. “23:40. Wet ' +
        'coat, asking for a platform. I told her the line is closed.” A ' +
        'pause. “She pointed at the board and said, ‘It says otherwise.’ And ' +
        'there was someone — behind her, in the glass. Three seconds. That is ' +
        'all I gave it.”',
    },
    'src-glassline-clerk': {
      pendingFlag: 'asked-clerk',
      question: '“Who keeps a vigil the city does not remember?”',
      reply:
        'The clerk stacks the key trays without looking up. “The lantern ' +
        'vigil. Canal walk, lamps, eleven of them, every quarter — no permit, ' +
        'no record, and the ward breaks it up before dawn.” They finally meet ' +
        'your eyes. “Conservatory, if you want the names. Nobody sands a ' +
        'plaque for nothing.”',
    },
  };

  const ask = asks[who.id];
  if (!ask) return null; // an NPC the case does not concern keeps its lines
  if (st.has(ask.pendingFlag)) {
    // asked already: the Phase 3/4 content stays exactly where it was
    return { id: `${who.id}-asked`, speaker: who.name, kicker: 'CONVERSATION', title: `${who.name.toUpperCase()} — SPEAKING`, body: legacy };
  }

  return node({
    id: `${who.id}-venn`,
    speaker: who.name,
    kicker: 'CONVERSATION',
    title: `${who.name.toUpperCase()} — SPEAKING`,
    body: legacy,
    choices: [
      {
        label: ask.question,
        effects: [E.flag(ask.pendingFlag)],
        reply: { body: ask.reply },
      },
      { label: '“Never mind.”', effects: [], reply: null }, // walk away
    ],
  });
}

/* --------------------------------------------------------------------- *
 * Living-city agents (the palisade courier)
 * --------------------------------------------------------------------- */

function agentTree(who, ctx) {
  const st = ctx.state;
  if (who.type !== 'target' || !st.has('met-tomas')) return null;
  const legacy = who.legacy ?? '';

  if (st.has('courier-cold')) {
    return node({
      id: 'courier-cold',
      speaker: who.name,
      kicker: 'CONVERSATION',
      title: `${who.name.toUpperCase()} — SPEAKING`,
      body:
        'The courier turns his crate to make a wall of it. “The page. You ' +
        'have the page. Don’t come back here.”',
    });
  }

  if (st.has('tower-traced')) {
    return node({
      id: 'courier-followup',
      speaker: who.name,
      kicker: 'CONVERSATION',
      title: `${who.name.toUpperCase()} — SPEAKING`,
      body:
        legacy +
        ' He nods as you come level with the crate. “Still 23:40. The lift ' +
        'goes up empty and comes back down like it ate something.”',
    });
  }

  return node({
    id: 'courier-ask',
    speaker: who.name,
    kicker: 'CONVERSATION',
    title: `${who.name.toUpperCase()} — SPEAKING`,
    body: legacy,
    choices: [
      {
        label: '“Straight answer: I’m asking about Mira Venn, for her brother.”',
        effects: [E.flag('tower-traced'), E.flag('courier-cold'), E.ev('ev-tower-ledger')],
        reply: {
          body:
            'The courier’s grip goes white on the strap. “23:52, freight ' +
            'lift, floor 40 — M. Venn, in a ward coat that was never issued ' +
            'to her. No escort.” He tears the page out and presses it at you. ' +
            '“Take it. Don’t tell them I cut it — and don’t come back here.”',
        },
      },
      {
        label: '“Easy. I’m tracing a delivery, not a person.”',
        effects: [E.flag('tower-traced'), E.flag('courier-open'), E.ev('ev-tower-sight')],
        reply: {
          body:
            'The courier relaxes a fraction. “23:40, up empty, down full — I ' +
            'sign for it, I don’t load it. A woman in an unissued ward coat ' +
            'crossed the lobby like she owned the freight.” He shrugs. “That ' +
            'is the whole delivery.”',
        },
      },
    ],
  });
}

/* --------------------------------------------------------------------- *
 * The finale — Mira’s work box (locked location payoff)
 * --------------------------------------------------------------------- */

export function workboxNode(ctx) {
  const st = ctx.state;
  const has = (id) => st.has(id) || ctx.mem?.(id);
  return node({
    id: 'mira-workbox',
    speaker: 'Mira’s work box',
    kicker: 'DISCOVERY',
    title: 'RECORDS CAGE — MIRA’S WORK BOX',
    body:
      'The cage answers to Tomas’s key. Inside: a records box — unsealed, ' +
      'lamp-warm, and Mira’s hand all over it.\n\n' +
      'Four nights of intake rows, copied by hand. Every memory the ' +
      'Underarchive takes is logged — except three, dated the night of the ' +
      'sealing, which exist on no copy she could reach. The notices wall ' +
      'outside carries sixty-two sheets. Her ledger counts sixty-two names.\n\n' +
      (has('ev-eleven-names')
        ? 'A loose page: eleven names from under the conservatory plaque — one ' +
          'of them a warden with a torn badge. The vigil, the flood, the ' +
          'sealing: one night, three stories, and this page is the only one ' +
          'nobody wrote down.\n\n'
        : '') +
      'Last, folded into the lid: an intake line for RIVEN VALE, the date ' +
      'rubbed out, initials that are not the warden’s. Someone logged your ' +
      'memories before you lost them. On the reverse: “If you are reading ' +
      'this, they took mine too. Do not trust the lists. — M”\n\n' +
      'Behind you the annex door stands open on the canal walk. Somewhere ' +
      'above the city, at 23:40, a lift goes up empty.',
    onEnter: [E.flag('case-closed')],
  });
}

/* --------------------------------------------------------------------- *
 * Entry point
 * --------------------------------------------------------------------- */

/**
 * @param {{kind:'story'|'source'|'agent', id:string, name?:string, type?:string, legacy?:string}} who
 * @param {{state:object, memories:object, obj:(id:string)=>boolean}} ctx
 * @returns {object|null} the dialogue node, or null → caller's legacy line
 */
export function resolveTree(who, ctx) {
  if (who.kind === 'story') return tomasTree(ctx);
  if (who.kind === 'source') return sourceTree(who, ctx);
  if (who.kind === 'agent') return agentTree(who, ctx);
  return null;
}
