// Drives the built app in headless Chromium: network map, planning, building, publishing,
// a click-for-history chart and a phone layout. Screenshots go to shots/, console errors fail it.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const OUT = process.env.SHOTS_DIR ?? 'shots';
mkdirSync(OUT, { recursive: true });

const errors = [];
const checks = [];
const ok = (name, cond) => {
  checks.push({ name, pass: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
};

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const watch = (page) => {
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|net::ERR|WebGL|GPU stall|GroupMarkerNotSet/i.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
};

async function waitIdle(page, timeout = 90_000) {
  await page.waitForFunction(() => !document.querySelector('.loading[role="status"] .train-track'), null, { timeout });
}

const page = await ctx.newPage();
watch(page);
await page.goto(BASE);
await page.waitForSelector('svg[aria-label="Network map of Earth observation datasets"]');
await page.screenshot({ path: `${OUT}/1-network.png` });
ok('network map draws every station', (await page.locator('.station-hit').count()) >= 20);

await page.getByRole('button', { name: /^Sentinel-2, runs live/ }).click();
await page.waitForSelector('.dossier');
await page.screenshot({ path: `${OUT}/2-dossier.png` });
ok('dossier opens with tools', (await page.locator('.dossier a').count()) >= 3);
await page.keyboard.press('Escape');

await page.fill('#goal', 'Compare greenness in Fresno County, California in summer 2019 vs summer 2025');
await page.press('#goal', 'Enter');
await page.waitForSelector('.routes .route', { timeout: 30_000 });
await page.waitForTimeout(3500);
await page.screenshot({ path: `${OUT}/3-route.png` });
ok('route view lists candidates', (await page.locator('.routes .route').count()) >= 2);

await page.getByRole('button', { name: 'Build this app' }).click();
await page.waitForSelector('.app');
await waitIdle(page);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/4-app-swipe.png` });
ok('swipe app shows both date tags', (await page.locator('.swipe-tags .tag').count()) === 2);
ok('legend renders', (await page.locator('.legend-ramp').count()) === 1);

await page.getByRole('button', { name: 'Publish link' }).click();
const shareUrl = await page.locator('.modal pre').innerText();
ok('share link holds the app', shareUrl.includes('#app='));
await page.getByRole('button', { name: 'Done' }).click();

const pub = await ctx.newPage();
watch(pub);
await pub.goto(shareUrl);
await pub.waitForSelector('.app');
await waitIdle(pub);
await pub.waitForTimeout(2500);
await pub.screenshot({ path: `${OUT}/5-published.png` });
ok('published app has fork button', await pub.getByRole('button', { name: 'Fork this route' }).isVisible());

// Cover crops: time slider + click-for-history.
await page.fill('#goal', 'Show which fields in Tompkins County, NY had a cover crop each spring since 2018, and click a field for its history');
await page.press('#goal', 'Enter');
await page.waitForSelector('.routes .route', { timeout: 30_000 });
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Build this app' }).click();
await page.waitForSelector('.app');
await waitIdle(page);
await page.waitForTimeout(2000);
ok('time slider present', (await page.locator('input[type="range"]').count()) === 1);
const box = await page.getByTestId('map').boundingBox();
await page.mouse.click(box.x + box.width * 0.52, box.y + box.height * 0.45);
await page.waitForSelector('.chart', { timeout: 120_000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/6-app-history.png` });
ok('history chart draws dots', (await page.locator('.chart circle').count()) > 5);

// Land cover stats.
await page.fill('#goal', 'How much of Austin, Texas is built up?');
await page.press('#goal', 'Enter');
await page.waitForSelector('.routes .route', { timeout: 30_000 });
await page.getByRole('button', { name: 'Build this app' }).click();
await waitIdle(page);
await page.waitForSelector('[data-testid="stats"] .classes li', { timeout: 90_000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/7-app-landcover.png` });
ok('land cover stats list classes', (await page.locator('[data-testid="stats"] .classes li').count()) >= 3);

// Phone.
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const m = await phone.newPage();
watch(m);
await m.goto(BASE);
await m.waitForSelector('.network svg');
await m.screenshot({ path: `${OUT}/8-phone-network.png` });
await m.goto(shareUrl);
await m.waitForSelector('.app');
await waitIdle(m);
await m.waitForTimeout(2000);
await m.screenshot({ path: `${OUT}/9-phone-app.png`, fullPage: true });
const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
ok('no horizontal page scroll on a phone', !overflow);

ok('no console errors', errors.length === 0);
if (errors.length) console.log(errors.slice(0, 10).join('\n'));
await browser.close();
process.exit(checks.every((c) => c.pass) ? 0 : 1);
