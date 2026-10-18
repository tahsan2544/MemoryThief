/**
 * Smoke test: boots the dev server page in headless Edge, waits for the world
 * to finish generating, captures console/page errors and writes screenshots of
 * the overview, each landmark viewpoint and a street-level view.
 *
 *   npm run dev          (in another terminal, or let this script start it)
 *   npm run smoke
 *
 * Env overrides:
 *   SMOKE_URL     http://127.0.0.1:6030
 *   SMOKE_OUT     <folder>          (default: smoke/)
 *   SMOKE_SEED    eidolon-77
 *   SMOKE_QUALITY medium
 *   SMOKE_GRID    12
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const BASE_URL = process.env.SMOKE_URL ?? 'http://127.0.0.1:6030';
const OUT_DIR = resolve(root, process.env.SMOKE_OUT ?? 'smoke');
const SEED = process.env.SMOKE_SEED ?? 'eidolon-77';
const QUALITY = process.env.SMOKE_QUALITY ?? 'medium';
const GRID = process.env.SMOKE_GRID ?? '12';

const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const VIEWS = [
  ['overview', '01-overview'],
  ['tower', '02-tower'],
  ['market', '03-market'],
  ['station', '04-station'],
  ['garden', '05-garden'],
  ['archive', '06-archive'],
  ['street', '07-street'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Screenshots are best-effort evidence, not checks. SwiftShader occasionally
 * takes minutes to hand a frame back to the compositor; a slow capture must
 * degrade to a warning instead of aborting the whole suite.
 */
async function shot(page, warnings, file) {
  try {
    await page.screenshot({ path: join(OUT_DIR, file), type: 'png' });
    console.log(`[smoke] captured ${file}`);
  } catch (err) {
    warnings.push(`screenshot failed: ${file} — ${err.message}`);
    console.log(`[smoke] warn  screenshot failed: ${file} — ${err.message}`);
  }
}

/* --------------------------------------------------------------------- *
 * Welcome screen — the case file the city greets you with
 * --------------------------------------------------------------------- */

async function runWelcomeTests(page, errors, warnings) {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    const line = `${name}${detail ? ` — ${detail}` : ''}`;
    if (ok) console.log(`[smoke]   ok   ${line}`);
    else {
      errors.push(`welcome: ${line}`);
      console.log(`[smoke]   FAIL ${line}`);
    }
  };
  const state = () =>
    page.evaluate(() => (typeof window.__MT_WELCOME__ === 'function' ? window.__MT_WELCOME__() : 'missing'));

  const up = await state();
  check('welcome screen greets the player before play', up === true, String(up));
  await shot(page, warnings, '00-welcome.png');

  // while the welcome is up the game's own movement gate must hold
  const locked = await page.evaluate(() => window.__MT_OVERLAY_OPEN__());
  check('movement gate holds behind the welcome', locked === true, String(locked));

  // the real button, with a real click
  await page.click('#welcome-start');
  const gone = await page
    .waitForFunction('window.__MT_WELCOME__ && window.__MT_WELCOME__() === false', { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check('BEGIN starts the case', gone);

  // and it stays gone once the walk begins
  await new Promise((r) => setTimeout(r, 1200));
  const still = await state();
  check('the welcome does not come back', still === false, String(still));

  const passed = results.filter((r) => r.ok).length;
  console.log(`[smoke] welcome checks: ${passed}/${results.length} passed`);
  return results;
}

/**
 * Click the welcome's real button and wait for the gate to lift. A page
 * (re)load always greets the player again — that is the title screen working —
 * so every fresh load in the suite must dismiss it before driving the game.
 */
async function dismissWelcome(page) {
  await page
    .waitForFunction('typeof window.__MT_WELCOME__ === "function" && window.__MT_WELCOME__() === true', {
      timeout: 30000,
    })
    .catch(() => {});
  const up = await page.evaluate(() => (typeof window.__MT_WELCOME__ === 'function' ? window.__MT_WELCOME__() : 'missing'));
  if (up !== true) return up;
  await page.click('#welcome-start');
  await page.waitForFunction('window.__MT_WELCOME__() === false', { timeout: 20000 }).catch(() => {});
  return page.evaluate(() => window.__MT_WELCOME__());
}

/* --------------------------------------------------------------------- *
 * Phase 2 — gameplay checks (Riven Vale walking around the city)
 *
 * Headless SwiftShader renders the street view at 1–3 FPS, so nothing here
 * waits a fixed amount of wall-clock time: every step polls the game state
 * until the expected thing happens (or a generous timeout expires).
 * --------------------------------------------------------------------- */

async function runPlayTests(page, errors, warnings) {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    const line = `${name}${detail ? ` — ${detail}` : ''}`;
    if (ok) console.log(`[smoke]   ok   ${line}`);
    else {
      errors.push(`play: ${line}`);
      console.log(`[smoke]   FAIL ${line}`);
    }
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const player = () => ev(() => window.__MT_PLAYER__());
  const insideGeometry = (p) => ev((q) => window.__MT_HITS__(q[0], q[1], q[2]), p);

  /** Poll `fn` until its result satisfies `predicate`, else return the last value. */
  async function until(fn, predicate, timeoutMs = 20000, intervalMs = 300) {
    const deadline = Date.now() + timeoutMs;
    let value = await fn();
    while (!predicate(value) && Date.now() < deadline) {
      await sleep(intervalMs);
      value = await fn();
    }
    return value;
  }

  /**
   * Hold-and-push helper: sample [x, z] until it stops advancing (blocked by
   * geometry), which is far more robust than waiting a fixed time when the
   * renderer only manages a few frames per second.
   */
  async function waitUntilBlocked(sample, timeoutMs = 60000) {
    const deadline = Date.now() + timeoutMs;
    let prev = await sample();
    while (Date.now() < deadline) {
      await sleep(4000);
      const cur = await sample();
      if (Math.hypot(cur[0] - prev[0], cur[2] - prev[2]) < 0.05) return cur;
      prev = cur;
    }
    return sample();
  }

  // ---- mode ------------------------------------------------------------
  const mode = await ev(() => {
    window.__MT_SET_MODE__('play');
    return window.__MT_MODE__();
  });
  check('play mode active', mode === 'play', String(mode));

  // ---- walk, ground and camera in two districts ------------------------
  for (const district of ['oldquarter', 'floodworks']) {
    const sp = await ev((d) => window.__MT_SPAWN__(d), district);
    check(`${district}: spawned on a road`, !!sp && Number.isFinite(sp.x), JSON.stringify(sp));

    const before = await until(player, (s) => s && s.grounded, 8000);
    await ev(() => window.__MT_KEY__('KeyW', true));
    const walking = await until(
      async () => {
        const s = await player();
        return { s, d: Math.hypot(s.pos[0] - before.pos[0], s.pos[2] - before.pos[2]) };
      },
      (r) => r.d > 2,
      90000, // headless SwiftShader simulates at a fraction of real time
    );
    const mid = walking.s;
    await ev(() => window.__MT_KEY__('KeyW', false));
    await sleep(600);
    const after = await player();

    check(`${district}: walks forward`, walking.d > 2, `${walking.d.toFixed(2)} m travelled`);
    check(
      `${district}: reaches walk speed`,
      mid.speed > 2.5 && mid.speed < 5,
      `${mid.speed.toFixed(2)} m/s`,
    );
    check(`${district}: grounded after walking`, after.grounded === true, `feet y=${after.pos[1].toFixed(2)}`);

    const penetrating = await insideGeometry(after.pos);
    check(`${district}: never inside geometry`, !penetrating, penetrating ? JSON.stringify(after.pos) : 'clear');

    const g = await ev((p) => window.__MT_GROUND__(p[0], p[2]), after.pos);
    check(
      `${district}: standing on the ground surface`,
      Math.abs(g - after.pos[1]) < 0.4,
      `ground ${g.toFixed(2)} / feet ${after.pos[1].toFixed(2)}`,
    );

    const cam = await ev(() => window.__MT_CAM__());
    const camBlocked = await ev((c) => window.__MT_COLLIDES__(c[0], c[1], c[2]), cam.pos);
    check(
      `${district}: camera not inside geometry`,
      !camBlocked,
      camBlocked ? cam.pos.map((v) => v.toFixed(1)).join(', ') : `dist ${cam.dist.toFixed(2)}`,
    );

    await shot(page, warnings, `08-play-${district}.png`);
  }

  // ---- sprint ----------------------------------------------------------
  await ev(() => window.__MT_SPAWN__('verdant'));
  await ev(() => {
    window.__MT_KEY__('KeyW', true);
    window.__MT_KEY__('ShiftLeft', true);
  });
  const sprinting = await until(player, (s) => s.speed > 5, 25000);
  await ev(() => {
    window.__MT_KEY__('KeyW', false);
    window.__MT_KEY__('ShiftLeft', false);
  });
  check('sprint outruns the walk', sprinting.speed > 5, `${sprinting.speed.toFixed(2)} m/s`);

  // ---- jump ------------------------------------------------------------
  await ev(() => window.__MT_SPAWN__('oldquarter'));
  const grounded0 = await until(player, (s) => s.grounded, 8000);
  const groundY = grounded0.pos[1];
  await ev(() => window.__MT_PRESS__('Space'));
  const airborne = await until(player, (s) => !s.grounded && s.pos[1] > groundY + 0.5, 15000);
  check(
    'jump leaves the ground',
    airborne.grounded === false && airborne.pos[1] > groundY + 0.5,
    `y=${airborne.pos[1].toFixed(2)} (was ${groundY.toFixed(2)})`,
  );
  // generous deadline: the arc takes several frames and SwiftShader frames
  // run 1–3 s each (worse on a loaded machine) — the assertion never moves.
  const landed = await until(player, (s) => s.grounded && Math.abs(s.pos[1] - groundY) < 0.5, 45000);
  check(
    'lands back down',
    landed.grounded === true && Math.abs(landed.pos[1] - groundY) < 0.5,
    `y=${landed.pos[1].toFixed(2)}`,
  );

  // ---- layout-driven checks --------------------------------------------
  const L = await ev(() => window.__MT_LAYOUT__());
  if (!L) {
    warnings.push('layout hook unavailable — skipped barrier/wall/camera tests');
  } else {
    // (a) the station pit must be guarded by the visible barrier ring
    const station = L.landmarks.find((m) => m.type === 'station');
    if (station) {
      const z = station.cell.z1 - 6; // concourse, just outside the ring
      await ev((a) => window.__MT_TP__(a.x, a.z, Math.PI), { x: station.cell.cx, z });
      await ev(() => window.__MT_KEY__('KeyW', true));
      // walk north until the barrier line arrests the character
      await waitUntilBlocked(async () => (await player()).pos, 60000);
      await ev(() => window.__MT_KEY__('KeyW', false));
      await sleep(500);
      const p = await player();
      check(
        'barrier ring stops the player at the station pit',
        p.pos[2] > station.cell.z1 - 12,
        `z=${p.pos[2].toFixed(1)} after ${(z - p.pos[2]).toFixed(1)} m, pit edge at ${(station.cell.z1 - 13).toFixed(1)}`,
      );
      check('player did not fall into the pit', p.pos[1] >= L.curb - 0.05, `feet y=${p.pos[1].toFixed(2)}`);
      check('no penetration while pushing the barrier', !(await insideGeometry(p.pos)));
      await shot(page, warnings, '10-play-station-barrier.png');
    } else {
      warnings.push('station landmark missing — skipped pit barrier test');
    }

    // (b) a solid object stops the character, and the boom collides behind
    const cells = (L.districts.oldquarter?.cells ?? []).filter((c) => !c.landmark);
    let spot = null;
    for (const c of cells) {
      if (spot) break;
      for (const dz of [0, -22, 22, -38, 38]) {
        for (const inset of [1.5, 2, 2.5, 3, 3.5, 4, 5, 6]) {
          const x = c.x0 + inset;
          const z = c.cz + dz;
          if (z < c.z0 + 6 || z > c.z1 - 6) continue;
          // stand clear, with something tall (building/tree/lamp) 2.5 m east
          // NOTE: __MT_HITS__(x, y, z) — height is the SECOND argument
          const probe = await ev(
            (a) =>
              !window.__MT_HITS__(a.x, a.curb + 1, a.z) &&
              !window.__MT_HITS__(a.x, a.curb + 2.8, a.z) &&
              window.__MT_HITS__(a.x + 2.5, a.curb + 1, a.z) &&
              window.__MT_HITS__(a.x + 2.5, a.curb + 2.8, a.z),
            { x, z, curb: L.curb },
          );
          if (probe) {
            spot = { x, z };
            break;
          }
        }
      }
    }
    if (spot) {
      // face the solid and walk into it
      await ev((a) => window.__MT_TP__(a.x, a.z, Math.PI / 2), spot);
      await ev(() => window.__MT_KEY__('KeyW', true));
      await waitUntilBlocked(async () => (await player()).pos, 60000);
      await ev(() => window.__MT_KEY__('KeyW', false));
      await sleep(400);
      const p2 = await player();
      check(
        'solid object stops the walk',
        p2.pos[0] < spot.x + 2.5,
        `x=${p2.pos[0].toFixed(1)} (solid at ${(spot.x + 2.5).toFixed(1)})`,
      );
      check('no penetration into the solid', !(await insideGeometry(p2.pos)));

      // turn away from it so the camera boom has to shorten against it
      await ev((a) => window.__MT_TP__(a.x, a.z, -Math.PI / 2), spot);
      const cam = await until(ev.bind(null, () => window.__MT_CAM__()), (c) => c.collided === true, 60000);
      check(
        'camera boom shortens against the solid behind',
        cam.collided === true && cam.dist < 4.2,
        `dist=${cam.dist.toFixed(2)} collided=${cam.collided}`,
      );
      const camBlocked = await ev((c) => window.__MT_COLLIDES__(c[0], c[1], c[2]), cam.pos);
      check('camera stays out of the solid', !camBlocked, cam.pos.map((v) => v.toFixed(1)).join(', '));
      await shot(page, warnings, '11-play-camera-collision.png');
    } else {
      warnings.push('no clear building spot found — skipped wall/camera collision tests');
    }
  }

  // ---- interaction -----------------------------------------------------
  const interactables = await ev(() => window.__MT_INTERACTABLES__());
  check(
    'interactables placed',
    Array.isArray(interactables) && interactables.length >= 4,
    `${interactables?.length ?? 0} found`,
  );
  if (interactables?.length) {
    // Phase 3 gives memory sources prompt priority at the three object sites,
    // so the pure sign/card test targets an anchor no source stands on
    const sources3 = await ev(() => window.__MT_SOURCES__());
    const it =
      interactables.find(
        (i) => !sources3.some((s) => Math.hypot(s.x - i.x, s.z - i.z) < s.radius),
      ) ?? interactables[0];
    await ev((a) => window.__MT_TP__(a.x, a.z, 0), it);
    const near = await until(
      () => ev(() => window.__MT_INTERACT__()),
      (n) => n.near === it.id && n.prompt === true,
      15000,
    );
    check('prompt appears at an interactable', near.near === it.id && near.prompt === true, JSON.stringify(near));
    await shot(page, warnings, '12-play-prompt.png');

    await ev(() => window.__MT_PRESS__('KeyE'));
    const opened = await until(
      () => ev(() => window.__MT_INTERACT__()),
      (n) => n.open === true,
      15000,
    );
    check('E opens the read-out card', opened.open === true, JSON.stringify(opened));
    await shot(page, warnings, '13-play-inspect.png');

    await ev(() => window.__MT_PRESS__('KeyE'));
    const closed = await until(
      () => ev(() => window.__MT_INTERACT__()),
      (n) => n.open === false,
      15000,
    );
    check('E closes the read-out card', closed.open === false, JSON.stringify(closed));
  }

  // ---- mode round trip --------------------------------------------------
  const round = await ev(() => {
    window.__MT_SET_MODE__('inspect');
    const a = window.__MT_MODE__();
    window.__MT_SET_MODE__('play');
    return [a, window.__MT_MODE__()];
  });
  check('mode toggles both ways', round[0] === 'inspect' && round[1] === 'play', JSON.stringify(round));

  const passed = results.filter((r) => r.ok).length;
  console.log(`[smoke] gameplay checks: ${passed}/${results.length} passed`);
  if (passed !== results.length) warnings.push(`${results.length - passed} gameplay check(s) failed`);
}

/* --------------------------------------------------------------------- *
 * Phase 3 — memory mechanic checks (extraction, journal, reconstruction,
 * contradictions, hidden door, dialogue unlock, Resonance Sight)
 *
 * Same philosophy as the Phase 2 checks: poll, never sleep-and-hope. All
 * gameplay timers are wall clock, so channels/cooldowns/reconstructions
 * complete in real seconds even when SwiftShader renders at 0.3 FPS.
 * --------------------------------------------------------------------- */

async function runMemoryTests(page, errors, warnings) {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    const line = `${name}${detail ? ` — ${detail}` : ''}`;
    if (ok) console.log(`[smoke]   ok   ${line}`);
    else {
      errors.push(`memory: ${line}`);
      console.log(`[smoke]   FAIL ${line}`);
    }
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));

  async function until(fn, predicate, timeoutMs = 20000, intervalMs = 300) {
    const deadline = Date.now() + timeoutMs;
    let value = await fn();
    while (!predicate(value) && Date.now() < deadline) {
      await sleep2(intervalMs);
      value = await fn();
    }
    return value;
  }

  async function waitUntilBlocked(sample, timeoutMs = 90000) {
    const deadline = Date.now() + timeoutMs;
    let prev = await sample();
    while (Date.now() < deadline) {
      await sleep2(4000);
      const cur = await sample();
      if (Math.hypot(cur[0] - prev[0], cur[2] - prev[2]) < 0.05) return cur;
      prev = cur;
    }
    return sample();
  }

  // hidden prompts must read as "no prompt": the label element can hold stale
  // text, so gate the read on the container's visibility
  const promptText = () =>
    ev(() => {
      const el = document.getElementById('prompt');
      return !el || el.classList.contains('hidden') ? '' : (document.getElementById('prompt-label')?.textContent ?? '');
    });
  const cardBody = () => ev(() => document.getElementById('inspect-body')?.textContent ?? '');
  const openCard = async () => until(() => ev(() => window.__MT_INTERACT__()), (n) => n.open === true, 12000);
  const closeCard = async () => until(() => ev(() => window.__MT_INTERACT__()), (n) => n.open === false, 12000);
  const nearSource = (id) => until(() => ev(() => window.__MT_NEAR__()), (n) => n.source === id, 15000);
  const waitCooldown = () => until(() => ev(() => window.__MT_MEM__()), (m) => m.gloveCooldown <= 0.05, 12000);
  const replayTo = (id, predicate) =>
    until(
      () => ev(() => window.__MT_MEM__()),
      predicate ?? ((m) => m.collected.find((c) => c.id === id)?.reconstructed === true),
      45000,
    );

  // ---- clean slate -------------------------------------------------------
  await ev(() => {
    window.__MT_SET_MODE__('play');
    window.__MT_MEM_RESET__();
    return true;
  });

  const sources = await ev(() => window.__MT_SOURCES__());
  const by = (id) => sources.find((s) => s.id === id);
  const valve = by('src-canal-valve');
  const attendant = by('src-station-attendant');
  const trader = by('src-market-trader');
  const warden = by('src-archive-warden');
  const clerk = by('src-glassline-clerk');
  const plaque = by('src-garden-plaque');
  const directory = by('src-tower-directory');

  check(
    'memory sources placed',
    Array.isArray(sources) && sources.length >= 7,
    `${sources?.length ?? 0} (${sources?.filter((s) => s.kind === 'npc').length ?? 0} people)`,
  );
  for (const npc of [attendant, trader, warden, clerk]) {
    if (!npc) {
      check('an NPC source is present', false, 'missing from the source list');
      continue;
    }
    const g = await ev((a) => window.__MT_GROUND__(a.x, a.z), npc);
    check(
      `${npc.name} stands on the ground`,
      Math.abs(g - npc.y) < 0.5,
      `ground ${g.toFixed(2)} vs base ${npc.y.toFixed(2)}`,
    );
  }

  // ---- 1. the hidden door is barred until its memory is replayed ---------
  const secret0 = await ev(() => window.__MT_SECRET__());
  check('service annex placed on the canal bank', !!secret0 && Number.isFinite(secret0.x), JSON.stringify(secret0));
  if (secret0) {
    const barred = await ev((s) => window.__MT_HITS__(s.x, 1.2, s.z + 0.05), secret0);
    check('annex door is barred initially', barred === true, barred ? 'blocked' : 'passable?!');
    // approach down the door lane (the strip between annex and parapet)
    await ev((s) => window.__MT_TP__(s.x, s.z + 0.85, Math.PI), secret0);
    await ev(() => window.__MT_KEY__('KeyW', true));
    const stopped = await waitUntilBlocked(async () => (await ev(() => window.__MT_PLAYER__())).pos, 90000);
    await ev(() => window.__MT_KEY__('KeyW', false));
    check(
      'closed door stops the walk',
      stopped[2] > secret0.z + 0.45 && stopped[2] < secret0.z + 1.4,
      `z=${stopped[2].toFixed(2)} (door plane ${secret0.z.toFixed(2)})`,
    );
  }

  // ---- 2. extraction at the canal valve ----------------------------------
  await ev((s) => window.__MT_TP__(s.x - 1.9, s.z, Math.PI / 2), valve);
  await nearSource('src-canal-valve');
  const valvePrompt = await promptText();
  check('extraction prompt at the valve', /Extract memory — Canal pump valve/.test(valvePrompt), valvePrompt);
  await shot(page, warnings, '14-source-prompt.png');

  await ev(() => window.__MT_PRESS__('KeyE'));
  const channel = await until(() => ev(() => window.__MT_EXTRACT__()), (e) => e.active === true, 12000);
  check('E opens the extraction channel', channel.active === true && channel.hud === true, JSON.stringify(channel));
  check(
    'fragment signature drives the channel',
    channel.fx === 'shimmer' && Math.abs((channel.glove ?? 0) - 0x8fb6ff) <= 0x0101,
    JSON.stringify({ fx: channel.fx, glove: (channel.glove ?? 0).toString(16) }),
  );
  const got = await until(() => ev(() => window.__MT_MEM__()), (m) => m.count >= 1, 25000);
  check(
    'fragment recorded by the glove',
    got.count === 1 && got.collected[0]?.id === 'mem-lantern-vigil',
    JSON.stringify(got.collected.map((c) => c.id)),
  );
  const journalOpened = await ev(() => window.__MT_JOURNAL__());
  check('journal opens on recovery', journalOpened === true, String(journalOpened));
  const items1 = await ev(() => document.querySelectorAll('.journal-item').length);
  check('journal lists the recovered fragment', items1 === 1, `${items1} items`);
  await shot(page, warnings, '15-journal.png');
  await ev(() => window.__MT_JOURNAL__(false));

  // ---- 3. cooldown + re-read behaviour -----------------------------------
  await ev((s) => window.__MT_TP__(s.x - 1.9, s.z, Math.PI / 2), plaque);
  await nearSource('src-garden-plaque');
  // force the cooldown through the same field collect() writes — the real one
  // (3.5 s) would already have expired during the journal screenshot above
  await ev(() => window.__MT_GLOVE_CD__(60));
  const cdPrompt = await until(promptText, (t) => /recharging/i.test(t), 15000);
  check('prompt reports the recharge window', /recharging/i.test(cdPrompt), cdPrompt);
  await ev(() => window.__MT_PRESS__('KeyE'));
  await sleep2(4500); // ≥ one rendered frame even at software-render speed
  const blockedCd = await ev(() => window.__MT_EXTRACT__());
  check('cooldown blocks a second reading', blockedCd.active === false, JSON.stringify(blockedCd));
  await ev(() => window.__MT_GLOVE_CD__(0)); // clear it — no point waiting out 60 s

  await ev((s) => window.__MT_TP__(s.x - 1.9, s.z, Math.PI / 2), valve);
  await nearSource('src-canal-valve');
  const reviewPrompt = await promptText();
  check(
    'held object source falls back to its signage (with a memory hint)',
    /memory/i.test(reviewPrompt),
    reviewPrompt,
  );
  await ev(() => window.__MT_PRESS__('KeyE'));
  const signageCard = await openCard();
  check('E opens the signage read-out at a held source', signageCard.open === true);
  await ev(() => window.__MT_PRESS__('KeyE'));
  await closeCard();

  // ---- 4. cancellation ----------------------------------------------------
  await ev((s) => window.__MT_TP__(s.x - 1.9, s.z, Math.PI / 2), plaque);
  await nearSource('src-garden-plaque');
  await ev(() => window.__MT_PRESS__('KeyE'));
  const started2 = await until(() => ev(() => window.__MT_EXTRACT__()), (e) => e.active === true, 12000);
  check('channel starts again once the glove is ready', started2.active === true);
  await ev(() => window.__MT_KEY__('KeyW', true));
  const cancelled = await until(() => ev(() => window.__MT_EXTRACT__()), (e) => e.active === false, 12000);
  await ev(() => window.__MT_KEY__('KeyW', false));
  const memAfterCancel = await ev(() => window.__MT_MEM__());
  check(
    'movement cancels the channel without recording',
    cancelled.active === false && memAfterCancel.count === 1,
    `count=${memAfterCancel.count}`,
  );

  // ---- 5. reconstruction: cancel restores the world -----------------------
  await ev((s) => window.__MT_TP__(s.x - 1.9, s.z, Math.PI / 2), valve);
  // stretch this replay far past any screenshot delay, so the cancel path is
  // always exercised (the software renderer can take minutes per frame)
  await ev(() => window.__MT_RECON_DUR__(600));
  await ev(() => window.__MT_JOURNAL__(true));
  const sel = await ev(() => window.__MT_JSEL__());
  check('journal preselects the held fragment', sel === 'mem-lantern-vigil', String(sel));
  await ev(() => window.__MT_PRESS__('Enter'));
  const recon1 = await until(() => ev(() => window.__MT_RECON__()), (r) => r.active === true, 15000);
  check(
    'Enter starts the reconstruction',
    recon1.active === true && recon1.id === 'mem-lantern-vigil',
    JSON.stringify({ id: recon1.id, actors: recon1.actors }),
  );
  check('ghost actors and panels stand in the scene', recon1.actors >= 2 && recon1.panels >= 2, `${recon1.actors} actors / ${recon1.panels} panels`);
  check('environment is altered', recon1.env?.fogChanged === true, JSON.stringify(recon1.env));
  check('distortion overlay engaged', /recon-/.test(recon1.bodyClass ?? ''), recon1.bodyClass);
  check('audio context survived without errors', ['running', 'suspended', 'idle'].includes(recon1.audio), recon1.audio);
  await shot(page, warnings, '16-reconstruction.png');
  await ev(() => window.__MT_PRESS__('Escape'));
  const reconOff = await until(() => ev(() => window.__MT_RECON__()), (r) => r.active === false, 15000);
  check('Esc ends the reconstruction early', reconOff.active === false);
  check('environment restored after cancel', reconOff.env === null && !/recon-/.test(reconOff.bodyClass ?? ''), reconOff.bodyClass);
  const memCancel = await ev(() => window.__MT_MEM__());
  check('cancelled replay does not count as replayed', memCancel.collected[0]?.reconstructed === false);

  // ---- 6. full replay opens the hidden door -------------------------------
  await ev(() => window.__MT_RECON_DUR__(9)); // restore the real pacing
  await ev(() => window.__MT_JOURNAL__(true));
  await ev(() => window.__MT_PRESS__('Enter'));
  const recon2 = await until(() => ev(() => window.__MT_RECON__()), (r) => r.active === true, 15000);
  check('reconstruction replays a second time', recon2.active === true, recon2.id ?? '');
  const done = await replayTo('mem-lantern-vigil');
  check('full replay marks the fragment replayed', done.collected.find((c) => c.id === 'mem-lantern-vigil')?.reconstructed === true);
  const secret1 = await until(() => ev(() => window.__MT_SECRET__()), (s) => s && s.open === true, 45000);
  check('hidden door unbars after the replay', secret1.open === true, JSON.stringify(secret1));
  const reconAfter = await until(() => ev(() => window.__MT_RECON__()), (r) => r.active === false, 30000);
  check('reconstruction finished before the walk', reconAfter.active === false, `active=${reconAfter.active}`);
  const clueGarden = await ev(() => window.__MT_CLUE__('garden-plaque'));
  void clueGarden; // garden marker is not part of this fragment

  // ---- 7. walk through the opened door, read the cache --------------------
  // main.js gates movement behind `player.update(dt, pressed, { frozen:
  // overlayOpen })` and `mode === 'play'`, so while any surface owns the screen
  // the player simply cannot move. Walking in that state yields a position that
  // never changes — which reads exactly like a door that is still shut. Wait
  // for the game to be genuinely walkable first, and name whatever is stuck.
  const walkableState = () =>
    ev(() => {
      const open = (id) => {
        const el = document.getElementById(id);
        return !!el && !el.classList.contains('hidden');
      };
      return {
        mode: window.__MT_MODE__?.() ?? '?',
        // The game's OWN movement gate (panel / inspect / journal / dialogue /
        // reconstruction / extraction / map / equipment / pause) — authoritative
        // for "may the player move", and it also covers states like an in-flight
        // extraction that carry no `hidden` class to read off the DOM. 'unknown'
        // means the build under test is too old to answer, which is a failure
        // worth naming rather than one to pass by accident.
        overlay:
          typeof window.__MT_OVERLAY_OPEN__ === 'function'
            ? window.__MT_OVERLAY_OPEN__()
            : 'unknown',
        journal: open('journal'),
        inspect: open('inspect'),
        dialogue: open('dialogue'),
        map: open('map'),
        gear: open('gear'),
        pause: open('pause'),
        panel: open('panel'),
        extract: open('extract'),
        recon: !!window.__MT_RECON__().active,
      };
    });
  const notWalkable = (s) =>
    s.mode !== 'play' ||
    s.overlay !== false ||
    Object.entries(s).some(([k, v]) => !['mode', 'overlay'].includes(k) && v === true);
  const walkState = await until(walkableState, (s) => !notWalkable(s), 25000);
  check(
    'nothing blocks movement before the walk',
    !notWalkable(walkState),
    'blocked by ' + JSON.stringify(walkState),
  );

  const doorBlockedNow = await ev((s) => window.__MT_HITS__(s.x, 1.2, s.z + 0.05), secret1);
  check('opened doorway is passable', doorBlockedNow === false, doorBlockedNow ? 'still blocked' : 'clear');
  await ev((s) => window.__MT_TP__(s.x, s.z + 0.85, Math.PI), secret1);
  await ev(() => window.__MT_KEY__('KeyW', true));
  const inside = await waitUntilBlocked(async () => (await ev(() => window.__MT_PLAYER__())).pos, 90000);
  await ev(() => window.__MT_KEY__('KeyW', false));
  check(
    'walks through the opened door into the annex',
    inside[2] < secret1.z + 0.2 && inside[2] > secret1.z - 2.2,
    `z=${inside[2].toFixed(2)} (door ${secret1.z.toFixed(2)}) · state ` +
      JSON.stringify(await walkableState()),
  );
  check('no penetration inside the annex', !(await ev((p) => window.__MT_HITS__(p[0], p[1], p[2]), inside)));
  const nearCache = await until(() => ev(() => window.__MT_INTERACT__()), (n) => n.near === 'secret-cache', 15000);
  check('the sealed coffer can be reached', nearCache.near === 'secret-cache', JSON.stringify(nearCache));
  await ev(() => window.__MT_PRESS__('KeyE'));
  const cacheCard = await openCard();
  check('coffer read-out opens', cacheCard.open === true);
  await ev(() => window.__MT_PRESS__('KeyE'));
  await closeCard();
  await shot(page, warnings, '17-annex-door.png');

  // ---- 8. NPC extraction + contradiction ----------------------------------
  await waitCooldown();
  await ev((s) => window.__MT_TP__(s.x - 2.2, s.z + 1.0, Math.PI / 2), attendant);
  await nearSource('src-station-attendant');
  const npcPrompt = await promptText();
  check('NPC prompts extraction by name', /Extract memory — Station attendant/.test(npcPrompt), npcPrompt);
  await ev(() => window.__MT_PRESS__('KeyE'));
  const mem2 = await until(() => ev(() => window.__MT_MEM__()), (m) => m.count >= 2, 25000);
  check(
    'extraction from a person works',
    mem2.count === 2 && mem2.collected.some((c) => c.id === 'mem-station-last-look'),
    JSON.stringify(mem2.collected.map((c) => c.id)),
  );
  await ev(() => window.__MT_JOURNAL__(false)); // recovery auto-opened the journal

  await nearSource('src-station-attendant');
  const talkPrompt = await promptText();
  check('held NPC offers talk instead of extraction', /Talk to/.test(talkPrompt), talkPrompt);
  await ev(() => window.__MT_PRESS__('KeyE'));
  await openCard();
  const lockedTalk = await cardBody();
  check('talk before replay gives the guarded line', /Finish the reading first/.test(lockedTalk), lockedTalk.slice(0, 52));
  await ev(() => window.__MT_PRESS__('KeyE'));
  await closeCard();

  await waitCooldown();
  await ev((s) => window.__MT_TP__(s.x - 2.2, s.z + 1.0, Math.PI / 2), warden);
  await nearSource('src-archive-warden');
  await ev(() => window.__MT_PRESS__('KeyE'));
  const mem3 = await until(() => ev(() => window.__MT_MEM__()), (m) => m.count >= 3, 25000);
  check('third fragment recorded (the warden)', mem3.count === 3, JSON.stringify(mem3.collected.map((c) => c.id)));
  await ev(() => window.__MT_JOURNAL__(false));

  const con = mem3.contradictions;
  check('contradiction surfaces when both legs are held', con.length === 1 && con[0].believed === null, JSON.stringify(con));
  await ev(() => window.__MT_JOURNAL__(true));
  const conDom = await ev(() => document.querySelectorAll('.journal-contradiction').length);
  check('journal shows the contradiction block', conDom === 1, `${conDom} blocks`);
  await ev(() => window.__MT_PRESS__('Digit1')); // weigh row 1 = the attendant's account
  const deduced = await until(
    () => ev(() => window.__MT_MEM__()),
    (m) => m.contradictions[0]?.believed === 'mem-station-last-look',
    15000,
  );
  check(
    'player tags which record they distrust',
    deduced.contradictions[0]?.believed === 'mem-station-last-look',
    JSON.stringify(deduced.contradictions),
  );
  await ev(() => window.__MT_JOURNAL__(false));

  // ---- 9. dialogue unlock (market trader): extract → replay → talk --------
  await waitCooldown();
  await ev((s) => window.__MT_TP__(s.x - 2.2, s.z + 1.0, Math.PI / 2), trader);
  await nearSource('src-market-trader');
  await ev(() => window.__MT_PRESS__('KeyE'));
  const mem4 = await until(() => ev(() => window.__MT_MEM__()), (m) => m.count >= 4, 25000);
  check('fourth fragment recorded (the trader)', mem4.count === 4, JSON.stringify(mem4.collected.map((c) => c.id)));
  await ev(() => window.__MT_JOURNAL__(false));

  const startedTrader = await ev((id) => window.__MT_RECON_START__(id), 'mem-market-bargain');
  check('replay starts at the trader site', startedTrader === true, String(startedTrader));
  await replayTo('mem-market-bargain');
  await until(() => ev(() => window.__MT_RECON__()), (r) => r.active === false, 30000);
  await nearSource('src-market-trader');
  await ev(() => window.__MT_PRESS__('KeyE'));
  await openCard();
  const traderLine = await cardBody();
  check('dialogue line unlocks after replay', /I sold one coil/.test(traderLine), traderLine.slice(0, 56));
  await ev(() => window.__MT_PRESS__('KeyE'));
  await closeCard();

  // ---- 10. conditional dialogue on a fragment-less NPC (the clerk) --------
  await waitCooldown();
  await ev((s) => window.__MT_TP__(s.x - 1.9, s.z, Math.PI / 2), directory);
  await nearSource('src-tower-directory');
  await ev(() => window.__MT_PRESS__('KeyE'));
  const mem5 = await until(() => ev(() => window.__MT_MEM__()), (m) => m.count >= 5, 25000);
  check('fifth fragment recorded (the directory)', mem5.count === 5, JSON.stringify(mem5.collected.map((c) => c.id)));
  await ev(() => window.__MT_JOURNAL__(false));
  await ev((id) => window.__MT_RECON_START__(id), 'mem-tower-elevator');
  await replayTo('mem-tower-elevator');
  await until(() => ev(() => window.__MT_RECON__()), (r) => r.active === false, 30000);
  // stand beyond the directory source's radius (3.2 m) but inside the clerk's
  // (2.6 m) — the sign sits only ~3.3 m from the clerk, so a naive offset
  // would land closest to the sign and read its card instead of the clerk
  await ev((s) => window.__MT_TP__(s.x + 2.24, s.z - 0.87, -1.2), clerk);
  await nearSource('src-glassline-clerk');
  const clerkPrompt = await promptText();
  check('clerk offers talk from a clean position', /Talk to the night clerk/.test(clerkPrompt), clerkPrompt);
  await ev(() => window.__MT_PRESS__('KeyE'));
  await openCard();
  const clerkLine = await cardBody();
  check('clerk dialogue unlocks from another fragment', /shelf/.test(clerkLine), clerkLine.slice(0, 56));
  await ev(() => window.__MT_PRESS__('KeyE'));
  await closeCard();

  // ---- 11. Resonance Sight: locked → unlock → use → cooldown -------------
  await ev(() => window.__MT_PRESS__('KeyV'));
  const ab0 = await ev(() => window.__MT_ABILITY__());
  check('V is locked before the archive memory', ab0.unlocked === false && ab0.active === false, JSON.stringify(ab0));

  await ev((s) => window.__MT_TP__(s.x - 2.2, s.z + 1.0, Math.PI / 2), warden);
  await nearSource('src-archive-warden');
  await ev((id) => window.__MT_RECON_START__(id), 'mem-archive-seal');
  await replayTo('mem-archive-seal');
  await until(() => ev(() => window.__MT_RECON__()), (r) => r.active === false, 30000);
  const ab1 = await ev(() => window.__MT_ABILITY__());
  check('replaying the sealing unlocks Resonance Sight', ab1.unlocked === true, JSON.stringify(ab1));

  await ev(() => window.__MT_PRESS__('KeyV'));
  const ab2 = await until(() => ev(() => window.__MT_ABILITY__()), (a) => a.active === true, 12000);
  check('resonance sight activates', ab2.active === true && ab2.echoes === true, JSON.stringify(ab2));
  check('echo markers cover the city', ab2.echoesTotal >= 10, `${ab2.echoesTotal} echoes`);
  await shot(page, warnings, '18-resonance-sight.png');
  await ev(() => window.__MT_PRESS__('KeyV'));
  const ab3 = await until(() => ev(() => window.__MT_ABILITY__()), (a) => a.active === false, 12000);
  check('second V switches it off', ab3.active === false && ab3.cooldown > 0, `cooldown ${ab3.cooldown?.toFixed(1)}s`);
  await ev(() => window.__MT_PRESS__('KeyV'));
  await sleep2(700);
  const ab4 = await ev(() => window.__MT_ABILITY__());
  check(
    'cooldown blocks an immediate re-use',
    ab4.active === false,
    JSON.stringify({ active: ab4.active, cooldown: ab4.cooldown?.toFixed(1) }),
  );

  // ---- 12. clue markers ---------------------------------------------------
  await ev((s) => window.__MT_TP__(s.x - 2.2, s.z + 1.0, Math.PI / 2), attendant);
  await ev((id) => window.__MT_RECON_START__(id), 'mem-station-last-look');
  await replayTo('mem-station-last-look');
  await until(() => ev(() => window.__MT_RECON__()), (r) => r.active === false, 30000);
  const clue = await ev(() => window.__MT_CLUE__('station-board'));
  check('replay lights the overlooked clue marker', clue === true, String(clue));

  // ---- 13. persistence in-session -----------------------------------------
  const snap = await ev(() => window.__MT_MEM__());
  check('manager keeps every collected memory', snap.count === 5, `${snap.count}/6 recorded`);
  check(
    'every completed replay is recorded',
    snap.collected.filter((c) => c.reconstructed).length === 5,
    `${snap.collected.filter((c) => c.reconstructed).length} replayed`,
  );
  await ev(() => window.__MT_JOURNAL__(true));
  const finalItems = await ev(() => document.querySelectorAll('.journal-item').length);
  check('journal reopens with all fragments', finalItems === 5, `${finalItems} items`);
  await ev(() => window.__MT_JOURNAL__(false));

  const passed = results.filter((r) => r.ok).length;
  console.log(`[smoke] memory checks: ${passed}/${results.length} passed`);
  if (passed !== results.length) warnings.push(`${results.length - passed} memory check(s) failed`);
}

/* --------------------------------------------------------------------- *
 * Phase 4 — living city + stealth checks
 *
 * The agents perceive on the wall clock (reaction time is not a physics
 * quantity), so every ramp/alert/search/return window below completes in
 * real seconds even when SwiftShader renders at a fraction of an FPS. Agent
 * *movement* is on the simulation step, so the patrol-displacement check
 * uses a generous wall window and only demands a small metre threshold.
 *
 * The three stealth states the player can read (hidden / suspicious /
 * detected) are all reachable, each carries a plain-language reason, and the
 * cover + restricted-zone rules are the positioning levers that decide them.
 * --------------------------------------------------------------------- */

async function runCityLifeTests(page, errors, warnings) {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    const line = `${name}${detail ? ` — ${detail}` : ''}`;
    if (ok) console.log(`[smoke]   ok   ${line}`);
    else {
      errors.push(`cityLife: ${line}`);
      console.log(`[smoke]   FAIL ${line}`);
    }
  };
  const ev = (fn, ...args) => page.evaluate(fn, ...args);
  const sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
  // hidden prompts must read as "no prompt": the label element can hold stale
  // text, so gate the read on the container's visibility
  const promptText = () =>
    ev(() => {
      const el = document.getElementById('prompt');
      return !el || el.classList.contains('hidden') ? '' : (document.getElementById('prompt-label')?.textContent ?? '');
    });
  const cardBody = () => ev(() => document.getElementById('inspect-body')?.textContent ?? '');

  async function until(fn, predicate, timeoutMs = 20000, intervalMs = 400) {
    const deadline = Date.now() + timeoutMs;
    let value = await fn();
    while (!predicate(value) && Date.now() < deadline) {
      await sleep2(intervalMs);
      value = await fn();
    }
    return value;
  }

  // clean, deterministic slate: no glove cooldown, fresh stealth meter
  await ev(() => {
    window.__MT_SET_MODE__('play');
    window.__MT_GLOVE_CD__(0);
    return true;
  });

  const agents = await ev(() => window.__MT_AGENTS__());
  const guard1 = agents.find((a) => a.type === 'guard');
  const guard2 = agents.filter((a) => a.type === 'guard')[1];
  const spot = (await ev(() => window.__MT_HIDE__()))[0];
  const zones = await ev(() => window.__MT_ZONES__());
  const underarch = zones.find((z) => z.id === 'underarchive');

  // ---- 1. placement -------------------------------------------------------
  check(
    'living city population spawns',
    agents.length >= 10,
    `${agents.length} agents (${JSON.stringify(
      agents.reduce((m, a) => ({ ...m, [a.type]: (m[a.type] ?? 0) + 1 }), {}),
    )})`,
  );
  check(
    'every archetype is on the street',
    !!guard1 && !!guard2 && agents.some((a) => a.type === 'civilian') && agents.some((a) => a.type === 'vendor') && agents.some((a) => a.type === 'target'),
    'guard · civilian · vendor · target',
  );
  check(
    'hide spots + restricted zones present',
    (spot ? 1 : 0) > 0 && zones.length >= 2,
    `${(await ev(() => window.__MT_HIDE__())).length} cover spots, zones: ${zones.map((z) => z.id).join(', ')}`,
  );

  // ---- 2. patrol movement (simulation clock — small threshold, wide window)
  const before = agents.map((a) => ({ id: a.id, x: a.x, z: a.z }));
  let maxMove = 0;
  for (let i = 0; i < 15; i++) {
    await sleep2(8000);
    const now = await ev(() => window.__MT_AGENTS__());
    maxMove = Math.max(
      ...now.map((a) => {
        const b = before.find((p) => p.id === a.id);
        return b ? Math.hypot(a.x - b.x, a.z - b.z) : 0;
      }),
    );
    if (maxMove > 0.8) break;
  }
  check('agents walk their rounds', maxMove > 0.8, `max displacement ${maxMove.toFixed(2)} m`);
  check(
    'every agent has designated pause points',
    agents.every((a) => a.pauses >= 2),
    `${Math.min(...agents.map((a) => a.pauses))} pauses each`,
  );

  // ---- 3. no wall penetration / stays grounded ----------------------------
  const pen = await ev(() =>
    window.__MT_AGENTS__().map((a) => ({
      id: a.id,
      blocked: window.__MT_HITS__(a.x, a.y + 0.1, a.z, 0.32), // AGENT_RADIUS, not the player's
      dy: Math.abs(window.__MT_GROUND__(a.x, a.z) - a.y),
    })),
  );
  check(
    'walking agents never clip into solid geometry',
    pen.every((p) => p.blocked === false),
    `${pen.filter((p) => p.blocked).length} embedded (agent radius 0.32)`,
  );
  check(
    'walking agents stay on the ground',
    pen.every((p) => p.dy <= 0.15),
    `max height drift ${Math.max(...pen.map((p) => p.dy)).toFixed(3)} m`,
  );

  // ---- 4. pause state is reachable (test seam starts the countdown) -------
  const firstId = agents[0].id;
  await ev((id) => window.__MT_AGENT_PAUSE__(id, 0.12), firstId);
  const paused = await until(() => ev(() => window.__MT_AGENTS__()), (list) => list.find((a) => a.id === firstId)?.mode === 'pause', 6000);
  check('agent pauses at a designated spot', paused.find((a) => a.id === firstId)?.mode === 'pause');
  // record every mode seen on the way back so a failure explains itself
  const seenModes = new Set();
  let resumeRec = null;
  const resumeDeadline = Date.now() + 20000;
  while (Date.now() < resumeDeadline) {
    const list = await ev(() => window.__MT_AGENTS__());
    const a = list.find((x) => x.id === firstId);
    if (a) {
      seenModes.add(a.mode);
      if (a.mode === 'route') {
        resumeRec = a;
        break;
      }
    }
    await sleep2(250);
  }
  check(
    'pause ends and the round resumes',
    resumeRec !== null,
    `modes seen: ${[...seenModes].join(',') || 'none'}`,
  );

  // ---- 5. stealth HUD starts hidden --------------------------------------
  await ev(() => window.__MT_SPAWN__('oldquarter'));
  const startSt = await until(() => ev(() => window.__MT_STEALTH__()), (s) => s.state === 'hidden', 15000);
  check('stealth HUD starts hidden', startSt.state === 'hidden', `"${startSt.reason}"`);

  // ---- 6. detection ramp with a reason the player can read -----------------
  const pxz = await ev(() => window.__MT_PLAYER__());
  const [px, , pz] = pxz.pos; // pos = [x, y, z]
  await ev((id, x, z, fx, fz) => window.__MT_AGENT_POS__(id, x, z, fx, fz), guard1.id, px + 5, pz + 3, px, pz);
  // guard2 sits just outside the player's view radius (14.3 m > 14) but
  // within shouting distance of guard1 (17.1 m < 18) — on the same road,
  // so it can only learn about you by the alert, not by seeing you
  await ev((id, x, z, fx, fz) => window.__MT_AGENT_POS__(id, x, z, fx, fz), guard2.id, px + 3, pz - 14, px, pz);
  // face the sprint west, down the open road: neither guard's geometry
  // depends on where the spawn yaw happens to point
  await ev((x, z) => window.__MT_TP__(x, z, -Math.PI / 2), px, pz);
  await ev(() => {
    window.__MT_KEY__('ShiftLeft', true);
    window.__MT_KEY__('KeyW', true);
  });
  const susp = await until(() => ev(() => window.__MT_STEALTH__()), (s) => s.state === 'suspicious', 25000);
  check(
    'sprinting in view raises SUSPICIOUS with a reason',
    susp.state === 'suspicious' && /watching|sprinting/i.test(susp.reason),
    `"${susp.reason}"`,
  );
  const det = await until(() => ev(() => window.__MT_STEALTH__()), (s) => s.state === 'detected', 25000);
  check(
    'sustained sprint escalates to DETECTED',
    det.state === 'detected' && /sprinting|seen|guard/i.test(det.reason),
    `"${det.reason}"`,
  );
  await ev(() => {
    window.__MT_KEY__('ShiftLeft', false);
    window.__MT_KEY__('KeyW', false);
  });

  // ---- 7. guard investigates last-known, and alerts a nearby guard --------
  const inv = await until(() => ev(() => window.__MT_AGENTS__()), (list) => list.find((a) => a.id === guard1.id)?.mode === 'investigate', 12000);
  const g1i = inv.find((a) => a.id === guard1.id);
  check('detecting guard moves to investigate', g1i?.mode === 'investigate', `awareness ${g1i?.awareness?.toFixed(2)}`);
  const alerted = await until(() => ev(() => window.__MT_AGENTS__()), (list) => list.find((a) => a.id === guard2.id)?.mode === 'investigate', 12000);
  check('nearby guard is alerted', alerted.find((a) => a.id === guard2.id)?.mode === 'investigate');

  // ---- 8. leave the area: investigate → search → return → route ----------
  await ev((x, z) => window.__MT_TP__(x, z + 70, 0), px, pz);
  const searched = await until(() => ev(() => window.__MT_AGENTS__()), (list) => list.find((a) => a.id === guard1.id)?.mode === 'search', 16000);
  check('guard searches after losing the player', searched.find((a) => a.id === guard1.id)?.mode === 'search');
  check('searching state is readable', (await ev(() => window.__MT_STEALTH__())).state === 'searching');
  const returned = await until(() => ev(() => window.__MT_AGENTS__()), (list) => list.find((a) => a.id === guard1.id)?.mode === 'return', 20000);
  check('guard gives up and returns to its round', returned.find((a) => a.id === guard1.id)?.mode === 'return');
  const backRoute = await until(() => ev(() => window.__MT_AGENTS__()), (list) => list.find((a) => a.id === guard1.id)?.mode === 'route', 40000);
  check('round resumes once the search ends', backRoute.find((a) => a.id === guard1.id)?.mode === 'route');
  // the alerted guard runs its own cycle a beat behind — give it time to
  // finish its round too before the street reads as quiet again
  const settle = await until(() => ev(() => window.__MT_STEALTH__()), (s) => s.state === 'hidden', 60000);
  check('stealth returns to HIDDEN when attention ends', settle.state === 'hidden', `"${settle.reason}"`);

  // ---- 9. restricted area amplifies detection ----------------------------
  await ev((x, z) => window.__MT_TP__(x, z, 0), underarch.x0 + 8, underarch.z0 + 8);
  const zoneSt = await until(() => ev(() => window.__MT_STEALTH__()), (s) => s.zone === 'underarchive', 8000);
  check('stepping inside a restricted zone is detected', zoneSt.zone === 'underarchive');
  await ev(
    (id, x, z, fx, fz) => window.__MT_AGENT_POS__(id, x, z, fx, fz),
    guard1.id,
    underarch.x0 + 15,
    underarch.z0 + 15,
    underarch.x0 + 8,
    underarch.z0 + 8,
  );
  const zoneDet = await until(() => ev(() => window.__MT_STEALTH__()), (s) => s.state === 'detected' && /inside/i.test(s.reason), 30000);
  check('restricted-zone detection names the zone', zoneDet.state === 'detected' && /inside/i.test(zoneDet.reason), `"${zoneDet.reason}"`);

  // ---- 10. cover breaks line of sight ------------------------------------
  // get seen in the open first (road beside the crates, west side), then duck
  // behind them: the guard keeps the last known spot but loses you completely
  await ev((x, z) => window.__MT_TP__(x, z, 0), spot.x - 4.7, spot.z); // on the road, 4.7 m out
  await ev((id, x, z, fx, fz) => window.__MT_AGENT_POS__(id, x, z, fx, fz), guard1.id, spot.x - 10.7, spot.z, spot.x - 4.7, spot.z);
  await ev(() => {
    window.__MT_KEY__('ShiftLeft', true);
    window.__MT_KEY__('KeyW', true);
  });
  await until(() => ev(() => window.__MT_STEALTH__()), (s) => s.state === 'detected', 25000);
  await ev(() => {
    window.__MT_KEY__('ShiftLeft', false);
    window.__MT_KEY__('KeyW', false);
  });
  await ev((x, z) => window.__MT_TP__(x, z, 0), spot.x - 1.6, spot.z - 1.0); // behind the crates
  const inCover = await until(() => ev(() => window.__MT_STEALTH__()), (s) => s.cover === true, 15000);
  check('hide spots are real cover', inCover.cover === true);
  // hidden only lands once the guard finishes its investigate/search/return
  // cycle — that is wall-clock time, so budget for the full loop
  const lost = await until(() => ev(() => window.__MT_STEALTH__()), (s) => s.state === 'hidden' && /cover/i.test(s.reason), 60000);
  const gv = (await ev(() => window.__MT_AGENTS__())).find((a) => a.id === guard1.id);
  check('cover drops back to HIDDEN and breaks sight', lost.state === 'hidden' && gv.visible === false, `"${lost.reason}"`);

  // ---- 11. extraction attracts attention in the open, not behind cover ---
  await ev(() => window.__MT_GLOVE_CD__(0));
  const coverEmit = await ev(() => window.__MT_EMIT__('extraction'));
  check('extraction behind cover reaches no one', coverEmit === 0, `${coverEmit} notified`);
  // same road, out of the 2.3 m hide volume; guard posted 5 m off the act
  await ev((x, z) => window.__MT_TP__(x, z, 0), spot.x - 4.7, spot.z);
  await ev((id, x, z, fx, fz) => window.__MT_AGENT_POS__(id, x, z, fx, fz), guard1.id, spot.x - 9.7, spot.z, spot.x - 4.7, spot.z);
  const openEmit = await ev(() => window.__MT_EMIT__('extraction'));
  await sleep2(900);
  const gv2 = (await ev(() => window.__MT_AGENTS__())).find((a) => a.id === guard1.id);
  check('extraction in the open is noticed', openEmit >= 1 && gv2.awareness > 0.3, `${openEmit} notified, awareness ${gv2.awareness.toFixed(2)}`);

  // ---- 12. agents respond to interaction; target dialogue is gated ------
  await ev((id, x, z, fx, fz) => window.__MT_AGENT_POS__(id, x, z, fx, fz), guard1.id, px + 1.5, pz, px, pz);
  await ev((x, z) => window.__MT_TP__(x, z, 0), px, pz);
  const talkPrompt = await until(promptText, (t) => /Talk to the/i.test(t), 15000);
  const talkDbg = await ev(() => window.__MT_PROMPT_DBG__());
  check(
    'walking up to an agent offers a talk prompt',
    /Talk to the security guard/i.test(talkPrompt),
    `${talkPrompt} | claimants=${JSON.stringify({ src: talkDbg.src, agent: talkDbg.agent, it: talkDbg.it, p: talkDbg.p })}`,
  );
  await ev(() => window.__MT_PRESS__('KeyE'));
  const openTalk = await until(() => ev(() => window.__MT_INTERACT__()), (n) => n.open === true, 15000);
  check('E opens the agent conversation', openTalk.open === true);
  await ev(() => window.__MT_PRESS__('Escape'));
  await until(() => ev(() => window.__MT_INTERACT__()), (n) => n.open === false, 15000);

  const courier = agents.find((a) => a.type === 'target');
  const mem = await ev(() => window.__MT_MEM__());
  const hasTower = mem.collected.some((c) => c.id === 'mem-tower-elevator');
  await ev((id, x, z) => window.__MT_AGENT_POS__(id, x, z), guard1.id, px - 30, pz);
  await ev((id, x, z, fx, fz) => window.__MT_AGENT_POS__(id, x, z, fx, fz), courier.id, px + 1.5, pz, px, pz);
  await ev((x, z) => window.__MT_TP__(x, z, 0), px, pz);
  const courierPrompt = await until(promptText, (t) => /Talk to the palisade courier/i.test(t), 15000);
  check('investigation target is talkable by name', /palisade courier/i.test(courierPrompt), courierPrompt);
  await ev(() => window.__MT_PRESS__('KeyE'));
  await until(() => ev(() => window.__MT_INTERACT__()), (n) => n.open === true, 15000);
  const courierBody = await cardBody();
  await ev(() => window.__MT_PRESS__('Escape'));
  await until(() => ev(() => window.__MT_INTERACT__()), (n) => n.open === false, 15000);
  check(
    'courier dialogue changes once the tower memory is reconstructed',
    hasTower ? /floor 40/i.test(courierBody) : !/floor 40/i.test(courierBody),
    hasTower ? 'gated line shown' : 'baseline line shown',
  );

  // ---- 13. performance budget --------------------------------------------
  const stats = await ev(() => window.__MT_STATS__());
  check('agent crowd stays within the draw-call budget', stats.calls > 0 && stats.calls < 800, `${stats.calls} calls`);

  await ev(() => window.__MT_GLOVE_CD__(0));
  const passed = results.filter((r) => r.ok).length;
  console.log(`[smoke] city-life checks: ${passed}/${results.length} passed`);
  if (passed !== results.length) warnings.push(`${results.length - passed} city-life check(s) failed`);
}

/* --------------------------------------------------------------------- *
 * Phase 5 — story: the Venn case, played end to end
 *
 * Ports scripts/probe-story.mjs into the suite: the opening chapter from a
 * fresh case state through both dialogue-choice paths, order-independent
 * objectives, the locked records cage (wrong/delayed actions included), the
 * optional side investigation, journal evidence, and persistence. Phases
 * 2–4 already ran in this page session, so five fragments are held and the
 * annex door is unbarred — the same state a player reaches organically.
 * --------------------------------------------------------------------- */

async function runStoryTests(page, errors, warnings) {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    const line = detail ? `${name} — ${detail}` : name;
    if (ok) console.log(`[smoke]   ok   ${line}`);
    else {
      errors.push(`story: ${line}`);
      console.log(`[smoke]   FAIL ${line}`);
    }
  };
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
  const story = () => ev(() => window.__MT_STORY__());
  const dlg = () => ev(() => window.__MT_DIALOGUE__());
  const tp = async (x, z) => {
    await ev((a, b) => window.__MT_TP__(a, b), x, z);
    await sleep(1200); // let a slow frame settle the teleport
  };
  const promptText = () =>
    ev(() => {
      const el = document.getElementById('prompt');
      if (!el || el.classList.contains('hidden')) return '';
      return document.getElementById('prompt-label')?.textContent || '';
    });
  const inspectBody = () =>
    ev(() => {
      const el = document.getElementById('inspect');
      if (!el || el.classList.contains('hidden')) return '';
      return document.getElementById('inspect-body')?.textContent || '';
    });
  const press = async (code) => {
    await ev((c) => window.__MT_PRESS__(c), code);
    await sleep(700);
  };
  const closeJournal = async () => {
    await ev(() => window.__MT_JOURNAL__(false));
    await sleep(350);
  };
  /** Poll for a prompt — SwiftShader can need a frame or two after a teleport. */
  async function waitPrompt(pred, timeout = 30000) {
    return until(promptText, pred, timeout);
  }
  /** Press E at the prompt and wait for the conversation card. */
  async function openDialogue(expectLabel, timeout = 30000) {
    const p = await waitPrompt((t) => expectLabel.test(t), timeout);
    check(`prompt: ${expectLabel}`, expectLabel.test(p), p || '(none)');
    if (!expectLabel.test(p)) return false;
    await press('KeyE');
    const d = await until(dlg, (x) => x.open, 30000);
    check('dialogue opened', d.open, (d.title || '').slice(0, 44));
    return d.open;
  }
  async function choose(i) {
    await ev((k) => window.__MT_DIALOGUE_CHOOSE__(k), i);
    await sleep(700);
    const d = await dlg();
    check(`choice ${i} accepted`, d.open, (d.body || '').slice(0, 44).replace(/\s+/g, ' '));
    return d;
  }
  const closeDlg = async () => {
    if (!(await dlg()).open) return; // never leak an E into the world
    await press('KeyE');
    const d = await until(dlg, (x) => !x.open, 20000);
    check('dialogue closed', !d.open);
  };

  await ev(() => window.__MT_SET_MODE__('play'));
  await closeJournal();

  /* ---- 1. a fresh case ------------------------------------------------ */
  let s = await story();
  check('case: main mission active on entry', s.missions?.[0]?.status === 'active', s.missions?.[0]?.status);
  check('case: side mission locked on entry', s.missions?.[1]?.status === 'locked', s.missions?.[1]?.status);
  check('case: no evidence on entry', (s.evidence || []).length === 0, String(s.evidence?.length));
  const mk = await until(() => story(), (t) => (t.markers || []).length > 0, 20000);
  check('case: marker points at Tomas', mk.markers?.[0]?.id === 'tomas', JSON.stringify(mk.markers?.[0] || null));

  /* ---- 2. case-file tab before the meeting ---------------------------- */
  await ev(() => {
    window.__MT_JOURNAL__(true);
    window.__MT_CASE__('case');
  });
  await sleep(500);
  let c = await ev(() => window.__MT_CASE__());
  check('case file: single objective before the meeting', c.objectives === 1, String(c.objectives));
  check('case file: nothing done yet', c.objectivesDone === 0, String(c.objectivesDone));
  check('case file: side mission listed but locked', (c.missions || []).includes('third-watch'));
  await closeJournal();

  /* ---- 3. the locked location is invisible before the case ------------ */
  const secret0 = await ev(() => window.__MT_SECRET__());
  check('annex door unbarred by the memory replay', !!(secret0 && secret0.open), JSON.stringify(secret0));
  const sources = await ev(() => window.__MT_SOURCES__());
  const byId = (id) => sources.find((x) => x.id === id);
  await tp(secret0.x + 0.1, secret0.z - 0.45);
  const preCasePrompt = await waitPrompt((t) => t.length > 0, 20000);
  check(
    'records cage has no prompt before the case opens',
    !/records cage/i.test(preCasePrompt),
    preCasePrompt || '(none)',
  );

  /* ---- 4. meet Tomas (choice A) ---------------------------------------- */
  const tpos = await ev((id) => window.__MT_STORY_POS__(id), 'tomas');
  check('Tomas stands in the world', !!tpos && Number.isFinite(tpos.x), JSON.stringify(tpos));
  await tp(tpos.x + 1.5, tpos.z + 1.5);
  let ok = await openDialogue(/Talk to Tomas Venn/);
  if (ok) {
    let d = await dlg();
    check('commission offers two choices', (d.choices || []).length === 2, String((d.choices || []).length));
    check('commission names Mira Venn', /Mira/.test(d.body || ''));
    d = await choose(0); // "I'll take it"
    check('choice A hands over the route note', /route|wrote it down/i.test(d.body || ''), (d.body || '').slice(0, 40));
    await closeDlg();
  }
  s = await story();
  const fl = (n) => (s.flags || []).includes(n);
  check('commission: met-tomas flag', fl('met-tomas'));
  check('commission: route-note flag (choice A)', fl('route-note'));
  check('commission: hiring evidence filed', !!s.evidence.find((e) => e.id === 'ev-hiring'));
  check('commission: route evidence filed', !!s.evidence.find((e) => e.id === 'ev-route'));
  check('commission: no retainer on the A path', !s.evidence.find((e) => e.id === 'ev-retainer'));

  /* ---- 5. wrong action: the cage, before the key ----------------------- */
  await tp(secret0.x + 0.1, secret0.z - 0.45);
  const lockedPrompt = await waitPrompt((t) => /records cage/i.test(t), 30000);
  check('cage prompts once the case is open', /records cage/i.test(lockedPrompt), lockedPrompt || '(none)');
  if (/records cage/i.test(lockedPrompt)) await press('KeyE');
  const lockedCard = await until(inspectBody, (b) => b.length > 0, 20000);
  check('cage without the key explains itself', /three findings|key/i.test(lockedCard), lockedCard.slice(0, 56));
  await press('Escape');
  await until(inspectBody, (b) => b.length === 0, 15000);

  /* ---- 6. delayed action: Tomas's status line mid-case ----------------- */
  await tp(tpos.x + 1.5, tpos.z + 1.5);
  ok = await openDialogue(/Talk to Tomas Venn/);
  if (ok) {
    const d = await dlg();
    check('mid-case status lists the outstanding work', /trader|station|tower/i.test(d.body || ''), (d.body || '').slice(0, 52).replace(/\s+/g, ' '));
    await closeDlg();
  }

  /* ---- 7. witness one: the attendant ----------------------------------- */
  const att = byId('src-station-attendant');
  await tp(att.x + 1.5, att.z + 1.5);
  ok = await openDialogue(/Talk to the station attendant/);
  if (ok) {
    let d = await dlg();
    check('attendant can be asked about Mira', /Mira/.test(JSON.stringify(d.choices || [])));
    d = await choose(0);
    check('attendant account: 23:40', /23:40/.test(d.body || ''), (d.body || '').slice(0, 40));
    await closeDlg();
  }
  s = await story();
  check('attendant: asked-attendant flag', fl('asked-attendant'));
  check('attendant: sighting evidence filed', !!s.evidence.find((e) => e.id === 'ev-sighting'));

  /* ---- 8. witness two: the courier (truth path) ------------------------ */
  const agents = await ev(() => window.__MT_AGENTS__());
  const courier = agents.find((a) => a.type === 'target');
  check('courier walks the city', !!courier, courier ? courier.id : 'none');
  if (courier) {
    // a memory source outranks an agent on the prompt: step away first
    await ev(() => window.__MT_SPAWN__('oldquarter'));
    await sleep(900);
    const p = await ev(() => window.__MT_PLAYER__());
    await ev(
      (id, x, z, fx, fz) => window.__MT_AGENT_POS__(id, x, z, fx, fz),
      courier.id, p.pos[0] + 1.5, p.pos[2], p.pos[0], p.pos[2],
    );
    ok = await openDialogue(/palisade courier/i);
    if (ok) {
      let d = await dlg();
      check('courier offers two choices', (d.choices || []).length === 2, String((d.choices || []).length));
      d = await choose(0); // tell the truth
      check('courier truth: 23:52 / floor 40', /23:52|floor 40/i.test(d.body || ''), (d.body || '').slice(0, 44));
      await closeDlg();
    }
    // consequence: the same courier refuses to open the case again
    const p2 = await ev(() => window.__MT_PLAYER__());
    await ev(
      (id, x, z, fx, fz) => window.__MT_AGENT_POS__(id, x, z, fx, fz),
      courier.id, p2.pos[0] + 1.5, p2.pos[2], p2.pos[0], p2.pos[2],
    );
    ok = await openDialogue(/palisade courier/i);
    if (ok) {
      const d = await dlg();
      check('courier goes cold after the truth', !d.choices || d.choices.length === 0, (d.body || '').slice(0, 44));
      await closeDlg();
    }
  }
  s = await story();
  check('courier: tower-traced flag', (s.flags || []).includes('tower-traced'));
  check('courier: courier-cold consequence flag', (s.flags || []).includes('courier-cold'));
  check('courier: cut ledger page filed', !!s.evidence.find((e) => e.id === 'ev-tower-ledger'));

  /* ---- 9. witness three LAST — objectives are order-independent -------- */
  const trader = byId('src-market-trader');
  await tp(trader.x + 1.5, trader.z + 1.5);
  ok = await openDialogue(/Talk to the night market trader/);
  if (ok) {
    await choose(0); // ask about Mira
    const d = await dlg();
    check('trader account: coil sleeve', /coil sleeve/i.test(d.body || ''), (d.body || '').slice(0, 44));
    await closeDlg();
  }
  s = await story();
  check('trader: asked-trader flag', (s.flags || []).includes('asked-trader'));
  check('trader: account evidence filed', !!s.evidence.find((e) => e.id === 'ev-trader-account'));

  /* ---- 10. three findings → Tomas hands over the key ------------------- */
  await ev(() => {
    window.__MT_JOURNAL__(true);
    window.__MT_CASE__('case');
  });
  await sleep(400);
  c = await ev(() => window.__MT_CASE__());
  check('case file: 4 objectives done after all three', c.objectivesDone === 4, `done=${c.objectivesDone} of ${c.objectives}`);
  check('case file: key objective now visible', c.objectives >= 5, String(c.objectives));
  await closeJournal();
  await tp(tpos.x + 1.5, tpos.z + 1.5);
  ok = await openDialogue(/Talk to Tomas Venn/);
  if (ok) {
    const d = await dlg();
    check('key handover names the records cage', /records cage/i.test(d.body || ''), (d.body || '').slice(0, 50).replace(/\s+/g, ' '));
    await closeDlg();
  }
  s = await story();
  check('key: annex-key flag', (s.flags || []).includes('annex-key'));

  /* ---- 11. the cage opens; the work box waits inside -------------------- */
  await tp(secret0.x + 0.1, secret0.z - 0.45);
  const withKey = await waitPrompt((t) => /records cage/i.test(t), 30000);
  check('cage prompts with the key in hand', /records cage/i.test(withKey), withKey || '(none)');
  if (/records cage/i.test(withKey)) await press('KeyE');
  const opened = await until(() => story(), (t) => t.cage && t.cage.open, 30000);
  check('records cage gate drops', !!(opened.cage && opened.cage.open), opened.cage ? JSON.stringify(opened.cage) : 'no cage state');
  check('work box replaces the gate prompt', !!(opened.cage && opened.cage.boxInWorld));
  await tp(secret0.x - 0.5, secret0.z - 1.35);
  const boxPrompt = await waitPrompt((t) => /work box/i.test(t), 30000);
  check('work box prompts inside the cage', /work box/i.test(boxPrompt), boxPrompt || '(none)');
  if (/work box/i.test(boxPrompt)) await press('KeyE');
  const dfin = await until(dlg, (x) => x.open, 30000);
  check('work box opens the finale', dfin.open, (dfin.title || '').slice(0, 44));
  check('finale puts Riven Vale on the intake list', /RIVEN VALE/.test(dfin.body || ''));
  await closeDlg();
  s = await story();
  check('finale: case-closed flag', (s.flags || []).includes('case-closed'));
  check('main mission complete', s.missions?.[0]?.status === 'complete', s.missions?.[0]?.status);
  check('ledger evidence filed', !!s.evidence.find((e) => e.id === 'ev-ledger'));
  check('intake-list evidence filed', !!s.evidence.find((e) => e.id === 'ev-intake'));
  check('witness discrepancy computed', !!s.discrepancy, String(s.discrepancy).slice(0, 48));
  check('case completes without the optional memory', s.missions?.[1]?.status === 'active', s.missions?.[1]?.status);
  check('optional garden memory still unheld', !(await hasMem('mem-garden-observance')));

  /* ---- 12. the optional side investigation ----------------------------- */
  const clerk = byId('src-glassline-clerk');
  await tp(clerk.x + 1.5, clerk.z + 1.5);
  ok = await openDialogue(/Talk to the night clerk/);
  if (ok) {
    await choose(0); // the vigil question
    const d = await dlg();
    check('clerk points at the observance', /vigil|eleven/i.test(d.body || ''), (d.body || '').slice(0, 44));
    await closeDlg();
  }
  await ev(() => window.__MT_GLOVE_CD__(0));
  const plaque = byId('src-garden-plaque');
  await tp(plaque.x + 1.5, plaque.z + 1.5);
  const plaquePrompt = await waitPrompt((t) => /Extract memory/.test(t), 30000);
  check('plaque offers the optional memory', /Extract/.test(plaquePrompt), plaquePrompt || '(none)');
  if (/Extract memory/.test(plaquePrompt)) await press('KeyE');
  const sideHeld = await until(() => hasMem('mem-garden-observance'), (h) => h, 40000);
  check('optional memory recorded', sideHeld);
  await closeJournal(); // a finished reading opens the journal
  s = await story();
  check('side mission completes once its work is done', s.missions?.[1]?.status === 'complete', s.missions?.[1]?.status);
  check('eleven-names evidence filed', !!s.evidence.find((e) => e.id === 'ev-eleven-names'));

  /* ---- 13. the journal remembers everything ---------------------------- */
  await ev(() => {
    window.__MT_JOURNAL__(true);
    window.__MT_CASE__('case');
  });
  await sleep(400);
  c = await ev(() => window.__MT_CASE__());
  check('case file lists every finding (9 entries)', (c.evidence || []).length === 9, String((c.evidence || []).length));
  check('case file shows the discrepancy note', c.discrepancy === true);
  check('case file: both missions complete', c.missions?.length === 2, JSON.stringify(c.missions));
  await page.evaluate(() => document.querySelector('.case-ev')?.click());
  await sleep(300);
  c = await ev(() => window.__MT_CASE__());
  check('evidence expands with its full body', !!c.expandedBody && c.expandedBody.length > 40, (c.expandedBody || '').slice(0, 40));
  await closeJournal();
  await shot(page, warnings, '16-story-case-complete.png');

  /* ---- 14. the case survives a reload ---------------------------------- */
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__MT_READY__ === true', { timeout: 300000 });
  await sleep(1500);
  // a fresh load greets the player again — the title screen is deliberate
  const greetedAgain = await page.evaluate(() => (typeof window.__MT_WELCOME__ === 'function' ? window.__MT_WELCOME__() : 'missing'));
  check('welcome greets again after a fresh load', greetedAgain === true, String(greetedAgain));
  const dismissedAgain = await dismissWelcome(page);
  check('the walk resumes after the welcome', dismissedAgain === false, String(dismissedAgain));
  s = await story();
  check('after reload: main still complete', s.missions?.[0]?.status === 'complete', s.missions?.[0]?.status);
  check('after reload: evidence preserved', (s.evidence || []).length === 9, String((s.evidence || []).length));
  check('after reload: side still complete', s.missions?.[1]?.status === 'complete', s.missions?.[1]?.status);

  /* ---- 15. choice B: the retainer path (converging endings) ------------ */
  await ev(() => window.__MT_STORY_RESET__());
  await sleep(500);
  s = await story();
  check('story reset: case fresh again', s.missions?.[0]?.status === 'active' && (s.evidence || []).length === 0);
  const tpos2 = await ev((id) => window.__MT_STORY_POS__(id), 'tomas');
  await tp(tpos2.x + 1.5, tpos2.z + 1.5);
  ok = await openDialogue(/Talk to Tomas Venn/);
  if (ok) {
    await choose(1); // "What's in it for me?"
    const d = await dlg();
    check('choice B pays a retainer', /Fair|pay/i.test(d.body || ''), (d.body || '').slice(0, 44));
    await closeDlg();
  }
  s = await story();
  check('choice B: retainer evidence filed', !!s.evidence.find((e) => e.id === 'ev-retainer'));
  check('choice B: route note withheld for now', !s.evidence.find((e) => e.id === 'ev-route'));

  // the delayed consequence: one finding later, Tomas hands the note over
  await tp(trader.x + 1.5, trader.z + 1.5);
  ok = await openDialogue(/Talk to the night market trader/);
  if (ok) {
    await choose(0);
    await closeDlg();
  }
  await tp(tpos2.x + 1.5, tpos2.z + 1.5);
  ok = await openDialogue(/Talk to Tomas Venn/);
  if (ok) {
    const d = await dlg();
    check('choice B: route note arrives after the first finding', /route note|wrote it down/i.test(d.body || ''), (d.body || '').slice(0, 50).replace(/\s+/g, ' '));
    await closeDlg();
  }
  s = await story();
  check('choice B: route-note flag finally granted', (s.flags || []).includes('route-note'));

  // and the cage is locked again: no key, no gate
  await tp(secret0.x + 0.1, secret0.z - 0.45);
  const relockedPrompt = await waitPrompt((t) => /records cage/i.test(t), 30000);
  check('cage prompts again after the reset', /records cage/i.test(relockedPrompt), relockedPrompt || '(none)');
  if (/records cage/i.test(relockedPrompt)) await press('KeyE');
  const relockedCard = await until(inspectBody, (b) => b.length > 0, 20000);
  check('cage refuses without Tomas\'s key', /key|answered/i.test(relockedCard), relockedCard.slice(0, 56));
  await press('Escape');

  const passed = results.filter((r) => r.ok).length;
  console.log(`[smoke] story checks: ${passed}/${results.length} passed`);
  if (passed !== results.length) warnings.push(`${results.length - passed} story check(s) failed`);
}

/* ------------------------------------------------------------------ *
 * Phase 6 — UI screens, progression, save/load
 *
 * Runs after the story block on the same session. Nothing here may
 * reset the world except the two *deliberate* rebuilds (Load, New
 * game) — every menu round-trip asserts the generation counter and
 * the player position held still. Mouse input is exercised through
 * real page.click / page.mouse events on the new surfaces.
 * ------------------------------------------------------------------ */
async function runProgressionTests(page, errors, warnings) {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    const line = detail ? `${name} — ${detail}` : name;
    if (ok) console.log(`[smoke]   ok   ${line}`);
    else {
      errors.push(`progression: ${line}`);
      console.log(`[smoke]   FAIL ${line}`);
    }
  };
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
  const press = async (code) => {
    await ev((c) => window.__MT_PRESS__(c), code);
    await sleep(700);
  };
  const tp = async (x, z) => {
    await ev((a, b) => window.__MT_TP__(a, b), x, z);
    await sleep(1400); // let a slow frame settle the teleport
  };
  const gen = () => ev(() => window.__MT_GEN__());
  // Live player position straight from the game hook: the HUD keeps no stat
  // readout, so there is nothing DOM-side to poll and nothing to lag behind.
  const pos = async () => {
    const p = await ev(() => window.__MT_PLAYER__());
    return { x: p?.pos?.[0], z: p?.pos?.[2] };
  };
  const map = (open) => ev((o) => window.__MT_MAP__(o), open);
  const gear = (open) => ev((o) => window.__MT_GEAR__(o), open);
  const pause = (open) => ev((o) => window.__MT_PAUSE__(o), open);
  const storyView = () => ev(() => window.__MT_STORY__());
  const mem = () => ev(() => window.__MT_MEM__());
  const save = (op, text) => ev((o, t) => window.__MT_SAVE__(o, t), op ?? 'status', text ?? null);
  const buyClick = async (id) => {
    await page.click(`.gear-buy[data-buy="${id}"]`);
    await sleep(700);
  };

  /**
   * The settings panel slides in with a CSS transform transition, and CSS
   * transitions only advance on rendered frames. Headless SwiftShader commits
   * a frame every few seconds, so the 280 ms slide takes ~5 s of wall clock
   * here (instant on real hardware). Coordinate clicks must wait until the
   * close button has actually arrived on screen, or Puppeteer refuses with
   * "Node is either not clickable or not an Element" (its centre is still
   * off-viewport mid-slide).
   */
  const waitPanelSettled = () =>
    until(
      () =>
        ev(() => {
          const b = document.getElementById('panel-close');
          if (!b) return false;
          const r = b.getBoundingClientRect();
          return r.x >= 0 && r.y >= 0 && r.x + r.width <= innerWidth && r.y + r.height <= innerHeight;
        }),
      (x) => x === true,
      30000,
    );

  /* ---- 1. mission tracker on the HUD ---------------------------------- */
  let sv = await storyView();
  let tr = await ev(() => window.__MT_TRACKER__());
  check('HUD tracker shows the active case', !!tr && tr.title === sv.missions?.[0]?.title, tr ? `${tr.kicker} · ${tr.title}` : 'missing');
  check('tracker kicker reads CASE', tr?.kicker === 'CASE', tr?.kicker ?? '(none)');
  check('tracker lists at least one objective', (tr?.lines ?? []).length >= 1, JSON.stringify(tr?.lines));
  const liveObjectives = (sv.missions?.[0]?.objectives ?? []).filter((o) => o.visible && !o.done).map((o) => o.text);
  const linesFromView = (tr?.lines ?? []).every((l) => liveObjectives.some((x) => l.includes(x)));
  check('tracker lines come from live objectives', linesFromView, JSON.stringify(tr?.lines));
  const sideStatus = sv.missions?.[1]?.status;
  const sideShown = (tr?.side ?? '') !== '';
  check(
    'side-job line follows its mission status',
    sideStatus === 'locked' ? !sideShown : sideShown,
    `status=${sideStatus} line="${tr?.side ?? ''}"`,
  );

  /* ---- 2. the city map ------------------------------------------------ */
  const genAtStart = await gen();
  const posBeforeMap = await pos();
  await press('KeyM');
  let mp = await until(map, (x) => x.open, 15000);
  check('M opens the city map', mp.open, JSON.stringify(mp.canvas));
  check('map canvas has a usable size', (mp.canvas?.w ?? 0) >= 400 && (mp.canvas?.h ?? 0) >= 300, JSON.stringify(mp.canvas));
  const lmPins = (mp.pins ?? []).filter((x) => x.kind === 'landmark');
  check('map pins every landmark', lmPins.length === 5, `${lmPins.length} pins`);
  check('map pins the readings you hold', (mp.pins ?? []).filter((x) => x.kind === 'source').length >= 3,
    `${(mp.pins ?? []).filter((x) => x.kind === 'source').length} readings`);
  const withinBounds =
    mp.player &&
    mp.player.x > 0 && mp.player.y > 0 &&
    mp.player.x < (mp.canvas?.w ?? 0) && mp.player.y < (mp.canvas?.h ?? 0);
  // Validate the map's plot against the *live* player position (the map
  // plots player.position live). The player is frozen under the map, so
  // __MT_PLAYER__ read here is the same position the map just rendered with.
  const live = await ev(() => window.__MT_PLAYER__());
  const lx = live?.pos?.[0];
  const lz = live?.pos?.[2];
  const posMatch =
    mp.player && typeof lx === 'number' && typeof lz === 'number' &&
    Math.abs(mp.player.world[0] - lx) <= 2 && Math.abs(mp.player.world[1] - lz) <= 2;
  check('map plots the player at the right spot', withinBounds && posMatch,
    mp.player ? `${JSON.stringify(mp.player.world)} vs live ${lx},${lz}` : 'no player pin');
  check('map counts read-out names districts and landmarks',
    /DISTRICTS/.test(mp.counts ?? '') && /LANDMARKS/.test(mp.counts ?? ''), mp.counts ?? '');
  const promptHidden = await ev(() => document.getElementById('prompt')?.classList.contains('hidden'));
  check('interaction prompt hides under the map', promptHidden === true);

  // hover + click a pin with the real mouse
  const box = await ev(() => {
    const r = document.getElementById('map-canvas').getBoundingClientRect();
    return { x: r.x, y: r.y };
  });
  const pin = lmPins[0];
  await page.mouse.move(box.x + pin.x, box.y + pin.y);
  await sleep(500);
  mp = await map();
  check('hovering a pin highlights it', mp.hover === pin.id, `${mp.hover ?? '(none)'} vs ${pin.id}`);
  await page.mouse.click(box.x + pin.x, box.y + pin.y);
  await sleep(500);
  mp = await map();
  check('clicking a pin opens its read-out', !!mp.detailTitle, mp.detailTitle ?? '(none)');

  // discovery: walk up to an uncharted landmark (or verify the full set)
  let chartedTp = false;
  const parseCounts = (text) => {
    const m = /(\d+)\/5 DISTRICTS · (\d+)\/5 LANDMARKS/.exec(text ?? '');
    return m ? { d: Number(m[1]), l: Number(m[2]) } : { d: -1, l: -1 };
  };
  let cnt = parseCounts(mp.counts);
  if (cnt.l >= 0 && cnt.l < 5) {
    const unknownType = lmPins.find((p) => !p.known)?.id.split(':')[1];
    const lay = await ev(() => window.__MT_LAYOUT__());
    const target = (lay?.landmarks ?? []).find((x) => x.type === unknownType);
    if (target) {
      chartedTp = true;
      await tp(target.x, target.z);
      mp = await until(map, (x) => parseCounts(x.counts).l !== cnt.l, 30000);
      check('walking up to a landmark charts it', parseCounts(mp.counts).l === cnt.l + 1, mp.counts);
    } else check('walking up to a landmark charts it', false, `unknown type ${unknownType}`);
  } else {
    check('all landmarks already charted', cnt.l === 5, mp.counts);
  }
  cnt = parseCounts(mp.counts);
  if (cnt.d >= 0 && cnt.d < 5) {
    const lay = await ev(() => window.__MT_LAYOUT__());
    let increased = false;
    for (const key of Object.keys(lay?.districts ?? {})) {
      const c = lay.districts[key].cells?.[0];
      if (!c) continue;
      chartedTp = true;
      await tp(c.cx, c.cz);
      const nowC = parseCounts((await map()).counts);
      if (nowC.d !== cnt.d) {
        cnt = nowC;
        increased = true;
        break;
      }
    }
    check('stepping into a district charts it', increased, `${cnt.d}/5`);
  } else {
    check('all districts already charted', cnt.d === 5, mp.counts);
  }

  const genWhileMap = await gen();
  await press('KeyM');
  mp = await until(map, (x) => !x.open, 10000);
  check('M closes the map', !mp.open);
  const posAfterMap = await pos();
  const posStable = !chartedTp || (Math.abs(posAfterMap.x - posBeforeMap.x) <= 2 && Math.abs(posAfterMap.z - posBeforeMap.z) <= 2);
  check('map round-trip leaves the player and world untouched',
    (await gen()) === genAtStart && posStable, `gen ${genAtStart}→${await gen()}, chartedTp=${chartedTp}`);

  /* ---- 2b. the corner mini-map ---------------------------------------- */
  let mm = await until(() => ev(() => window.__MT_MINIMAP__()), (x) => x.visible === true, 20000);
  check('mini-map is on screen in play mode', mm.visible === true, JSON.stringify(mm));
  check('mini-map canvas is a usable size', (mm.size ?? 0) >= 120, String(mm.size));
  check('mini-map was drawn recently', !!mm.drawnAt, JSON.stringify(mm.drawnAt));
  const mmLive = await ev(() => window.__MT_PLAYER__());
  const mmMatch =
    !!mm.player && typeof mmLive?.pos?.[0] === 'number' &&
    Math.abs(mm.player.x - mmLive.pos[0]) <= 2 && Math.abs(mm.player.z - mmLive.pos[2]) <= 2;
  check('mini-map reads the live player position', mmMatch,
    `${JSON.stringify(mm.player)} vs ${JSON.stringify(mmLive?.pos?.slice(0, 3))}`);
  check('mini-map names the district you stand in', (mm.label ?? '').length > 0, mm.label);
  check('mini-map knows every landmark of the city', (mm.pins?.landmarks ?? 0) === 5, JSON.stringify(mm.pins));

  // Tab hides it and brings it back — and a hidden radar stays hidden
  await press('Tab');
  mm = await until(() => ev(() => window.__MT_MINIMAP__()), (x) => x.visible === false, 20000);
  check('Tab hides the mini-map', mm.visible === false, String(mm.visible));
  await sleep(2500); // several slow SwiftShader frames pass
  const hiddenStill = await ev(() => window.__MT_MINIMAP__());
  check('a hidden mini-map stays hidden across frames', hiddenStill.visible === false, String(hiddenStill.visible));
  await press('Tab');
  mm = await until(() => ev(() => window.__MT_MINIMAP__()), (x) => x.visible === true, 20000);
  check('Tab brings the mini-map back', mm.visible === true, String(mm.visible));

  // it steps aside for the full map, then comes back on its own
  await press('KeyM');
  await until(map, (x) => x.open, 15000);
  mm = await until(() => ev(() => window.__MT_MINIMAP__()), (x) => x.visible === false, 20000);
  check('mini-map steps aside for the full map', mm.visible === false, String(mm.visible));
  await press('KeyM');
  await until(map, (x) => !x.open, 10000);
  mm = await until(() => ev(() => window.__MT_MINIMAP__()), (x) => x.visible === true, 20000);
  check('mini-map returns when the map closes', mm.visible === true, String(mm.visible));

  /* ---- 3. extraction noise recipe (before the upgrade) ---------------- */
  const hide = (await ev(() => window.__MT_HIDE__()))[0];
  const spot = { x: hide.x - 4.7, z: hide.z }; // same open-road spot Phase 4 proved
  await tp(spot.x, spot.z);
  const st = await until(() => ev(() => window.__MT_STEALTH__()), (s) => s.cover === false, 15000);
  check('noise test spot stands in the open', st.cover === false, `cover=${st.cover}`);
  check('noise test spot is outside restricted zones', st.zone === null, String(st.zone));
  const agents = await ev(() => window.__MT_AGENTS__());
  const guard = agents.find((a) => a.type === 'guard');
  for (const a of agents.filter((x) => x.id !== guard?.id)) {
    await ev((id, x, z) => window.__MT_AGENT_POS__(id, x, z), a.id, spot.x + 250, spot.z + 250);
  }
  await ev((id, x, z, fx, fz) => window.__MT_AGENT_POS__(id, x, z, fx, fz), guard.id, spot.x - 8, spot.z, spot.x, spot.z);
  const parked = await ev(() => window.__MT_AGENTS__());
  const gd = parked.find((a) => a.id === guard.id);
  check('guard stands 8 m off the reading', Math.abs(Math.hypot(gd.x - spot.x, gd.z - spot.z) - 8) < 0.5,
    Math.hypot(gd.x - spot.x, gd.z - spot.z).toFixed(1));
  check('no bystander wanders into the radius',
    parked.filter((a) => a.id !== guard.id).every((a) => Math.hypot(a.x - spot.x, a.z - spot.z) > 200));
  const noiseBefore = await ev(() => window.__MT_EMIT__('extraction'));
  check('base extraction noise reaches 8 m', noiseBefore >= 1, `${noiseBefore} notified`);

  /* ---- 4. equipment screen: motes, purchases, effects ----------------- */
  await press('KeyI');
  let gr = await until(gear, (x) => x.open, 12000);
  check('I opens the equipment screen', gr.open);
  const m0 = await mem();
  const s0 = await storyView();
  const reconstructed = m0.collected.filter((c) => c.reconstructed).length;
  const expectedMotes = reconstructed * 3 + (s0.evidence ?? []).length;
  check('motes income matches the work done', gr.motes?.earned === expectedMotes,
    `${gr.motes?.earned} vs ${reconstructed}×3 + ${s0.evidence?.length} evidence = ${expectedMotes}`);
  check('four upgrade cards with buy buttons', (gr.buyDisabled ?? []).length === 4, `${gr.buyDisabled?.length}`);

  await buyClick('muffled-channel');
  gr = await gear();
  check('MUFFLED CHANNEL installs', gr.owned.includes('muffled-channel') && gr.effects.noiseScale === 0.5,
    `owned=${gr.owned.join(',')} noiseScale=${gr.effects.noiseScale}`);
  await ev((id, x, z, fx, fz) => window.__MT_AGENT_POS__(id, x, z, fx, fz), guard.id, spot.x - 8, spot.z, spot.x, spot.z);
  const noiseAfter = await ev(() => window.__MT_EMIT__('extraction'));
  check('muffled channel damps the noise — 8 m bystander hears nothing', noiseAfter === 0, `${noiseAfter} notified`);

  await buyClick('swift-channel');
  gr = await gear();
  check('SWIFT CHANNEL installs', gr.owned.includes('swift-channel') && gr.effects.channelScale === 0.7,
    `channelScale=${gr.effects.channelScale}`);
  const exState = await ev(() => window.__MT_EXTRACT__());
  check('shorter channel flows into the extraction loop',
    Math.abs((exState.duration ?? 1.3) - 0.91) < 0.02, String(exState.duration));
  check('equipment shows the upgraded stat row', (gr.statUpgraded ?? []).includes('0.91 s'),
    JSON.stringify(gr.statUpgraded));

  /* ---- 5. KEEN LENS: replay range before and after -------------------- */
  const srcs = await ev(() => window.__MT_SOURCES__());
  const fragId = m0.collected.find((c) => c.reconstructed)?.id ?? m0.collected[0]?.id;
  const site = srcs.find((s) => s.fragmentId === fragId);
  await press('KeyI'); // close the gear for the range probe
  await until(gear, (x) => !x.open, 10000);
  await tp(site.x + 17.5, site.z);
  const rangeBefore = await ev((id) => window.__MT_RECON_START__(id), fragId);
  check('replay range: 17.5 m is out of reach unupgraded', rangeBefore === false, String(rangeBefore));

  await press('KeyI');
  gr = await until(gear, (x) => x.open, 12000);
  await buyClick('keen-lens');
  gr = await gear();
  check('KEEN LENS installs', gr.owned.includes('keen-lens') && gr.effects.reconRange === 21,
    `reconRange=${gr.effects.reconRange}`);
  await press('KeyI');
  await until(gear, (x) => !x.open, 10000);
  await tp(site.x + 17.5, site.z);
  const rangeAfter = await ev((id) => window.__MT_RECON_START__(id), fragId);
  check('replay range: 21 m reach after KEEN LENS', rangeAfter === true, String(rangeAfter));
  if (rangeAfter) {
    await press('Escape');
    const off = await until(() => ev(() => window.__MT_RECON__()), (r) => r.active === false, 15000);
    check('range probe replay cancelled cleanly', off.active === false);
  } else check('range probe replay cancelled cleanly', false, 'replay never started');

  /* ---- 6. the fourth upgrade obeys the mote economy ------------------- */
  await press('KeyI');
  gr = await until(gear, (x) => x.open, 12000);
  const canFourth = gr.motes.available >= 5;
  const fourthBtn = (gr.buyDisabled ?? []).find((b) => b.id === 'echo-cell');
  check('fourth upgrade shows the honest cost gate', fourthBtn?.disabled === !canFourth,
    `available=${gr.motes.available} disabled=${fourthBtn?.disabled}`);
  if (canFourth) {
    await buyClick('echo-cell');
    gr = await gear();
    const ab = await ev(() => window.__MT_ABILITY__());
    check('ECHO CELL installs when you can afford it', gr.owned.includes('echo-cell') && Math.round(ab.duration) === 20,
      `duration=${ab.duration}`);
  } else {
    check('ECHO CELL stays locked until more work is filed', !gr.owned.includes('echo-cell'),
      `available=${gr.motes.available}`);
  }
  const posBeforeGearClose = await pos();
  await press('KeyI');
  await until(gear, (x) => !x.open, 10000);
  const posAfterGearClose = await pos();
  check('equipment round-trip keeps the player and world still',
    (await gen()) === genAtStart && Math.abs(posAfterGearClose.x - posBeforeGearClose.x) <= 2,
    `gen ${genAtStart}→${await gen()}`);

  /* ---- 7. pause menu: actions, settings, resume ----------------------- */
  await press('Escape');
  let ps = await until(pause, (x) => x.open, 12000);
  check('Esc opens the pause menu', ps.open);
  check('pause offers the full action set',
    ['pause-resume', 'pause-save', 'pause-load', 'pause-settings', 'pause-new'].every((id) => (ps.buttons ?? []).some((b) => b.id === id)),
    JSON.stringify((ps.buttons ?? []).map((b) => b.id)));
  check('no checkpoint yet: Load is disabled and the status says so',
    ps.loadDisabled === true && /No checkpoint/i.test(ps.status ?? ''), ps.status ?? '');
  await page.click('#pause-settings');
  await sleep(600);
  const panelState = await ev(() => ({
    open: !document.getElementById('panel')?.classList.contains('hidden'),
    paused: window.__MT_PAUSE__().open,
  }));
  check('Settings opens the graphics panel', panelState.open && !panelState.paused, JSON.stringify(panelState));
  await waitPanelSettled();
  await page.click('#panel-close');
  await sleep(500);
  check('settings panel closes back to play',
    (await ev(() => document.getElementById('panel')?.classList.contains('hidden'))) === true);
  const genAfterPanel = await gen();
  await press('Escape');
  ps = await until(pause, (x) => x.open, 12000);
  const posBeforeResume = await pos();
  await page.click('#pause-resume');
  await sleep(600);
  const posAfterResume = await pos();
  check('Resume returns to gameplay', (await ev(() => window.__MT_PAUSE__().open)) === false);
  check('pause round-trip never resets the world',
    (await gen()) === genAfterPanel && Math.abs(posAfterResume.x - posBeforeResume.x) <= 2,
    `gen ${genAfterPanel}→${await gen()}`);
  await press('KeyP');
  ps = await until(pause, (x) => x.open, 12000);
  check('P also opens the pause menu', ps.open);
  await press('KeyP');
  ps = await until(pause, (x) => !x.open, 12000);
  check('P closes the pause menu', !ps.open);

  /* ---- 8. save / load / refuse corrupted checkpoints ------------------ */
  await tp(spot.x, spot.z); // back to the open-road position A
  // the player hook only advances on a rendered frame — under SwiftShader that
  // can take seconds, so wait until the teleport has actually landed before
  // trusting it as "position A".
  const posA = await until(pos, (p) => Math.abs(p.x - spot.x) <= 2 && Math.abs(p.z - spot.z) <= 2, 30000);
  const evidenceAtSave = ((await storyView()).evidence ?? []).length;
  const memCountAtSave = (await mem()).count;
  await press('Escape');
  ps = await until(pause, (x) => x.open, 12000);
  await page.click('#pause-save'); // the real menu button (mouse input)
  await sleep(700);
  const savedStatus = await save('status');
  check('Save Game writes the checkpoint from the menu', savedStatus.exists === true, savedStatus.status);
  ps = await ev(() => window.__MT_PAUSE__());
  check('pause status confirms the save', /Checkpoint saved/i.test(ps.status ?? ''), ps.status ?? '');
  const raw = await save('raw');
  let doc = null;
  try { doc = JSON.parse(raw); } catch { doc = null; }
  check('checkpoint carries every progress system',
    !!doc && doc.v === 1 && !!doc.player && !!doc.memories && !!doc.story && !!doc.discovery && !!doc.progression && typeof doc.seed === 'string',
    raw ? `${raw.length} bytes` : 'missing');
  check('checkpoint records the player position',
    !!doc && Math.abs(doc.player.x - posA.x) <= 2 && Math.abs(doc.player.z - posA.z) <= 2,
    doc ? `${doc.player.x.toFixed(1)},${doc.player.z.toFixed(1)} vs ${posA.x},${posA.z}` : 'no doc');
  await press('Escape'); // close the menu
  await until(pause, (x) => !x.open, 10000);

  await save('write', 'not json {{{');
  const bad1 = await save('load');
  const untouched1 = await storyView();
  check('corrupt checkpoint is refused safely', bad1.status === 'corrupt', String(bad1.status));
  check('refused load leaves the case untouched',
    (untouched1.evidence ?? []).length === evidenceAtSave && (await mem()).count === memCountAtSave,
    `${untouched1.evidence?.length} evidence / ${(await mem()).count} memories`);
  await save('write', '{"v":0}');
  const bad2 = await save('load');
  check('outdated checkpoint version is refused', bad2.status === 'outdated', String(bad2.status));
  await save('write', '{"v":99,"from":"a-later-build"}');
  const bad3 = await save('load');
  check('newer checkpoint version is refused', bad3.status === 'future', String(bad3.status));
  const resave = await save('save');
  check('a good checkpoint can be written again', resave.ok === true && (await save('status')).exists === true,
    JSON.stringify(resave));

  const genBeforeLoad = await gen();
  await tp(spot.x + 60, spot.z - 30); // position B — far from A
  await press('Escape');
  await until(pause, (x) => x.open, 12000);
  await page.click('#pause-load'); // the real menu button (mouse input)
  const backAtA = await until(pos, (p) => Math.abs(p.x - posA.x) <= 2 && Math.abs(p.z - posA.z) <= 2, 150000);
  check('Load restores the saved position',
    Math.abs(backAtA.x - posA.x) <= 2 && Math.abs(backAtA.z - posA.z) <= 2,
    `${backAtA.x},${backAtA.z} vs ${posA.x},${posA.z}`);
  const svAfter = await until(storyView, (s) => (s.evidence ?? []).length === evidenceAtSave, 60000);
  check('Load restores the case evidence', svAfter.evidence?.length === evidenceAtSave,
    `${svAfter.evidence?.length} of ${evidenceAtSave}`);
  check('Load keeps the memories you hold', (await mem()).count === memCountAtSave, String(memCountAtSave));
  const genAfterLoad = await until(gen, (g) => g === genBeforeLoad + 1, 150000);
  check('Load rebuilds the world deliberately, exactly once',
    genAfterLoad === genBeforeLoad + 1, `${genBeforeLoad}→${genAfterLoad}`);
  const statsAfter = await ev(() => window.__MT_STATS__());
  const seedNow = await ev(() => window.__MT_SETTINGS__?.seed ?? '');
  check('same seed and city after the load',
    (statsAfter?.world?.cells ?? 0) > 0 && doc?.seed === seedNow,
    `${statsAfter?.world?.cells} cells · seed ${seedNow}`);
  const trackerAfterLoad = await ev(() => window.__MT_TRACKER__());
  const svLoad = await storyView();
  check('tracker follows the loaded state',
    !!trackerAfterLoad && trackerAfterLoad.title === svLoad.missions?.[0]?.title,
    trackerAfterLoad?.title ?? '(none)');

  /* ---- 9. accessibility options --------------------------------------- */
  await press('Escape');
  await until(pause, (x) => x.open, 12000);
  await page.click('#pause-settings');
  await sleep(600);
  await waitPanelSettled(); // the a11y clicks below are coordinate clicks too
  const a11yEls = await ev(() => ['set-uiscale', 'set-flicker', 'set-contrast'].every((id) => !!document.getElementById(id)));
  check('settings panel carries accessibility options', a11yEls);
  await page.select('#set-uiscale', '1.3');
  await sleep(400);
  const sc = await ev(() => ({
    p: window.__MT_A11Y__().scale,
    v: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
  }));
  check('interface scale applies to the document', sc.p === 1.3 && sc.v === '1.3', JSON.stringify(sc));
  await page.click('#set-flicker');
  await sleep(350);
  const fl = await ev(() => ({
    p: window.__MT_A11Y__().reduceFlicker,
    c: document.body.classList.contains('reduce-flicker'),
  }));
  check('reduce flicker toggles the flash-free mode', fl.p === true && fl.c === true, JSON.stringify(fl));
  await page.click('#set-contrast');
  await sleep(350);
  const hc = await ev(() => ({
    p: window.__MT_A11Y__().highContrast,
    c: document.body.classList.contains('high-contrast'),
  }));
  check('high contrast toggles the card outlines', hc.p === true && hc.c === true, JSON.stringify(hc));
  const a11yRaw = await ev(() => window.localStorage.getItem('mt.a11y.v1'));
  let a11yDoc = null;
  try { a11yDoc = JSON.parse(a11yRaw); } catch { a11yDoc = null; }
  check('accessibility preferences persist under their own key',
    !!a11yDoc && a11yDoc.v === 1 && a11yDoc.scale === 1.3, a11yRaw ?? 'missing');
  await ev(() => window.__MT_A11Y__({ scale: 1, reduceFlicker: false, highContrast: false }));
  const restored = await ev(() => ({
    v: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
    c: document.body.className,
  }));
  check('accessibility defaults restore cleanly',
    restored.v === '1' && !/reduce-flicker|high-contrast/.test(restored.c), JSON.stringify(restored));
  await page.click('#panel-close');
  await sleep(500);

  /* ---- 10. new game: confirm, cancel, erase --------------------------- */
  await press('Escape');
  ps = await until(pause, (x) => x.open, 12000);
  const genBeforeNew = await gen();
  const evidenceBeforeNew = ((await storyView()).evidence ?? []).length;
  await page.click('#pause-new');
  await sleep(500);
  ps = await ev(() => window.__MT_PAUSE__());
  check('new game asks for deliberate confirmation', ps.confirmVisible === true && ps.confirmKind === 'new',
    JSON.stringify({ v: ps.confirmVisible, k: ps.confirmKind }));
  await page.click('#pause-confirm-cancel');
  await sleep(450);
  ps = await ev(() => window.__MT_PAUSE__());
  const svAfterCancel = await storyView();
  check('cancelling keeps the save, case and world',
    ps.confirmVisible === false &&
      (svAfterCancel.evidence ?? []).length === evidenceBeforeNew &&
      (await gen()) === genBeforeNew,
    `${svAfterCancel.evidence?.length} evidence · gen ${genBeforeNew}`);
  await page.click('#pause-new');
  await sleep(450);
  await page.click('#pause-confirm-accept');
  const fresh = await until(
    () => Promise.all([mem(), storyView(), gen(), save('status')]),
    ([m, s, g, st]) => m.count === 0 && (s.flags ?? []).length === 0 && g === genBeforeNew + 1 && st.status === 'missing',
    150000,
  );
  check('new game clears memories and the case', fresh[0].count === 0 && fresh[1].flags.length === 0,
    `${fresh[0].count} memories / ${fresh[1].flags.length} flags`);
  check('new game erases the saved checkpoint', fresh[3].status === 'missing', String(fresh[3].status));
  check('new game rebuilds a fresh world once', fresh[2] === genBeforeNew + 1, `${genBeforeNew}→${fresh[2]}`);
  const trackerFresh = await ev(() => window.__MT_TRACKER__());
  const svFresh = await storyView();
  check('fresh tracker points at the opening objective',
    !!trackerFresh && trackerFresh.title === svFresh.missions?.[0]?.title && trackerFresh.lines.length >= 1,
    JSON.stringify(trackerFresh?.lines ?? null));
  await press('KeyI');
  gr = await until(gear, (x) => x.open, 12000);
  check('no motes, no upgrades: every install is disabled and stats are stock',
    gr.motes.available === 0 && gr.owned.length === 0 &&
      (gr.buyDisabled ?? []).every((b) => b.disabled) && (gr.statUpgraded ?? []).length === 0,
    JSON.stringify({ motes: gr.motes, owned: gr.owned }));
  await press('KeyI');
  await until(gear, (x) => !x.open, 10000);
  const alive = await ev(() => window.__MT_STATS__());
  check('fresh world renders normally', (alive.world?.cells ?? 0) > 0 && alive.calls > 0,
    `${alive.world?.cells} cells / ${alive.calls} calls`);
  const genEnd = await gen();
  await press('KeyM');
  await until(map, (x) => x.open, 12000);
  await press('KeyM');
  await until(map, (x) => !x.open, 10000);
  check('menus still round-trip on a fresh game without resets', (await gen()) === genEnd,
    `gen ${genEnd}→${await gen()}`);

  const passed = results.filter((r) => r.ok).length;
  console.log(`[smoke] progression checks: ${passed}/${results.length} passed`);
  if (passed !== results.length) warnings.push(`${results.length - passed} progression check(s) failed`);
}

/* --------------------------------------------------------------------- *
 * Phase 7 — visual quality, audio, performance
 *
 * These checks prove the Phase 7 systems exist and, crucially, that the
 * graphics presets *actually change rendering cost* (shadow pass on/off,
 * visible point-light budget, pixel ratio) rather than being cosmetic
 * labels. Everything polls — headless SwiftShader is far too slow to
 * hard-code frame timings.
 * --------------------------------------------------------------------- */

async function runPhase7Tests(page, errors, warnings) {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    const line = detail ? `${name} — ${detail}` : name;
    if (ok) console.log(`[smoke]   ok   ${line}`);
    else {
      errors.push(`quality: ${line}`);
      console.log(`[smoke]   FAIL ${line}`);
    }
  };
  const ev = (fn, ...args) => page.evaluate(fn, ...args);
  const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---- 1. performance stats are exposed ------------------------------- */
  let st = await ev(() => window.__MT_STATS__());
  check('stats carry the quality fields (quality/pixelRatio/shadow/lights/memory)',
    typeof st.quality === 'string' && typeof st.pixelRatio === 'number' &&
      !!st.shadow && typeof st.shadow.enabled === 'boolean' && st.shadow.autoUpdate === false &&
      !!st.lights && !!st.memory && typeof st.memory.geometries === 'number',
    JSON.stringify({ quality: st.quality, pr: st.pixelRatio, shadow: st.shadow, lights: st.lights, mem: st.memory }));

  const mediumLights = st.lights?.pointVisible ?? -1;

  /* ---- 2. presets actually change rendering cost ----------------------- */
  const qLow = await ev(() => window.__MT_QUALITY__('low'));
  check('quality low applies', qLow.ok === true, JSON.stringify(qLow.after ?? qLow));
  st = await ev(() => window.__MT_STATS__());
  check('LOW: shadow pass disabled', st.shadow.enabled === false, `enabled=${st.shadow.enabled}`);
  check('LOW: shadow cadence is zero (no per-frame depth pass)', st.shadow.hz === 0, `hz=${st.shadow.hz}`);
  check('LOW: pixel ratio capped at 1', st.pixelRatio <= 1, `pr=${st.pixelRatio}`);
  check('LOW: point-light budget is empty (fewer lit fragments)', st.lights.pointVisible === 0, `visible=${st.lights.pointVisible}`);
  check('LOW: rain particles hidden', st.rain.enabled === false, `rain=${st.rain.enabled}`);
  let fx = await ev(() => window.__MT_FX__());
  check('LOW: ambient motes disabled', fx.motes.count === 0, `count=${fx.motes.count}`);

  const qHigh = await ev(() => window.__MT_QUALITY__('high'));
  check('quality high applies', qHigh.ok === true, JSON.stringify(qHigh.after ?? qHigh));
  st = await ev(() => window.__MT_STATS__());
  check('HIGH: shadow pass enabled', st.shadow.enabled === true, `enabled=${st.shadow.enabled}`);
  check('HIGH: shadow cadence is 6 Hz', st.shadow.hz === 6, `hz=${st.shadow.hz}`);
  check('HIGH: pixel ratio may exceed 1', st.pixelRatio >= 1, `pr=${st.pixelRatio}`);
  check('HIGH: point-light budget is fuller than LOW',
    st.lights.pointVisible > 0, `visible=${st.lights.pointVisible}`);
  check('HIGH: rain particles on', st.rain.enabled === true, `rain=${st.rain.enabled}`);
  fx = await ev(() => window.__MT_FX__());
  check('HIGH: ambient motes enabled', fx.motes.count > 0, `count=${fx.motes.count}`);
  check('HIGH reduced draw cost is a real delta vs LOW',
    (qLow.after?.lightsVisible ?? 0) < (qHigh.after?.lightsVisible ?? 0) &&
      (qLow.after?.moteCount ?? 0) < (qHigh.after?.moteCount ?? 0),
    `low lights=${qLow.after?.lightsVisible} motes=${qLow.after?.moteCount} · high lights=${qHigh.after?.lightsVisible} motes=${qHigh.after?.moteCount}`);

  // restore medium and confirm the budget returns toward the baseline
  const qMed = await ev(() => window.__MT_QUALITY__('medium'));
  check('quality restored to medium', qMed.ok === true && (qMed.after?.quality) === 'medium', qMed.after?.quality);
  st = await ev(() => window.__MT_STATS__());
  check('MEDIUM: shadow pass back on', st.shadow.enabled === true && st.shadow.hz === 4,
    `enabled=${st.shadow.enabled} hz=${st.shadow.hz}`);
  check('MEDIUM: point-light budget between LOW and HIGH',
    st.lights.pointVisible > 0 && st.lights.pointVisible <= (mediumLights < 0 ? 8 : mediumLights),
    `visible=${st.lights.pointVisible} (was ${mediumLights})`);

  /* ---- 3. audio: volume buses, cues, persistence ---------------------- */
  let au = await ev(() => window.__MT_AUDIO_STATE__());
  check('audio state exposed with volume buses',
    !!au && typeof au.enabled === 'boolean' && !!au.volumes &&
      typeof au.volumes.master === 'number' && typeof au.volumes.ambience === 'number' &&
      typeof au.volumes.effects === 'number',
    JSON.stringify(au));
  const stepsBefore = au.steps ?? 0;

  const setVol = await ev(() => window.__MT_AUDIO_VOLUMES__({ master: 0.42 }));
  check('master volume set to 0.42', setVol?.master === 0.42, `master=${setVol?.master}`);
  const persisted = await ev(() => {
    try { return JSON.parse(localStorage.getItem('mt.audio.v1')); } catch { return null; }
  });
  check('volume persisted to mt.audio.v1', persisted?.master === 0.42, JSON.stringify(persisted));

  check('footstep cue plays', await ev(() => window.__MT_AUDIO_STEP__(false)) === true);
  check('run footstep cue plays', await ev(() => window.__MT_AUDIO_STEP__(true)) === true);
  check('named interaction cue plays', await ev(() => window.__MT_AUDIO_CUE__('interact')) === true);
  check('extraction cue is distinct and plays', await ev(() => window.__MT_AUDIO_CUE__('extract-done')) === true);
  check('reconstruction cue is distinct and plays', await ev(() => window.__MT_AUDIO_CUE__('recon-start')) === true);
  au = await ev(() => window.__MT_AUDIO_STATE__());
  check('footstep counter advanced', (au.steps ?? 0) >= stepsBefore + 2, `${stepsBefore} → ${au.steps}`);

  const ambOn = await ev(() => window.__MT_AUDIO_AMBIENCE__(true));
  check('ambient city bed starts', ambOn === true || (await ev(() => window.__MT_AUDIO_STATE__().ambience)) === true,
    `start=${ambOn}`);
  const ambStop = await ev(() => window.__MT_AUDIO_AMBIENCE__(false));
  check('ambient bed stops cleanly', ambStop === true, `stop=${ambStop}`);

  // restore default volumes
  await ev(() => window.__MT_AUDIO_RESET_VOLUMES__());
  const volReset = await ev(() => window.__MT_AUDIO_VOLUMES__());
  check('volumes restore to defaults', volReset?.master === 0.8 && volReset?.ambience === 0.6 && volReset?.effects === 0.8,
    JSON.stringify(volReset));

  /* ---- 4. accessibility reduce-FX gates the particles ------------------ */
  await ev(() => window.__MT_A11Y__({ reduceFx: true }));
  fx = await ev(() => window.__MT_FX__());
  check('reduce-FX hides ambient motes', fx.reduceFx === true && fx.motes.reduced === true && fx.motes.count === 0,
    JSON.stringify(fx.motes));
  const a11yPersist = await ev(() => {
    try { return JSON.parse(localStorage.getItem('mt.a11y.v1')); } catch { return null; }
  });
  check('reduce-FX persisted to mt.a11y.v1', a11yPersist?.reduceFx === true, JSON.stringify(a11yPersist));
  await ev(() => window.__MT_A11Y__({ reduceFx: false }));
  fx = await ev(() => window.__MT_FX__());
  check('reduce-FX off restores motes', fx.reduceFx === false && fx.motes.reduced === false,
    JSON.stringify(fx.motes));

  /* ---- 5. touch layer is absent on desktop/headless -------------------- */
  const touch = await ev(() => window.__MT_TOUCH__());
  const touchDom = await ev(() => !!document.getElementById('touch'));
  check('touch controls report unsupported on headless desktop', touch?.supported === false, JSON.stringify(touch));
  check('no touch DOM is injected on desktop', touchDom === false, `#touch present=${touchDom}`);

  /* ---- 6. camera: fixed lens, never under the street --------------------- */
  // Guarantee a clean play state: overlays freeze the controller, and the
  // movement + rebuild checks below both need handlePressed to run.
  await ev(() => { window.__MT_JOURNAL__(false); window.__MT_MAP__(false); window.__MT_GEAR__(false); window.__MT_PAUSE__(false); });
  await ev(() => window.__MT_SET_MODE__('play'));
  await sleepMs(500);
  const camIdle = await ev(() => window.__MT_CAM__());
  check('camera reports its field of view', typeof camIdle?.fov === 'number', `fov=${camIdle?.fov?.toFixed?.(1)}`);
  // sprint across an open street and confirm the lens did NOT breathe with
  // speed — Phase 9 made the follow camera steady (58°, always)
  const spawn = await ev(() => window.__MT_SPAWN__('oldquarter'));
  await sleepMs(900);
  await ev(() => { window.__MT_KEY__('KeyW', true); window.__MT_KEY__('ShiftLeft', true); });
  let fovRunning = camIdle.fov;
  let sprintSpeed = 0;
  for (let i = 0; i < 14; i++) {
    await sleepMs(400);
    const c = await ev(() => window.__MT_CAM__());
    fovRunning = c.fov;
    const p = await ev(() => window.__MT_PLAYER__());
    sprintSpeed = Math.max(sprintSpeed, p?.speed ?? 0);
    if ((p?.speed ?? 0) > 4) break;
  }
  await ev(() => { window.__MT_KEY__('KeyW', false); window.__MT_KEY__('ShiftLeft', false); });
  check('the lens never breathes with speed (fixed 58° at a full sprint)',
    typeof fovRunning === 'number' && Math.abs(fovRunning - camIdle.fov) < 0.01 && sprintSpeed > 4,
    `idle ${camIdle.fov?.toFixed?.(1)} → sprint ${fovRunning?.toFixed?.(1)} (top speed ${sprintSpeed.toFixed(1)} m/s)`);
  // looking straight down from a full boom used to sink the lens BELOW the
  // street, which is where the see-through roads were seen from
  await ev(() => window.__MT_LOOK__(0, -900));
  let camLow = camIdle;
  for (let i = 0; i < 14; i++) {
    await sleepMs(400);
    camLow = await ev(() => window.__MT_CAM__());
    if (camLow.pitch <= -0.34) break;
  }
  const groundUnderCam = await ev((c) => window.__MT_GROUND__(c[0], c[2]), camLow.pos);
  check('camera looks down without ever sinking under the street',
    camLow.pitch <= -0.34 && camLow.pos[1] >= groundUnderCam + 0.1,
    `cam y ${camLow.pos[1].toFixed(2)} over ground ${groundUnderCam.toFixed(2)} at pitch ${camLow.pitch.toFixed(2)}`);
  await ev(() => window.__MT_LOOK__(0, 900)); // level the lens again

  /* ---- 7. rebuild does not leak geometries/textures -------------------- */
  // renderer.info.memory.geometries only counts geometries that have been
  // *rendered* at least once (it reads ~7 with all 410 meshes already built,
  // then climbs as the camera sees more of the city), so a snapshot taken a
  // moment after a rebuild measures how many frames ran — not how big the
  // world is. Drive the canned viewpoints on BOTH sides so the whole city has
  // rendered, wait for the count to settle, then compare in the only
  // direction a leak can go: up. The city is rebuilt from the same seed, so
  // the JS-side mesh/triangle counts must match exactly — that is the
  // completeness guard the GPU-side count cannot be.
  const tourCity = async () => {
    for (const v of ['overview', 'tower', 'market', 'station', 'garden', 'archive', 'street']) {
      await ev((n) => window.__MT_VIEW__(n), v);
      await sleepMs(1400); // camera tween / culling settle
    }
    // uploads arrive one frame at a time — stop once two samples agree
    let cur = -1;
    for (let i = 0; i < 20; i++) {
      const prev = cur;
      cur = (await ev(() => window.__MT_STATS__())).memory.geometries;
      if (cur === prev && cur > 0) break;
      await sleepMs(700);
    }
    const s = await ev(() => window.__MT_STATS__());
    return { ...s.memory, meshes: s.world?.meshes, tris: s.world?.triangles };
  };

  const geoA = await tourCity();
  await ev(() => window.__MT_SET_MODE__('play')); // generate() runs from play mode
  await sleepMs(600);
  // snapshot BEFORE the call: __MT_GENERATE__ awaits the whole rebuild, so the
  // counter has already advanced by the time it resolves (unlike the N key,
  // which fires generate() and returns immediately)
  const genBefore = await ev(() => window.__MT_GEN__());
  await ev((seed) => window.__MT_GENERATE__(seed), SEED); // same seed ⇒ same city
  // safety net — the rebuild normally finishes inside the call above
  let genNow = genBefore;
  for (let i = 0; i < 20; i++) {
    genNow = await ev(() => window.__MT_GEN__());
    if (genNow > genBefore) break;
    await sleepMs(500);
  }
  check('world rebuild completed (generation counter advanced)', genNow > genBefore, `${genBefore} → ${genNow}`);
  const geoB = await tourCity();
  const geoDrift = (geoB.geometries ?? 0) - (geoA.geometries ?? 0);
  const geoTol = Math.max(12, Math.round((geoA.geometries ?? 0) * 0.18));
  check('rebuild does not leak GPU geometries (count stays bounded)',
    geoDrift <= geoTol,
    `geometries ${geoA.geometries} → ${geoB.geometries} (drift ${geoDrift}, tol ${geoTol})`);
  check('rebuilt city is complete (identical meshes and triangles)',
    geoB.meshes === geoA.meshes && geoB.tris === geoA.tris,
    `meshes ${geoA.meshes} → ${geoB.meshes} · tris ${geoA.tris} → ${geoB.tris}`);
  check('rebuild reuses cached textures (no texture growth)',
    (geoB.textures ?? 0) <= (geoA.textures ?? 0) + 4,
    `textures ${geoA.textures} → ${geoB.textures}`);
  await ev(() => window.__MT_SET_MODE__('play')); // leave the suite in play mode

  const passed = results.filter((r) => r.ok).length;
  console.log(`[smoke] quality checks: ${passed}/${results.length} passed`);
  if (passed !== results.length) warnings.push(`${results.length - passed} quality check(s) failed`);
}

function findEdge() {
  for (const p of EDGE_PATHS) if (existsSync(p)) return p;
  return null;
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  const puppeteerMod = await import('puppeteer-core').catch(() => null);
  if (!puppeteerMod) {
    console.error('[smoke] puppeteer-core is not installed — run `npm install` first.');
    process.exit(2);
  }
  const puppeteer = puppeteerMod.default;

  const executablePath = findEdge();
  if (!executablePath) {
    console.error('[smoke] Could not find Microsoft Edge.');
    process.exit(2);
  }

  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  // --- dev server -------------------------------------------------------
  let server = null;
  const up = await waitForServer(BASE_URL, 2500);
  if (!up) {
    console.log('[smoke] starting dev server…');
    server = spawn('npx', ['vite', '--port', '6030', '--strictPort'], {
      cwd: root,
      shell: true,
      stdio: 'ignore',
      detached: false,
    });
    if (!(await waitForServer(BASE_URL, 60000))) {
      console.error('[smoke] dev server did not come up.');
      server.kill();
      process.exit(2);
    }
  }

  const url =
    `${BASE_URL}/?seed=${encodeURIComponent(SEED)}` +
    `&quality=${QUALITY}&grid=${GRID}&rain=1&shadows=1&wet=1`;

  const errors = [];
  const warnings = [];

  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    // SwiftShader can take a very long time to hand a frame back to the
    // compositor (full-screen overlay + software GL). The default 180 s
    // protocol timeout aborted the previous run mid-suite.
    protocolTimeout: 600000,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--hide-scrollbars',
      '--mute-audio',
      '--window-size=1600,900',
    ],
    defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
  });

  let exitCode = 0;
  try {
    const page = await browser.newPage();

    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') errors.push(text);
      else if (type === 'warning') warnings.push(text);
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}\n${err.stack ?? ''}`));
    page.on('requestfailed', (req) => {
      const f = req.failure();
      // aborted navigation during teardown is noise
      if (f && !/ERR_ABORTED/.test(f.errorText)) {
        errors.push(`requestfailed: ${req.url()} — ${f.errorText}`);
      }
    });

    console.log(`[smoke] loading ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // wait for the world generation flag
    await page.waitForFunction('window.__MT_READY__ === true', { timeout: 180000 });
    console.log('[smoke] world ready');

    // let a few frames render so stats/screenshots settle
    await new Promise((r) => setTimeout(r, 2500));

    const stats = await page.evaluate(() => window.__MT_STATS__());
    console.log('[smoke] stats:', JSON.stringify(stats, null, 2));

    /* ---------------- welcome screen ---------------- */
    console.log('[smoke] welcome checks…');
    await runWelcomeTests(page, errors, warnings);

    for (const [view, file] of VIEWS) {
      const ok = await page.evaluate((v) => window.__MT_VIEW__(v), view);
      if (!ok) warnings.push(`view "${view}" not available`);
      // wait for camera tween / culling to settle
      await new Promise((r) => setTimeout(r, 1600));
      await shot(page, warnings, `${file}.png`);
    }

    /* ---------------- Phase 2: gameplay (Riven Vale) ---------------- */
    console.log('[smoke] gameplay checks…');
    await runPlayTests(page, errors, warnings);

    /* ---------------- Phase 3: memory mechanic ---------------- */
    console.log('[smoke] memory checks…');
    await runMemoryTests(page, errors, warnings);

    /* ---------------- Phase 4: living city + stealth ---------------- */
    console.log('[smoke] city-life checks…');
    await runCityLifeTests(page, errors, warnings);

    /* ---------------- Phase 5: story — the Venn case ---------------- */
    console.log('[smoke] story checks…');
    await runStoryTests(page, errors, warnings);
    await runProgressionTests(page, errors, warnings);

    /* ---------------- Phase 7: visual / audio / performance ------------ */
    console.log('[smoke] quality checks…');
    await runPhase7Tests(page, errors, warnings);

    const finalStats = await page.evaluate(() => window.__MT_STATS__());
    if (!finalStats?.world) errors.push('world stats missing after load');
    if (finalStats?.calls === 0) errors.push('renderer made zero draw calls');

    if (warnings.length) {
      console.log('\n[smoke] warnings:');
      for (const w of [...new Set(warnings)].slice(0, 40)) console.log('  -', w);
    }
    if (errors.length) {
      exitCode = 1;
      console.error('\n[smoke] ERRORS:');
      for (const e of [...new Set(errors)].slice(0, 40)) console.error('  -', e);
    } else {
      console.log('\n[smoke] no console/page errors.');
    }
    console.log(`[smoke] screenshots in ${OUT_DIR}`);
  } catch (err) {
    exitCode = 1;
    console.error('[smoke] failed:', err.message);
    if (errors.length) {
      console.error('[smoke] collected errors:');
      for (const e of [...new Set(errors)].slice(0, 40)) console.error('  -', e);
    }
  } finally {
    await browser.close().catch(() => {});
    if (server) server.kill();
  }

  process.exit(exitCode);
}

main();
