/**
 * Phase 4 — what the city's people say.
 *
 * Short, grounded lines; no plot exposition. The memory tie-in runs in both
 * directions: a few lines change once particular fragments are recorded
 * (the courier opens up about the tower once you have seen floor 40 run),
 * and a suspicious agent answers differently than a calm one — so talking to
 * someone who has been watching you *feels* like a consequence.
 */

const CIVILIAN_LINES = [
  'Rain like this washes the canal clean. Almost. Ask me again in the dry season.',
  "You're from the other side of the water — you walk like it.",
  "The lamps on the bank never go out. Nobody'll say who pays the meter.",
  'Third night running the tower lift runs empty at 23:40. I hear it from my window.',
  'Mind the sealed square. The wardens count heads, and they remember the count.',
];

const VENDOR_LINE =
  'Charter says I can refuse anyone. Charter says a lot of things. What do you want?';
const VENDOR_LINE_MEMORY =
  'You are the one asking about the ledger. Keep your voice down — that trader ' +
  'still walks this row, and he counts his friends by the week.';

const GUARD_LINE = 'Move along. This block is watched, and you are lingering.';
const GUARD_LINE_MEMORY =
  "If it is the canal service door you want, forget it. Archive order — sealed " +
  'before I was posted here, and sealed by people who still count the hours.';
const GUARD_ALERTED =
  'You again. Hands where I can see them — no more of that glove business in ' +
  'the open. State your name or state your business.';

const TARGET_LINE = 'Do I know you? No. Then we are done here.';
const TARGET_LINE_MEMORY =
  'You have been up the tower. Floor 40, was it? Then you know why I carry ' +
  'crates with no manifest, and you know better than to ask me to stop.';

/**
 * @param {{id:string, type:string, name:string}} agent
 * @param {{has:(id:string)=>boolean}} memories
 * @param {{aware?:boolean}} opts — the agent is currently suspicious of you
 */
export function lineFor(agent, memories, { aware = false } = {}) {
  const title = `${agent.name.toUpperCase()} — SPEAKING`;
  const has = (id) => !!memories?.has?.(id);
  let body;

  switch (agent.type) {
    case 'guard':
      if (aware) body = GUARD_ALERTED;
      else if (has('mem-archive-seal')) body = GUARD_LINE_MEMORY;
      else body = GUARD_LINE;
      break;
    case 'vendor':
      body = has('mem-market-bargain') ? VENDOR_LINE_MEMORY : VENDOR_LINE;
      break;
    case 'target':
      body = has('mem-tower-elevator') ? TARGET_LINE_MEMORY : TARGET_LINE;
      break;
    default: {
      // civilians: pick a variant deterministically per agent so a given
      // passer-by always tells you the same thing
      const i = Math.abs(hash(agent.id)) % CIVILIAN_LINES.length;
      body = CIVILIAN_LINES[i];
      break;
    }
  }

  return { title, body };
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}
