/**
 * probe-perf: honest Phase 7 profiling.
 *
 * Boots the dev server page in headless Edge (SwiftShader), then samples the
 * renderer at each graphics preset and across a world rebuild. Everything it
 * reports is *measured*, not claimed — and because it runs on SwiftShader
 * (software GL), the absolute FPS numbers are NOT representative of real
 * hardware. What IS meaningful here are the relative deltas: draw calls,
 * triangles, visible point lights and geometry/texture counts, because those
 * depend on the scene and the preset, not on the GPU.
 *
 *   npm run dev       (or let this script start it)
 *   node scripts/probe-perf.mjs
 *
 * Env: PROBE_URL (default http://127.0.0.1:6030), PROBE_SEED, PROBE_GRID.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const BASE_URL = process.env.PROBE_URL ?? 'http://127.0.0.1:6030';
const SEED = process.env.PROBE_SEED ?? 'eidolon-77';
/** Quality the page BOOTS on — this matters, because the WebGL context is
 *  created once with that preset's flags and can never change them again. */
const BOOT_QUALITY = process.env.PROBE_QUALITY ?? 'medium';
const GRID = process.env.PROBE_GRID ?? '12';

const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/** Take the worst (max) of N samples. Shadows are cadence-throttled (Phase 7),
 *  so the depth pass only lands on some frames — we force a refresh before
 *  each read to guarantee the *peak* per-frame cost (main pass + depth pass)
 *  is observed, which is the honest number to compare presets against. */
async function sample(page, n = 5, intervalMs = 350) {
  let best = null;
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => window.__MT_SHADOW_REFRESH__?.());
    await sleep(120); // let the refreshed frame render
    const s = await page.evaluate(() => window.__MT_STATS__());
    if (!best || s.calls > best.calls) best = s;
    await sleep(intervalMs);
  }
  return best;
}

/** Median app-frame throughput, measured separately from `sample()`.
 *
 *  The windows are LONG (15 s) on purpose: at the ~0.3 fps software GL gives
 *  us, a 6 s window contains only two frames, so every reading snaps to
 *  multiples of 0.17 and a real difference vanishes into the quantisation.
 *  15 s keeps ~5 frames per window, which is what makes 0.33 and 0.53
 *  distinguishable rather than "0.3 and 0.5, probably the same".
 *
 *  Two reasons this does not just read `stats.fps` or `stats.frame`:
 *    1. `stats.fps` accumulated a dt CLAMPED to 100 ms, so any frame slower
 *       than that reported exactly 10 fps — a ceiling, not a measurement.
 *    2. `stats.frame` bumps once per renderer.render() call, and a
 *       post-processing frame makes many of them (every fullscreen quad pass),
 *       so medium/high counted passes while low counted frames. Comparing them
 *       made low look 10x slower than high when it was rendering the same game.
 *
 *  Instead: count completed APP frames over a fixed wall-clock window. That is
 *  throughput, it is not game-state dependent, and taking the median of a few
 *  windows keeps one stall from owning the number. */
async function sampleFps(page, windowMs = 15000, windows = 3) {
  const rates = [];
  for (let w = 0; w < windows; w++) {
    const start = await page.evaluate(() => window.__MT_STATS__().appFrame);
    const t0 = Date.now();
    await sleep(windowMs);
    const end = await page.evaluate(() => window.__MT_STATS__().appFrame);
    const dt = (Date.now() - t0) / 1000;
    if (dt > 0 && end >= start) rates.push((end - start) / dt);
  }
  if (!rates.length) return null;
  rates.sort((a, b) => a - b);
  return +rates[Math.floor(rates.length / 2)].toFixed(2);
}

/** Hold until the app is actually rendering at the new preset.
 *
 *  A fixed sleep is not enough: swapping presets changes feature flags, and
 *  under software GL the resulting stall can outlast any timeout we would care
 *  to guess. Waiting on the APP frame counter (not renderer.render passes — a
 *  post frame makes a dozen per app frame) means counting starts only once the
 *  hitch is genuinely over.
 *
 *  The bar is deliberately low — 2 frames in 8 s — because SwiftShader renders
 *  this city at well under 1 fps; anything stricter would never be met by a
 *  healthy build. */
async function waitSettled(page, timeoutMs = 45000, windowMs = 8000, minFrames = 2) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const a = await page.evaluate(() => window.__MT_STATS__().appFrame);
    await sleep(windowMs);
    const b = await page.evaluate(() => window.__MT_STATS__().appFrame);
    if (b - a >= minFrames) return true;
  }
  return false;
}

async function main() {
  const puppeteerMod = await import('puppeteer-core').catch(() => null);
  if (!puppeteerMod) {
    console.error('[probe] puppeteer-core is not installed — run `npm install` first.');
    process.exit(2);
  }
  const puppeteer = puppeteerMod.default;

  const executablePath = findEdge();
  if (!executablePath) {
    console.error('[probe] could not find Microsoft Edge.');
    process.exit(2);
  }

  let server = null;
  if (!(await waitForServer(BASE_URL, 1500))) {
    console.log('[probe] starting dev server…');
    server = spawn('npx', ['vite', '--port', '6030', '--strictPort'], {
      cwd: root,
      shell: true,
      stdio: 'ignore',
      detached: false,
    });
    if (!(await waitForServer(BASE_URL, 60000))) {
      console.error('[probe] dev server did not come up.');
      server.kill();
      process.exit(2);
    }
  }

  const url = `${BASE_URL}/?seed=${encodeURIComponent(SEED)}&quality=${BOOT_QUALITY}&grid=${GRID}&rain=1&shadows=1&wet=1`;

  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
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

  try {
    const page = await browser.newPage();
    const logs = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

    console.log(`[probe] loading ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction('window.__MT_READY__ === true', { timeout: 180000 });
    console.log('[probe] world ready — sampling presets (peak draw calls + median fps)\n');

    // stand on a street so the sample is a realistic play view, not the sky
    await page.evaluate(() => window.__MT_SPAWN__('oldquarter'));
    await sleep(1500);

    const PRESETS = ['low', 'medium', 'high'];
    const switchTo = async (preset) => {
      const res = await page.evaluate((p) => window.__MT_QUALITY__(p), preset);
      if (!res.ok) console.error('[probe] quality switch failed:', res);
      return !!res.ok;
    };

    // Pass 1 — warm-up, no measurements. Every preset compiles its material
    // programs here, so pass 2 never pays a compile it has not already paid.
    console.log('[probe] warming shader programs (discarding this pass)…');
    for (const preset of PRESETS) {
      if (!(await switchTo(preset))) continue;
      if (!(await waitSettled(page))) console.log(`[probe] ${preset} never settled during warm-up`);
    }

    // Pass 2 — measure, now that compilation is done.
    const rows = [];
    for (const preset of PRESETS) {
      if (!(await switchTo(preset))) continue;
      if (!(await waitSettled(page))) console.log(`[probe] ${preset} never settled — reading anyway`);
      const s = await sample(page, 6, 350);
      const prog0 = (await page.evaluate(() => window.__MT_STATS__()))?.memory?.programs;
      const fps = await sampleFps(page);
      const post = await page.evaluate(() => window.__MT_STATS__());
      rows.push({
        preset,
        pixelRatio: post?.pixelRatio ?? '?', // effective drawing-buffer scale
        drawCalls: s.calls,
        triangles: s.triangles,
        pointLights: s.lights?.pointVisible ?? '?',
        shadowHz: s.shadow?.hz ?? '?',
        motes: (await page.evaluate(() => window.__MT_FX__())).motes.count,
        // compiled program count BEFORE → AFTER the fps window: if it climbs
        // while a preset is selected, that preset is stuck recompiling material
        // programs instead of merely being slow
        programs: `${prog0 ?? '?'} → ${post?.memory?.programs ?? '?'}`,
        stages: post?.stages ?? {},
        fps,
      });
    }

    // rebuild stability: geometry/texture counts must stay bounded
    const before = await page.evaluate(() => window.__MT_STATS__());
    console.log('[probe] rebuilding the world to check for leaks…');
    await page.evaluate(() => window.__MT_KEY__('KeyN', true));
    await page.evaluate(() => window.__MT_KEY__('KeyN', false));
    const genBefore = await page.evaluate(() => window.__MT_GEN__());
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      if ((await page.evaluate(() => window.__MT_GEN__())) > genBefore) break;
    }
    await sleep(1200);
    const after = await page.evaluate(() => window.__MT_STATS__());

    console.log('\n=== Graphics presets (measured, SwiftShader) ===');
    console.log('preset  pr      drawCalls  triangles   lights  shadowHz  motes  programs       medFps');
    for (const r of rows) {
      console.log(
        `${r.preset.padEnd(8)}${String(r.pixelRatio).padStart(5)} ${String(r.drawCalls).padStart(9)}  ${String(r.triangles).padStart(10)}  ` +
          `${String(r.pointLights).padStart(6)}  ${String(r.shadowHz).padStart(8)}  ${String(r.motes).padStart(6)}  ` +
          `${String(r.programs).padEnd(12)}  ${String(r.fps).padStart(5)}`,
      );
    }

    // A total fps number cannot say WHERE a frame went. update+logic is plain
    // JS game code; render is the driver submitting/drawing the scene. A slow
    // frame that shows up in `render` while `update` stays flat is a GPU-side
    // stall, and one that shows up in `update` is game code.
    const ms = (v) => (Number.isFinite(v) ? v.toFixed(1).padStart(7) : '      ?');
    console.log('\n=== Where the frame goes (ms, EMA of the last ~10 frames) ===');
    console.log('preset   update   logic    render');
    for (const r of rows) {
      console.log(
        `${r.preset.padEnd(8)} ${ms(r.stages.update)} ${ms(r.stages.logic)} ${ms(r.stages.render)}`,
      );
    }

    /* Resolution sweep — the one experiment that says whether the scene is
     * fill-bound or geometry-bound. Every preset converged on nearly the same
     * frame rate despite differing by 2x in triangles and 0-10 lights, which
     * already points at fill; dropping the pixel count and watching the rate
     * move (or fail to) is what turns that inference into a measurement. */
    console.log('\n=== Resolution sweep (medium preset, same world) ===');
    console.log('scale  pixelRatio  triangles   medFps');
    await switchTo('medium');
    await waitSettled(page);
    for (const scale of [1, 0.75, 0.5]) {
      await page.evaluate((s) => window.__MT_RES__(s), scale);
      await waitSettled(page);
      const st = await page.evaluate(() => window.__MT_STATS__());
      const fps = await sampleFps(page);
      console.log(
        `${String(Math.round(scale * 100) + '%').padEnd(6)} ${String(st.pixelRatio).padStart(11)}  ` +
          `${String(st.triangles).padStart(10)}  ${String(fps).padStart(5)}`,
      );
    }
    await page.evaluate(() => window.__MT_RES__(1)); // leave the app as we found it
    console.log('\n=== Rebuild stability (memory leak check) ===');
    console.log(`geometries: ${before.memory?.geometries} → ${after.memory?.geometries}`);
    console.log(`textures:   ${before.memory?.textures} → ${after.memory?.textures}`);
    console.log(`draw calls: ${before.calls} → ${after.calls}`);
    console.log('\n* drawCalls/triangles are the PEAK frame (the one that also ran the');
    console.log('  shadow depth pass). medFps is the median of three 15 s windows of');
    console.log('  COMPLETED APP FRAMES (app.frameCount), after a warm-up pass that');
    console.log('  visits every preset first. It deliberately reads neither stats.fps');
    console.log('  (a dt clamp that reports a flat 10 whenever frames exceed 100 ms)');
    console.log('  nor renderer.info.render.frame (which counts post-process passes,');
    console.log('  inflating bloom-enabled presets). Programs shows shader compiles');
    console.log('  before → after: flat means the preset is rendering, not recompiling.');
    console.log('  Everything is measured under SwiftShader (software GL) and is NOT');
    console.log('  representative of real GPU frame rates — but it is a stable, repeatable');
    console.log('  basis for comparing changes, which is what matters here.');

    const errs = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
    if (errs.length) {
      console.log('\n=== Console errors during profiling ===');
      for (const e of errs.slice(0, 20)) console.log(' ', e);
    } else {
      console.log('\nNo console errors during profiling.');
    }
  } finally {
    try {
      await browser.close();
    } catch {
      /* the context can already be gone — that is not a profiling failure */
    }
    if (server) {
      // vite was spawned through a shell, so the real listener is a grandchild:
      // kill the whole tree or port 6030 stays occupied
      try {
        spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
      } catch {
        server.kill();
      }
    }
  }
}

main().catch((err) => {
  console.error('[probe] failed:', err);
  process.exit(1);
});
