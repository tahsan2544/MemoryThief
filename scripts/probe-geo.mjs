/**
 * Geometry-count probe: explains the phase-7 "rebuild does not leak GPU
 * geometries" check by measuring renderer.info.memory.geometries around a
 * world rebuild (KeyN).
 *
 * The check compares the count before and after a rebuild. This probe answers
 * two questions the check cannot:
 *   1. Did the rebuilt world actually produce every mesh? (JS-side count —
 *      independent of rendering)
 *   2. Is the reported GPU-geometry count just "what has been rendered at
 *      least once"? (it climbs as different viewpoints render)
 *
 *   node scripts/probe-geo.mjs           (starts its own dev server)
 *   SMOKE_URL=http://127.0.0.1:6030 node scripts/probe-geo.mjs
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
const sample = async (label) => {
  const s = await ev(() => window.__MT_STATS__());
  const row = {
    label,
    geo: s.memory.geometries,
    tex: s.memory.textures,
    meshes: s.world?.meshes,
    tris: s.world?.triangles,
    frame: s.frame,
  };
  console.log(JSON.stringify(row));
  return row;
};

const out = { samples: [] };

// 1. boot state (camera wherever the game puts it after loading)
out.samples.push(await sample('boot'));

// 2. let it sit — does the count grow without the camera moving?
await sleep(8000);
out.samples.push(await sample('static+8s'));

// 3. tour the canned viewpoints so *every* chunk has rendered at least once
for (const v of ['overview', 'tower', 'market', 'station', 'garden', 'archive', 'street']) {
  await ev((n) => window.__MT_VIEW__(n), v);
  await sleep(2500);
}
out.samples.push(await sample('after viewpoint tour'));
const geoBefore = out.samples[out.samples.length - 1].geo;

// 4. deterministic rebuild with the SAME seed, twice: proves generation is
//    seed-deterministic (identical mesh/triangle counts) and shows how the
//    rendered-geometry count compares when both sides tour the same poses
const tour = async (label) => {
  for (const v of ['overview', 'tower', 'market', 'station', 'garden', 'archive', 'street']) {
    await ev((n) => window.__MT_VIEW__(n), v);
    await sleep(2200);
  }
  // wait for two consecutive equal samples (upload settles)
  let prev = -1;
  let cur = -1;
  for (let i = 0; i < 15; i++) {
    prev = cur;
    cur = (await ev(() => window.__MT_STATS__())).memory.geometries;
    if (cur === prev && cur > 0) break;
    await sleep(900);
  }
  return sample(label);
};

const rebuild = async (label) => {
  const gen0 = await ev(() => window.__MT_GEN__());
  await ev((s) => window.__MT_GENERATE__(s), SEED);
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const g = await ev(() => window.__MT_GEN__());
    if (g > gen0) break;
  }
  await sample(`${label} rebuild done`);
  return tour(label);
};

out.samples.push(await rebuild('rebuild#1 '));
out.samples.push(await rebuild('rebuild#2 '));
const [s2, s3] = out.samples.slice(-2);
out.determinism = {
  meshes: [s2.meshes, s3.meshes],
  tris: [s2.tris, s3.tris],
  identical: s2.meshes === s3.meshes && s2.tris === s3.tris,
};

out.geoBefore = geoBefore;
out.errors = errors;
console.log(JSON.stringify({ summary: out }, null, 2));

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
