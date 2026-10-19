/**
 * Visual probe for the day/night + weather pass.
 *
 * Boots the city with NO pins (the clock runs, the schedule decides rain —
 * the path players get), screenshots the welcome card over the live city,
 * then jumps the clock through a full day from street and overview angles,
 * proving on camera that sky, lamps, fog and rain follow the hour. Also
 * captures the upgraded mini-map at a walk and at a sprint.
 *
 * Run: node scripts/probe-daynight.mjs   (port 6030, screenshots in visual/)
 */
import { existsSync, mkdirSync } from 'node:fs';
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

mkdirSync(resolve(root, 'visual'), { recursive: true });
const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  protocolTimeout: 600000,
  args: ['--no-sandbox', '--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 960, height: 720 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

// no pins: cycle ON, rain from the schedule — exactly what a player gets
await page.goto(`${baseUrl}/?seed=${encodeURIComponent(SEED)}&quality=${QUALITY}&grid=${GRID}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__MT_READY__ === true', { timeout: 300000 });
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const shot = async (name) => {
  await page.screenshot({ path: `${root}\\visual\\dn-${name}.png` });
  console.log('shot:', `dn-${name}`);
};
const clipShot = async (name, clip) => {
  await page.screenshot({ path: `${root}\\visual\\dn-${name}.png`, clip });
  console.log('shot:', `dn-${name}`);
};

const rows = [];

/* ---- 1. the welcome card over the live city ---------------------------- */
await sleep(2600); // let a few frames + the clock HUD land
await shot('00-welcome');
const welcomeClock = await ev(() => document.getElementById('welcome-clock')?.textContent ?? '');
const welcomeStamp = await ev(() => document.getElementById('welcome-stamp')?.textContent ?? '');
console.log('welcome:', welcomeClock, '|', welcomeStamp);
await ev(() => window.__MT_WELCOME__(false));

/* ---- 2. a full day from the overview (sky is the point) --------------- */
const HOURS = [2, 5.5, 6.5, 8, 12, 15, 18.5, 20.5, 22.5];
await ev(() => window.__MT_VIEW__('overview'));
for (const h of HOURS) {
  const t = await ev((hh) => window.__MT_TIME__(hh), h);
  const sky = await ev(() => window.__MT_SKY__());
  const lamps = await ev(() => window.__MT_LIGHT_TIME__());
  const st = await ev(() => window.__MT_STATS__());
  await sleep(2400); // SwiftShader: wait for frames so the palette lands on screen
  await shot(`ov-${String(h).replace('.', 'p')}`);
  rows.push({
    hour: h,
    phase: t.phase,
    k: Number(t.dayness.toFixed(2)),
    warm: Number(t.warmth.toFixed(2)),
    lamps: lamps.nightScale,
    rain: t.weather.rain,
    fogMul: Number(t.weather.fogMul.toFixed(2)),
    intensity: st.rain?.intensity,
    rainVisible: st.rain?.enabled,
    stars: sky.starOpacity,
    sun: sky.sunOpacity,
    moon: sky.moonOpacity,
  });
  console.log(JSON.stringify(rows[rows.length - 1]));
}

/* ---- 3. street level: lamps, fog and rain at dawn/noon/night ---------- */
await ev(() => window.__MT_SET_MODE__('play'));
for (const h of [6.5, 12, 22]) {
  await ev((hh) => window.__MT_TIME__(hh), h);
  await sleep(2400);
  await shot(`street-${String(h).replace('.', 'p')}`);
}

/* ---- 4. weather by time: rain hour vs dry hour (the live path) -------- */
const scan = await ev(() => {
  const wet = [];
  const dry = [];
  for (let h = 0; h < 24; h += 0.25) {
    const w = window.__MT_WEATHER__(h);
    if (w.rain > 0.55) wet.push(h);
    else if (w.rain < 0.03) dry.push(h);
  }
  return { wet: wet.slice(0, 3), dry: dry.slice(0, 3) };
});
const weatherProof = {};
for (const [kind, list] of [['rain', scan.wet], ['clear', scan.dry]]) {
  const h = list[0];
  if (h === undefined) continue;
  await ev((hh) => window.__MT_TIME__(hh), h);
  // poll until the live gate converges (headless frames can lag a fixed sleep)
  let st = null;
  for (let i = 0; i < 10; i++) {
    await sleep(1200);
    st = await ev(() => window.__MT_STATS__());
    const wantVisible = kind === 'rain';
    if (st.rain?.enabled === wantVisible && (wantVisible ? (st.rain?.intensity ?? 0) > 0.1 : (st.rain?.intensity ?? 1) < 0.05)) break;
  }
  weatherProof[kind] = { hour: h, intensity: st.rain?.intensity, visible: st.rain?.enabled, frame: st.appFrame };
  await shot(`wx-${kind}-${String(h).replace('.', 'p')}`);
  console.log('weather', kind, JSON.stringify(weatherProof[kind]));
}

/* ---- 5. the mini-map: idle pips + the sprint zoom ---------------------- */
await ev(() => window.__MT_TIME__(22));
await ev((d) => window.__MT_SPAWN__(d), 'oldquarter');
await sleep(1800);
const radar = { x: 960 - 204, y: 0, width: 204, height: 270 };
await clipShot('minimap-idle', radar);
const mmIdle = await ev(() => window.__MT_MINIMAP__());
await ev(() => {
  window.__MT_KEY__('ShiftLeft', true);
  window.__MT_KEY__('KeyW', true);
});
await sleep(4200);
await clipShot('minimap-run', radar);
await ev(() => {
  window.__MT_KEY__('ShiftLeft', false);
  window.__MT_KEY__('KeyW', false);
});
const mmRun = await ev(() => window.__MT_MINIMAP__());
console.log('minimap idle:', JSON.stringify({ range: mmIdle.worldRange, off: mmIdle.offscreen, on: mmIdle.onmap }));
console.log('minimap run: ', JSON.stringify({ range: mmRun.worldRange, speed: mmRun.player?.speed }));

/* ---- done -------------------------------------------------------------- */
console.log(JSON.stringify({ rows, weatherProof, errors }, null, 2));
await browser.close();
if (server) {
  try { spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { shell: true, stdio: 'ignore' }); } catch { server.kill(); }
}
