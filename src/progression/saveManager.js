/**
 * SaveManager — the Phase 6 checkpoint document.
 *
 * One key (`mt.save.v1`) holds a *point-in-time snapshot* of every progress
 * system: memories, discovery, upgrades, player position and the
 * world seed. The live systems keep persisting to their own keys as before
 * (the memory mechanic's behaviour is untouched); Save writes the checkpoint,
 * Load rolls everything back to it, New Game erases it — always with the
 * player's deliberate confirmation handled by the pause menu.
 *
 * Safety rules:
 *   - missing file   → status 'missing' (start fresh, no error)
 *   - unparseable    → status 'corrupt' (refuse to touch live state)
 *   - older version  → status 'outdated' (refuse to guess a migration)
 *   - newer version  → status 'future'   (never half-load an unknown schema)
 *   - every field is coerced/clamped through validateDoc — a malformed
 *     document can degrade a field to a default, never crash the frame.
 *
 * Data only, no DOM: the pause menu triggers it, main.js wires it.
 */

import { FRAGMENT_BY_ID } from '../memories/fragments.js';
import { UPGRADE_BY_ID } from './upgrades.js';

export const SAVE_KEY = 'mt.save.v1';
export const SAVE_VERSION = 1;

/** Every localStorage key a "new game" clears (accessibility prefs survive).
 * 'mt.story.v1' is a legacy key from the removed story layer — still cleared
 * so old installs reset to a truly fresh profile. */
export const PROGRESS_KEYS = [SAVE_KEY, 'mt.memories.v1', 'mt.story.v1', 'mt.progress.v1', 'mt.discovery.v1'];

const MAX_STR = 512;
const MAX_LIST = 500;
const MAX_POS = 2000; // world half-extent is ≤ 800 m — anything beyond is bogus

const str = (v, fallback = '') => (typeof v === 'string' ? v.slice(0, MAX_STR) : fallback);
const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, MAX_LIST) : []);
const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);

function clampPos(v, fallback = null) {
  return Number.isFinite(v) && Math.abs(v) <= MAX_POS ? v : fallback;
}

/**
 * Coerce a raw document into a known-good one. Never throws.
 * @returns {{ok:boolean, doc?:object, issues:string[]}}
 */
export function validateDoc(raw) {
  const issues = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, issues: ['not an object'] };
  if (!Number.isFinite(raw.v)) return { ok: false, issues: ['missing version'] };

  // ---- memories (same shape MemoryManager stores) ------------------------
  const mem = raw.memories && typeof raw.memories === 'object' ? raw.memories : {};
  const collected = {};
  for (const [id, rec] of Object.entries(mem.collected && typeof mem.collected === 'object' ? mem.collected : {})) {
    if (!FRAGMENT_BY_ID[id]) {
      issues.push(`unknown fragment ${id}`);
      continue;
    }
    collected[id] = { reconstructed: !!(rec && rec.reconstructed) };
  }
  const deductions = {};
  for (const [pair, believed] of Object.entries(mem.deductions && typeof mem.deductions === 'object' ? mem.deductions : {})) {
    if (FRAGMENT_BY_ID[believed]) deductions[str(pair)] = believed;
  }

  // ---- discovery + progression ------------------------------------------
  const disc = raw.discovery && typeof raw.discovery === 'object' ? raw.discovery : {};
  const prog = raw.progression && typeof raw.progression === 'object' ? raw.progression : {};
  const spent = (Array.isArray(prog.spent) ? prog.spent : []).filter((id) => UPGRADE_BY_ID[id]);

  // ---- player position ---------------------------------------------------
  const pl = raw.player && typeof raw.player === 'object' ? raw.player : null;
  const px = pl ? clampPos(pl.x) : null;
  const pz = pl ? clampPos(pl.z) : null;
  const player =
    px === null || pz === null
      ? null
      : { x: px, z: pz, yaw: num(pl.yaw, 0), district: typeof pl.district === 'string' ? pl.district : null };

  const doc = {
    v: SAVE_VERSION,
    savedAt: Number.isFinite(raw.savedAt) ? raw.savedAt : null,
    seed: typeof raw.seed === 'string' ? raw.seed.slice(0, 64) : null,
    player,
    memories: {
      collected,
      deductions,
      abilityUnlocked: !!mem.abilityUnlocked,
      abilitySource: mem.abilitySource ? str(mem.abilitySource) : null,
    },
    discovery: { districts: list(disc.districts), landmarks: list(disc.landmarks) },
    progression: { spent },
  };
  return { ok: true, doc, issues };
}

/**
 * Read + classify the checkpoint.
 * @returns {{status:'ok'|'missing'|'corrupt'|'outdated'|'future', doc?:object, issues?:string[]}}
 */
export function readSave() {
  let raw;
  try {
    raw = window.localStorage?.getItem(SAVE_KEY);
  } catch {
    return { status: 'missing' };
  }
  if (!raw) return { status: 'missing' };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'corrupt' };
  }
  if (!parsed || typeof parsed !== 'object' || !Number.isFinite(parsed.v)) return { status: 'corrupt' };
  if (parsed.v < SAVE_VERSION) return { status: 'outdated' };
  if (parsed.v > SAVE_VERSION) return { status: 'future' };
  const v = validateDoc(parsed);
  if (!v.ok) return { status: 'corrupt', issues: v.issues };
  return { status: 'ok', doc: v.doc, issues: v.issues };
}

/** Build a validated checkpoint document from live system snapshots. */
export function buildSnapshot({ seed, player, memories, discovery, progression, savedAt = Date.now() }) {
  const v = validateDoc({
    v: SAVE_VERSION,
    savedAt,
    seed,
    player,
    memories,
    discovery,
    progression,
  });
  if (!v.ok) return null; // caller reports "could not save" — never writes junk
  return v.doc;
}

/** @returns {{ok:boolean, error?:string}} */
export function writeSave(doc) {
  if (!doc) return { ok: false, error: 'no document' };
  try {
    window.localStorage?.setItem(SAVE_KEY, JSON.stringify(doc));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

export function eraseSave() {
  try {
    window.localStorage?.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** New game: drop every progress key (accessibility prefs are kept). */
export function clearAllProgress() {
  try {
    for (const key of PROGRESS_KEYS) window.localStorage?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Pause-menu status line: does a checkpoint exist, and when was it taken? */
export function saveStatus() {
  const r = readSave();
  return {
    exists: r.status === 'ok',
    status: r.status,
    savedAt: r.status === 'ok' ? r.doc.savedAt : null,
  };
}
