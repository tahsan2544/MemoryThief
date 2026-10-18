/**
 * Phase 5 story probe — plays the Venn case from beginning to end in headless
 * Edge, printing PASS/FAIL per step. Focused on the mission/dialogue system;
 * run scripts/smoke.mjs for the full suite.
 *
 *   node scripts/probe-story.mjs
 *
 * Env: SMOKE_URL / SMOKE_OUT (probe/) / SMOKE_SEED (eidolon-77)
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const BASE_URL = process.env.SMOKE_URL ?? 'http://127.0.0.1:6030';
const OUT_DIR = resolve(root, process.env.SMOKE_OUT ?? 'probe');
const SEED = process.env.SMOKE_SEED ?? 'eidolon-77';
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;
let fail = 0;
const errors = [];
function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`[story]   ok   ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    fail++;
    errors.push(name + (detail ? ' — ' + detail : ''));
    console.log(`[story]   FAIL ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return true;
    } catch {}
    await sleep(400);
  }
  return false;
}

async function main() {
  const puppeteerMod = await import('puppeteer-core').catch(() => null);
  if (!puppeteerMod || !EDGE) {
    console.error('[story] need puppeteer-core + Edge');
    process.exit(2);
  }
  const puppeteer = puppeteerMod.default;
  mkdirSync(OUT_DIR, { recursive: true });

  let server = null;
  if (!(await waitForServer(BASE_URL, 1500))) {
    server = spawn('npx', ['vite', '--port', '6030', '--strictPort'], {
      cwd: root, shell: true, stdio: 'ignore',
    });
    if (!(await waitForServer(BASE_URL, 90000))) {
      console.error('[story] dev server failed to start');
      process.exit(2);
    }
  }

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    defaultViewport: { width: 960, height: 640 },
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => {
    pageErrors.push(e.message);
    console.log(`[story]   !! pageerror: ${String(e.message).slice(0, 200)}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') {
      pageErrors.push(m.text());
      console.log(`[story]   !! console: ${m.text().slice(0, 200)}`);
    }
  });

  const url = `${BASE_URL}/?seed=${encodeURIComponent(SEED)}&quality=medium&grid=12`;
  console.log(`[story] loading ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__MT_READY__ === true', { timeout: 300000 });
  console.log('[story] world ready');
  await sleep(2000);

  const ev = (fn, ...args) => page.evaluate(fn, ...args);
  async function until(fn, pred, timeoutMs = 30000, intervalMs = 350) {
    const deadline = Date.now() + timeoutMs;
    let v = await fn();
    while (!pred(v) && Date.now() < deadline) {
      await sleep(intervalMs);
      v = await fn();
    }
    return v;
  }
  const hasMem = (id) => ev((i) => window.__MT_MEM__().collected.some((f) => f.id === i), id);
  const closeJournal = async () => { await ev(() => window.__MT_JOURNAL__(false)); await sleep(350); };
  const promptText = () => ev(() => {
    const el = document.getElementById('prompt');
    if (!el || el.classList.contains('hidden')) return '';
    return document.getElementById('prompt-label')?.textContent || '';
  });
  /** Everything that can hold the prompt back — plus a 1 s frame heartbeat: a
   *  frameDelta of 0 means the render loop itself died (a thrown frame). */
  const debugUi = async () => {
    const ui = await ev(() => ({
      prompt: document.getElementById('prompt-label')?.textContent ?? '',
      promptHidden: !!document.getElementById('prompt')?.classList.contains('hidden'),
      inspect: !!(document.getElementById('inspect') && !document.getElementById('inspect').classList.contains('hidden')),
      journal: !!document.querySelector('#journal:not(.hidden)'),
      dialogue: !!document.querySelector('#dialogue:not(.hidden)'),
      panel: !!document.querySelector('#panel:not(.hidden)'),
      dlg: window.__MT_DIALOGUE__(),
      player: window.__MT_PLAYER__()?.pos,
    }));
    const f1 = await ev(() => window.__MT_STATS__().frame);
    await sleep(1000);
    const f2 = await ev(() => window.__MT_STATS__().frame);
    return { ...ui, frameDelta: f2 - f1 };
  };
  const inspectBody = () => ev(() => {
    const el = document.getElementById('inspect');
    if (!el || el.classList.contains('hidden')) return '';
    return document.getElementById('inspect-body')?.textContent || '';
  });
  const isInspect = () => ev(() => !!(document.getElementById('inspect') &&
    !document.getElementById('inspect').classList.contains('hidden')));
  const press = async (code) => { await ev((c) => window.__MT_PRESS__(c), code); await sleep(700); };
  const story = () => ev(() => window.__MT_STORY__());
  const dlg = () => ev(() => window.__MT_DIALOGUE__());
  const tp = async (x, z) => { await ev((a, b) => window.__MT_TP__(a, b), x, z); await sleep(1200); };

  /**
   * Poll until the prompt matches — SwiftShader renders at ~0.3 fps, so a
   * single read after a teleport can still show the *previous* label. Dumps
   * whichever overlay is holding the prompt back when the wait fails.
   */
  async function waitPrompt(pred, timeout = 30000) {
    const p = await until(promptText, pred, timeout);
    if (!pred(p)) {
      console.log(`[story]   … prompt wait failed; ui = ${JSON.stringify(await debugUi())}`);
    }
    return p;
  }

  /** Talk to whoever claims the prompt: press E, wait for dialogue open. */
  async function openDialogue(expectLabel, timeout = 30000) {
    const p = await waitPrompt((t) => expectLabel.test(t), timeout);
    check(`prompt: ${expectLabel}`, expectLabel.test(p), p);
    if (!expectLabel.test(p)) return false;
    await press('KeyE');
    const d = await until(dlg, (x) => x.open, 30000);
    check(
      'dialogue opened',
      d.open,
      (JSON.stringify(d.title || '').slice(0, 40) || '') +
        (d.open ? '' : ` | last error: ${(pageErrors[pageErrors.length - 1] || 'none').slice(0, 120)}`),
    );
    return d.open;
  }
  async function choose(i) {
    await ev((k) => window.__MT_DIALOGUE_CHOOSE__(k), i);
    await sleep(700);
    const d = await dlg();
    check(`choice ${i} accepted`, d.open, (d.body || '').slice(0, 46).replace(/\s+/g, ' '));
    return d;
  }
  const closeDlg = async () => {
    // never leak an E into the world while no card is up (cascade magnet)
    if (!(await dlg()).open) return;
    await press('KeyE');
    const d = await until(dlg, (x) => !x.open, 20000);
    check('dialogue closed', !d.open);
  };

  /**
   * NPC memory sources can only be *talked to* once held (Phase 3's rule):
   * a fresh save extracts on arrival first, then talks.
   */
  async function ensureHeld(src, fragmentId) {
    if (await hasMem(fragmentId)) return;
    await tp(src.x + 1.5, src.z + 1.5);
    await ev(() => window.__MT_GLOVE_CD__(0));
    const p = await waitPrompt((t) => /Extract memory/.test(t), 20000);
    check(`extract prompt: ${src.name}`, /Extract memory/.test(p), p);
    await press('KeyE');
    const held = await until(() => hasMem(fragmentId), (h) => h, 40000);
    check(`held ${fragmentId}`, held);
    await closeJournal(); // a finished reading opens the journal
  }

  /* ================= 1. fresh story state ================= */
  let s = await story();
  check('fresh: main mission active', s.missions?.[0]?.status === 'active', s.missions?.[0]?.status);
  check('fresh: side mission locked', s.missions?.[1]?.status === 'locked', s.missions?.[1]?.status);
  check('fresh: no evidence yet', (s.evidence || []).length === 0, String(s.evidence?.length));
  const mk = await until(() => story(), (t) => (t.markers || []).length > 0, 20000);
  check('marker at Tomas', mk.markers?.[0]?.id === 'tomas', JSON.stringify(mk.markers?.[0] || null));

  /* ================= 2. case journal before the meeting ================= */
  await ev(() => window.__MT_JOURNAL__(true));
  await ev(() => window.__MT_CASE__('case'));
  await sleep(500);
  let c = await ev(() => window.__MT_CASE__());
  check('case tab: 1 objective before meeting', c.objectives === 1, String(c.objectives));
  check('case tab: 0 objectives done', c.objectivesDone === 0, String(c.objectivesDone));
  check('case tab: side mission listed', (c.missions || []).includes('third-watch'));
  await ev(() => window.__MT_JOURNAL__(false));
  await sleep(300);

  /* ================= 3. open the annex the legitimate way ================= */
  const sources = await ev(() => window.__MT_SOURCES__());
  const byId = (id) => sources.find((x) => x.id === id);
  await ev(() => window.__MT_GLOVE_CD__(0));
  const valve = byId('src-canal-valve');
  await tp(valve.x + 1.5, valve.z + 1.5);
  const pr0 = await waitPrompt((t) => /Extract memory/.test(t), 20000);
  check('valve extract prompt', /Extract memory/.test(pr0), pr0);
  await press('KeyE');
  const collected = await until(() => hasMem('mem-lantern-vigil'), (h) => h, 40000);
  check('vigil memory recorded', collected);
  await closeJournal(); // extraction opens the journal
  await ev(() => window.__MT_RECON_DUR__(1));
  await ev(() => window.__MT_RECON_START__('mem-lantern-vigil'));
  const door = await until(() => ev(() => window.__MT_SECRET__()), (d) => d && d.open, 60000, 1000);
  check('annex door unbarred by replay', !!(door && door.open), JSON.stringify(door));
  const secret = door && door.open ? door : await ev(() => window.__MT_SECRET__());

  /* ================= 4. cage must be absent pre-case ================= */
  let pr;
  await tp(secret.x + 0.1, secret.z - 0.45);
  pr = await waitPrompt((t) => t.length > 0, 15000);
  check('no cage prompt before the case', !/records cage/i.test(pr), pr || '(none)');

  /* ================= 5. meet Tomas (choice A: take the case) ================= */
  const tpos = await ev((id) => window.__MT_STORY_POS__(id), 'tomas');
  check('Tomas placed', !!tpos, JSON.stringify(tpos));
  await tp(tpos.x + 1.5, tpos.z + 1.5);
  let ok = await openDialogue(/Talk to Tomas Venn/);
  if (ok) {
    let d = await dlg();
    check('meeting shows 2 choices', (d.choices || []).length === 2, String((d.choices || []).length));
    check('meeting mentions Mira Venn', /Mira/.test(d.body));
    d = await choose(0); // "I'll take it"
    check('choice A reply mentions route note', /route|wrote it down/i.test(d.body || ''), (d.body || '').slice(0, 40));
    await closeDlg();
  }
  s = await story();
  const fl = (n) => (s.flags || []).includes(n);
  check('flag met-tomas', fl('met-tomas'));
  check('flag route-note (choice A reward)', fl('route-note'));
  check('evidence: commission', !!s.evidence.find((e) => e.id === 'ev-hiring'));
  check('evidence: route note', !!s.evidence.find((e) => e.id === 'ev-route'));
  check('evidence: retainer absent (choice B only)', !s.evidence.find((e) => e.id === 'ev-retainer'));

  /* ================= 6. delayed action: status line mid-case ================= */
  await tp(tpos.x + 1.5, tpos.z + 1.5);
  ok = await openDialogue(/Talk to Tomas Venn/);
  if (ok) {
    const d = await dlg();
    check('mid-case status names outstanding work', /trader|station|tower/i.test(d.body || ''), (d.body || '').slice(0, 60).replace(/\s+/g, ' '));
    await closeDlg();
  }

  /* ================= 7. attendant first (order independence) ================= */
  const att = byId('src-station-attendant');
  await ensureHeld(att, 'mem-station-last-look'); // talk needs a held reading
  await tp(att.x + 1.5, att.z + 1.5);
  ok = await openDialogue(/Talk to the station attendant/);
  if (ok) {
    let d = await dlg();
    check('attendant offers Mira question', /Mira/.test(JSON.stringify(d.choices || [])));
    d = await choose(0);
    check('attendant reply: 23:40', /23:40/.test(d.body || ''), (d.body || '').slice(0, 40));
    await closeDlg();
  }
  s = await story();
  check('flag asked-attendant', (s.flags || []).includes('asked-attendant'));
  check('evidence: last sighting', !!s.evidence.find((e) => e.id === 'ev-sighting'));

  /* ================= 8. courier: truth choice + cold follow-up ================= */
  const agents = await ev(() => window.__MT_AGENTS__());
  const courier = agents.find((a) => a.type === 'target');
  check('courier agent exists', !!courier, courier ? courier.id : 'none');
  if (courier) {
    // leave the attendant's claim first: a memory source outranks an agent,
    // so a courier teleported next to a source would never own the prompt
    await ev(() => window.__MT_SPAWN__('oldquarter'));
    await sleep(900);
    const p = await ev(() => window.__MT_PLAYER__());
    await ev((id, x, z, fx, fz) => window.__MT_AGENT_POS__(id, x, z, fx, fz),
      courier.id, p.pos[0] + 1.5, p.pos[2], p.pos[0], p.pos[2]);
    ok = await openDialogue(/palisade courier/i);
    if (ok) {
      let d = await dlg();
      check('courier gives 2 choices', (d.choices || []).length === 2, String((d.choices || []).length));
      d = await choose(0); // tell the truth
      check('courier truth reply: 23:52 / floor 40', /23:52|floor 40/i.test(d.body || ''), (d.body || '').slice(0, 44));
      await closeDlg();
    }
    // second talk: consequence
    const p2 = await ev(() => window.__MT_PLAYER__());
    await ev((id, x, z, fx, fz) => window.__MT_AGENT_POS__(id, x, z, fx, fz),
      courier.id, p2.pos[0] + 1.5, p2.pos[2], p2.pos[0], p2.pos[2]);
    ok = await openDialogue(/palisade courier/i);
    if (ok) {
      const d = await dlg();
      check('courier goes cold (consequence)', !d.choices || d.choices.length === 0, (d.body || '').slice(0, 44));
      await closeDlg();
    }
  }
  s = await story();
  check('flag tower-traced', (s.flags || []).includes('tower-traced'));
  check('flag courier-cold', (s.flags || []).includes('courier-cold'));
  check('evidence: cut ledger page', !!s.evidence.find((e) => e.id === 'ev-tower-ledger'));

  /* ================= 9. trader LAST (order independence) ================= */
  const trader = byId('src-market-trader');
  await ensureHeld(trader, 'mem-market-bargain'); // talk needs a held reading
  await tp(trader.x + 1.5, trader.z + 1.5);
  ok = await openDialogue(/Talk to the night market trader/);
  if (ok) {
    let d = await dlg();
    d = await choose(0); // ask about Mira
    check('trader reply: coil sleeve', /coil sleeve/i.test(d.body || ''), (d.body || '').slice(0, 44));
    await closeDlg();
  }
  s = await story();
  check('flag asked-trader', (s.flags || []).includes('asked-trader'));
  check('evidence: trader account', !!s.evidence.find((e) => e.id === 'ev-trader-account'));

  /* ================= 10. all three → key ================= */
  c = await ev(() => { window.__MT_JOURNAL__(true); window.__MT_CASE__('case'); return null; });
  await sleep(400);
  c = await ev(() => window.__MT_CASE__());
  check('three investigative objectives done', c.objectivesDone === 4, `done=${c.objectivesDone} of ${c.objectives}`);
  await ev(() => window.__MT_JOURNAL__(false));
  await tp(tpos.x + 1.5, tpos.z + 1.5);
  ok = await openDialogue(/Talk to Tomas Venn/);
  if (ok) {
    const d = await dlg();
    check('key handover mentions records cage', /records cage/i.test(d.body || ''), (d.body || '').slice(0, 50).replace(/\s+/g, ' '));
    await closeDlg();
  }
  s = await story();
  check('flag annex-key', (s.flags || []).includes('annex-key'));

  /* ================= 11. cage (locked feedback first) ================= */
  await tp(secret.x + 0.1, secret.z - 0.45);
  pr = await waitPrompt((t) => /records cage/i.test(t), 30000);
  check('cage prompt appears with key', /records cage/i.test(pr), pr || '(none)');
  if (/records cage/i.test(pr)) await press('KeyE'); // key in hand → gate drops
  const opened = await until(() => story(), (t) => t.cage && t.cage.open, 30000);
  check('records cage opened', !!(opened.cage && opened.cage.open),
    opened.cage ? JSON.stringify(opened.cage) : 'no cage state');
  check('work box interactable in world', !!(opened.cage && opened.cage.boxInWorld));

  /* ================= 12. work box → finale ================= */
  await tp(secret.x - 0.5, secret.z - 1.35);
  pr = await waitPrompt((t) => /work box/i.test(t), 30000);
  check('work box prompt', /work box/i.test(pr), pr || '(none)');
  if (/work box/i.test(pr)) await press('KeyE');
  const dfin = await until(dlg, (x) => x.open, 30000);
  check('finale opens', dfin.open,
    (dfin.title || '').slice(0, 30) + (dfin.open ? '' : ` | last error: ${(pageErrors[pageErrors.length - 1] || 'none').slice(0, 120)}`));
  check('finale reveals your own name', /RIVEN VALE/.test(dfin.body || ''));
  await closeDlg();
  s = await story();
  check('flag case-closed', (s.flags || []).includes('case-closed'));
  check('main mission complete', s.missions?.[0]?.status === 'complete', s.missions?.[0]?.status);
  check('evidence: ledger', !!s.evidence.find((e) => e.id === 'ev-ledger'));
  check('evidence: intake list', !!s.evidence.find((e) => e.id === 'ev-intake'));
  check('witness discrepancy computed', !!s.discrepancy, String(s.discrepancy));
  check('side mission still incomplete (optional skipped)', s.missions?.[1]?.status === 'active', s.missions?.[1]?.status);
  check('optional garden memory NOT held', !(await hasMem('mem-garden-observance')));

  /* ================= 13. optional side investigation ================= */
  const clerk = byId('src-glassline-clerk');
  await tp(clerk.x + 1.5, clerk.z + 1.5);
  ok = await openDialogue(/Talk to the night clerk/);
  if (ok) {
    let d = await dlg();
    d = await choose(0);
    check('clerk reply: vigil / eleven', /vigil|eleven/i.test(d.body || ''), (d.body || '').slice(0, 44));
    await closeDlg();
  }
  await ev(() => window.__MT_GLOVE_CD__(0));
  const plaque = byId('src-garden-plaque');
  await tp(plaque.x + 1.5, plaque.z + 1.5);
  pr = await waitPrompt((t) => /Extract memory/.test(t), 30000);
  check('plaque extract prompt', /Extract/.test(pr), pr || '(none)');
  if (/Extract memory/.test(pr)) await press('KeyE');
  const held = await until(() => hasMem('mem-garden-observance'), (h) => h, 40000);
  check('optional memory recorded', held);
  await closeJournal();
  s = await story();
  check('side mission complete', s.missions?.[1]?.status === 'complete', s.missions?.[1]?.status);
  check('evidence: eleven names', !!s.evidence.find((e) => e.id === 'ev-eleven-names'));

  /* ================= 14. journal evidence revisit ================= */
  await ev(() => window.__MT_JOURNAL__(true));
  await ev(() => window.__MT_CASE__('case'));
  await sleep(400);
  c = await ev(() => window.__MT_CASE__());
  check('journal lists evidence entries', (c.evidence || []).length >= 8, String((c.evidence || []).length));
  check('journal discrepancy note visible', c.discrepancy === true);
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('.case-ev');
    if (!btn) return null;
    btn.click();
    return btn.dataset.evidence;
  });
  await sleep(300);
  c = await ev(() => window.__MT_CASE__());
  check('evidence entry expands with body', !!c.expandedBody && c.expandedBody.length > 40, (c.expandedBody || '').slice(0, 40));
  await ev(() => window.__MT_JOURNAL__(false));
  await page.screenshot({ path: join(OUT_DIR, 'story-case-complete.png') }).catch(() => {});

  /* ================= 15. persistence across reload ================= */
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__MT_READY__ === true', { timeout: 300000 });
  await sleep(1500);
  s = await story();
  check('after reload: main still complete', s.missions?.[0]?.status === 'complete', s.missions?.[0]?.status);
  check('after reload: evidence preserved', (s.evidence || []).length >= 8, String((s.evidence || []).length));
  check('after reload: side complete', s.missions?.[1]?.status === 'complete', s.missions?.[1]?.status);

  /* ================= 16. choice B pass (retainer path) ================= */
  await ev(() => window.__MT_STORY_RESET__());
  await sleep(500);
  s = await story();
  check('reset: fresh again', s.missions?.[0]?.status === 'active' && (s.evidence || []).length === 0);
  const tpos2 = await ev((id) => window.__MT_STORY_POS__(id), 'tomas');
  await tp(tpos2.x + 1.5, tpos2.z + 1.5);
  ok = await openDialogue(/Talk to Tomas Venn/);
  if (ok) {
    const d = await choose(1); // "What's in it for me?"
    check('choice B reply: paid', /Fair|pay/i.test(d.body || ''), (d.body || '').slice(0, 44));
    await closeDlg();
  }
  s = await story();
  check('choice B: retainer evidence', !!s.evidence.find((e) => e.id === 'ev-retainer'));
  check('choice B: no route note yet', !s.evidence.find((e) => e.id === 'ev-route'));

  // trader after choice B → talk Tomas → delayed route note
  const trader2 = byId('src-market-trader');
  await tp(trader2.x + 1.5, trader2.z + 1.5);
  ok = await openDialogue(/Talk to the night market trader/);
  if (ok) { await choose(0); await closeDlg(); }
  await tp(tpos2.x + 1.5, tpos2.z + 1.5);
  ok = await openDialogue(/Talk to Tomas Venn/);
  if (ok) {
    const d = await dlg();
    check('choice B: delayed route note after first finding', /route note|wrote it down/i.test(d.body || ''), (d.body || '').slice(0, 50).replace(/\s+/g, ' '));
    await closeDlg();
  }
  s = await story();
  check('choice B: route note now granted', (s.flags || []).includes('route-note'));

  // cage must be locked again after reset
  await tp(secret.x + 0.1, secret.z - 0.45);
  pr = await waitPrompt((t) => /records cage/i.test(t), 30000);
  check('cage prompt after reset', /records cage/i.test(pr), pr || '(none)');
  await press('KeyE');
  const body = await until(inspectBody, (b) => b.length > 0, 20000);
  check('cage locked again after reset', /key|lock|answered/i.test(body), body.slice(0, 50) || '(empty)');
  await press('KeyE');

  /* ================= summary ================= */
  check('no page/console errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | ').slice(0, 160));
  console.log(`\n[story] ${pass} passed, ${fail} failed`);
  if (fail) {
    console.error('[story] failures:');
    for (const e of errors) console.error('  - ' + e);
  }

  await browser.close().catch(() => {});
  if (server) server.kill();
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error('[story] crashed:', err);
  process.exit(1);
});
