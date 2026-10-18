/**
 * Temporary dev probe for the Stage C building pass: boots the world, walks
 * every inspect fly-camera view and screenshots each. No agent wrangling.
 */
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => existsSync(p));
const SEED = process.env.MT_SEED ?? 'eidolon-77';
const QUALITY = process.env.MT_QUALITY ?? 'medium';
const GRID = process.env.MT_GRID ?? '12';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server = null;
let baseUrl = process.env.SMOKE_URL ?? '';
if (!baseUrl) {
  baseUrl = 'http://127.0.0.1:6030';
  server = spawn('npx', ['vite', '--port', '6030', '--host', '127.0.0.1'], { cwd: root, shell: true, stdio: 'ignore' });
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(baseUrl); if (r.ok) break; } catch { /* not up */ }
    await sleep(1000);
  }
}

const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 960, height: 720 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto(`${baseUrl}/?seed=${encodeURIComponent(SEED)}&quality=${QUALITY}&grid=${GRID}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__MT_READY__ === true', { timeout: 300000 });
await page.evaluate(() => window.__MT_WELCOME__?.(false));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const shot = async (name) => {
  await page.screenshot({ path: `${root}\\visual\\bld-${name}.png` });
  console.log('shot:', `bld-${name}`);
};

const views = (await ev(() => window.__MT_STATS__())).views ?? [];
console.log('views:', views.join(', '));
for (const v of views) {
  await ev((name) => window.__MT_VIEW__(name), v);
  await sleep(2200);
  await shot(v);
}

// ---- pavement-level close-ups: stand on the walkway of a few cells and
// face the building line (walkway is 3.6-5.2 m in from the cell edge)
const L = await ev(() => window.__MT_LAYOUT__());
await ev(() => window.__MT_SET_MODE__('play'));
const spots = [];
for (const [name, d] of Object.entries(L.districts)) {
  const cells = d.cells ?? [];
  const c = cells[Math.min(1, cells.length - 1)];
  if (!c) continue;
  spots.push({ name: `${name}-x`, x: c.x0 + 2.2, z: (c.z0 + c.z1) / 2, yaw: Math.PI / 2 });
  spots.push({ name: `${name}-z`, x: (c.x0 + c.x1) / 2, z: c.z0 + 2.2, yaw: 0 });
}
for (const s of spots) {
  await ev((p) => window.__MT_TP__(p.x, p.z, p.yaw), s);
  await sleep(2600);
  await shot(`close-${s.name}`);
}

console.log(JSON.stringify({ errors, views }, null, 2));
await browser.close();
if (server) {
  try { spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { shell: true, stdio: 'ignore' }); } catch { server.kill(); }
}
