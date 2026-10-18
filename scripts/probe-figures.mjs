/**
 * Visual figure probe: boots the game headless, parks one agent of each
 * role (and a memory-source NPC) right in front of the camera and
 * screenshots them — the fast way to eyeball faces, knees and palettes
 * without running the full smoke suite.
 *
 *   node scripts/probe-figures.mjs            (starts its own dev server)
 *   SMOKE_URL=http://127.0.0.1:6030 node scripts/probe-figures.mjs
 *
 * Shots land in visual/ (probe output, safe to delete).
 */

import { existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'visual');
const SEED = process.env.SMOKE_SEED ?? 'eidolon-77';
const GRID = process.env.SMOKE_GRID ?? '12';
const QUALITY = process.env.SMOKE_QUALITY ?? 'medium';
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

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
  defaultViewport: { width: 960, height: 720 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

await page.goto(`${baseUrl}/?seed=${encodeURIComponent(SEED)}&quality=${QUALITY}&grid=${GRID}&dist=2.2`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__MT_READY__ === true', { timeout: 300000 });
await page.evaluate(() => window.__MT_WELCOME__?.(false));
// dist=2.2 (URL) puts the third-person boom at its minimum for close-ups
console.log('boom dist:', (await page.evaluate(() => window.__MT_CAM__()))?.dist);

const ev = (fn, ...args) => page.evaluate(fn, ...args);
const shot = async (name) => {
  // give SwiftShader a couple of committed frames
  await sleep(2600);
  await page.screenshot({ path: resolve(OUT, `${name}.png`) });
  console.log(`shot: ${name}`);
};

const wrap = (v) => (((v + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

/** Settle the camera behind the player at the given yaw. */
const settle = async (yaw) => {
  const want = yaw + Math.PI;
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    const cam = await ev(() => window.__MT_CAM__());
    if (cam && Math.abs(wrap(cam.yaw - want)) < 0.3) break;
    await sleep(500);
  }
  await sleep(1400);
};

/**
 * Frame a subject: park the player slightly LEFT and level with it, facing
 * straight ahead, so the subject sits ~1 m to the player's right — clear of
 * the body, close enough to read faces.
 */
const frameBeside = async (sx, sz) => {
  await ev((p) => window.__MT_TP__(p.x, p.z, p.yaw), { x: sx - 1.1, z: sz + 0.4, yaw: Math.PI });
  await settle(Math.PI);
};

const agents = await ev(() => window.__MT_AGENTS__());
const byType = {};
for (const a of agents) if (!byType[a.type]) byType[a.type] = a;

for (const type of ['civilian', 'guard', 'vendor', 'target']) {
  const a = byType[type];
  if (!a) continue;
  await ev((id, x, z, fx, fz) => window.__MT_AGENT_POS__(id, x, z, fx, fz),
    a.id, a.x, a.z, a.x, a.z + 3);
  await frameBeside(a.x, a.z);
  await shot(`fig-${type}-a`);
  await ev((id) => window.__MT_AGENT_PAUSE__(id, 0.12), a.id); // nudge a pose change
  await shot(`fig-${type}-b`);
}

/**
 * Face close-up: the subject sits BETWEEN the (zoomed) camera and the
 * player, ~1 m from the lens, turned toward +Z (the camera side) — the
 * face plate fills enough pixels to judge eyes/brows/mouth.
 */
const faceShot = async (a, name) => {
  const pin = () => ev((id, x, z, fx, fz) => window.__MT_AGENT_POS__(id, x, z, fx, fz),
    a.id, a.x, a.z, a.x, a.z + 3); // face the camera
  await pin();
  await ev((id) => window.__MT_AGENT_PAUSE__(id, 60), a.id);
  // camera = player + (0,0,2.2) at yaw π, and app.js uses near = 1 m — so the
  // agent's face plane must land ~1.3 m out (0.7 m standoff, agent dead centre,
  // its body hiding the player directly behind it).
  await ev((p) => window.__MT_TP__(p.x, p.z, p.yaw), { x: a.x, z: a.z - 0.7, yaw: Math.PI });
  await settle(Math.PI);
  await pin(); // relocate may reset the pause — pin, then pause LAST
  await ev((id) => window.__MT_AGENT_PAUSE__(id, 60), a.id);
  const before = (await ev(() => window.__MT_AGENTS__())).find((g) => g.id === a.id);
  const cam = await ev(() => window.__MT_CAM__());
  const d = before && cam?.pos
    ? Math.hypot(after_(before, cam)).toFixed(2)
    : '?';
  await shot(name);
  const after = (await ev(() => window.__MT_AGENTS__())).find((g) => g.id === a.id);
  console.log(name, 'mode', before?.mode, 'camDist', d, 'drift',
    before && after ? Math.hypot(after.x - before.x, after.z - before.z).toFixed(2) : '?');
};

// distance camera → agent centre (must exceed the 1 m near plane)
const after_ = (ag, cam) => [cam.pos[0] - ag.x, cam.pos[2] - ag.z];

if (byType.civilian) await faceShot(byType.civilian, 'face-civilian');
if (byType.guard) await faceShot(byType.guard, 'face-guard');
if (byType.vendor) await faceShot(byType.vendor, 'face-vendor');

// a memory-source NPC (station attendant etc.) — turned to face the camera
const sources = await ev(() => window.__MT_SOURCES__());
const npcSrc = (sources ?? []).find((s) => s.kind === 'npc');
if (npcSrc) {
  await ev((id) => window.__MT_SOURCE_FACE__(id, 0), npcSrc.id); // faces +Z = the camera side
  await frameBeside(npcSrc.x, npcSrc.z);
  await shot(`fig-npc-${npcSrc.id}`);
}

// city overview for the building work
const views = (await ev(() => window.__MT_STATS__())).views ?? [];
console.log('views:', views.join(', '));
for (const v of views) {
  if (!/street|overview|facade|sky/i.test(v)) continue;
  await ev((n) => window.__MT_VIEW__(n), v);
  await shot(`view-${v}`);
}

console.log(JSON.stringify({ errors, views, agents: agents.length }, null, 2));
await browser.close();
if (server) {
  try {
    spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
  } catch {
    server.kill();
  }
}
