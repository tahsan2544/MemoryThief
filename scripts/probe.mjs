/**
 * Quick diagnostic: boots the page in headless Edge and dumps runtime state
 * (lights, world stats) without taking screenshots.
 *
 *   node scripts/probe.mjs [view]
 */

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = process.env.SMOKE_URL ?? 'http://127.0.0.1:6030';
const SEED = process.env.SMOKE_SEED ?? 'eidolon-77';
const GRID = process.env.SMOKE_GRID ?? '12';
const QUALITY = process.env.SMOKE_QUALITY ?? 'medium';
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => existsSync(p));

const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 800, height: 600 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror:', e.message));
await page.goto(`${BASE_URL}/?seed=${encodeURIComponent(SEED)}&quality=${QUALITY}&grid=${GRID}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__MT_READY__ === true', { timeout: 180000 });

const view = process.argv[2];
if (view) {
  await page.evaluate((v) => window.__MT_VIEW__(v), view);
  await new Promise((r) => setTimeout(r, 1200));
}

const data = await page.evaluate(() => ({
  stats: window.__MT_STATS__(),
  lights: window.__MT_LIGHTS__ ? window.__MT_LIGHTS__() : 'no hook',
}));
console.log(JSON.stringify(data, null, 2));
await browser.close();
