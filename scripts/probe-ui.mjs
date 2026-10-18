/**
 * Quick UI probe: boots the game headless and verifies the Phase 9 surface —
 * the corner mini-map, the re-keyed map/journal, the steady camera and the
 * articulated player rig — without running the full smoke suite.
 *
 *   node scripts/probe-ui.mjs            (starts its own dev server)
 *   SMOKE_URL=http://127.0.0.1:6030 node scripts/probe-ui.mjs
 */

import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEED = process.env.SMOKE_SEED ?? 'eidolon-77';
const GRID = process.env.SMOKE_GRID ?? '12';
const QUALITY = process.env.SMOKE_QUALITY ?? 'medium';
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server = null;
let baseUrl = process.env.SMOKE_URL ?? '';
if (!baseUrl) {
  baseUrl = 'http://127.0.0.1:6030';
  server = spawn('npx', ['vite', '--port', '6030', '--host', '127.0.0.1'], { cwd: root, shell: true, stdio: 'ignore' });
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(baseUrl);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
}

const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1024, height: 720 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

await page.goto(`${baseUrl}/?seed=${encodeURIComponent(SEED)}&quality=${QUALITY}&grid=${GRID}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__MT_READY__ === true', { timeout: 300000 });

const ev = (fn, ...args) => page.evaluate(fn, ...args);
const until = async (fn, pred, timeout = 40000) => {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeout) {
    last = await fn();
    if (last && pred(last)) return last;
    await sleep(400);
  }
  return last;
};
// SwiftShader commits a frame every few seconds, so every key press is
// followed by *polling* for its effect rather than a fixed sleep.
const press = async (code, fn, pred) => {
  await ev((c) => window.__MT_PRESS__(c), code);
  if (fn) return until(fn, pred);
  await sleep(1500);
  return null;
};
const out = {};

out.minimapBoot = await until(() => ev(() => window.__MT_MINIMAP__()), (x) => !!x.drawnAt, 60000);
out.camBefore = await ev(() => window.__MT_CAM__());

// look hard down with a full boom: the camera must never sink under the street
await ev(() => window.__MT_LOOK__(0, -400));
out.camLowPitch = await until(() => ev(() => window.__MT_CAM__()), (c) => c.pitch <= -0.34, 30000);
out.groundUnderCam = await ev((c) => window.__MT_GROUND__(c[0], c[2]), out.camLowPitch.pos);
await ev(() => window.__MT_LOOK__(0, 400)); // back up

// Tab toggles the radar
const mm = () => ev(() => window.__MT_MINIMAP__());
const mapS = () => ev(() => window.__MT_MAP__());
const jour = () => ev(() => window.__MT_JOURNAL__());
out.minimapAfterTabHide = await press('Tab', mm, (x) => x.visible === false);
out.minimapAfterTabShow = await press('Tab', mm, (x) => x.visible === true);

// M is the city map now
out.mapAfterM = await press('KeyM', mapS, (x) => x.open === true);
out.mapAfterMClose = await press('KeyM', mapS, (x) => x.open === false);

// J is the journal now
out.journalAfterJ = await press('KeyJ', jour, (x) => x === true);
await press('KeyJ', jour, (x) => x === false);

// the rig is articulated: knees and elbows move when you actually run
out.rigBefore = await ev(() => window.__MT_PLAYER__());
await ev(() => {
  window.__MT_KEY__('KeyW', true);
  window.__MT_KEY__('ShiftLeft', true);
});
out.rigRunning = await until(() => ev(() => window.__MT_PLAYER__()), (p) => p.speed > 2, 60000);
await ev(() => {
  window.__MT_KEY__('KeyW', false);
  window.__MT_KEY__('ShiftLeft', false);
});
out.rigAfter = await until(() => ev(() => window.__MT_PLAYER__()), (p) => p.speed < 0.3, 40000);

out.errors = errors;
console.log(JSON.stringify(out, null, 2));
await browser.close();
if (server) {
  // vite was spawned through a shell, so the real listener is a grandchild:
  // kill the whole tree or port 6030 stays occupied
  try {
    spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
  } catch {
    server.kill();
  }
}
