// Drives the built site in headless Chromium: the landing page, the builder's three steps,
// publishing, a history chart, land cover stats, the place picker, a new dataset and phone
// layouts. Screenshots go to shots/; console errors fail it.
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
    if (m.type() === 'error' && !/Failed to load resource|net::ERR|WebGL|GPU stall|GroupMarkerNotSet|nominatim.openstreetmap.org.*CORS/i.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
};

async function waitIdle(page, timeout = 120_000) {
  await page.waitForFunction(() => !document.querySelector('.loading[role="status"] .train-track'), null, { timeout });
}

async function ask(page, q) {
  if (!(await page.locator('#goal').count())) await page.getByRole('button', { name: 'Ask' }).click();
  await page.fill('#goal', q);
  await page.press('#goal', 'Enter');
  await page.waitForSelector('.routes .route', { timeout: 45_000 });
}

const page = await ctx.newPage();
watch(page);

// ---- Landing ----
await page.goto(BASE);
await page.waitForSelector('.hero h1');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/0-landing.png` });
await page.fill('#hero-goal', 'i want sea surface temeprature, 1999-now, atlantic ocean');
await page.waitForFunction(() => document.querySelector('.hero .heard')?.textContent?.includes('Atlantic Ocean'), null, { timeout: 15_000 });
ok('landing reads back a typed question', (await page.locator('.hero .heard').innerText()).includes('1999 to now'));
ok('landing map draws the route', (await page.locator('.hero-route').count()) >= 1);
ok('departures board lists real apps', (await page.locator('.board a[href*="#app="]').count()) >= 8);

// ---- Builder: ask, route, app ----
await page.goto(`${BASE}#build`);
await page.waitForSelector('svg[aria-label="Network map of Earth observation datasets"]');
ok('network map draws every station', (await page.locator('.station-hit').count()) >= 28);
await page.getByRole('button', { name: /^Sentinel-2, runs live/ }).click();
await page.waitForSelector('.dossier');
ok('dossier opens with tools', (await page.locator('.dossier a').count()) >= 3);
await page.keyboard.press('Escape');
await page.fill('#goal', 'Compare greenness of fields in Fresno County, California in summer 2019 vs summer 2025');
await page.waitForFunction(() => document.querySelector('.heard')?.textContent?.includes('Found on the map'), null, { timeout: 15_000 });
await page.screenshot({ path: `${OUT}/1-ask.png` });
ok('ask view reads back the question', (await page.locator('.heard').innerText()).includes('Summer 2019 vs Summer 2025'));
await page.press('#goal', 'Enter');
await page.waitForSelector('.routes .route', { timeout: 45_000 });
await page.waitForTimeout(3000);
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
await ask(page, 'Show which fields in Tompkins County, NY had a cover crop each spring since 2018, and click a field for its history');
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
await ask(page, 'How much of Austin, Texas is built up?');
await page.getByRole('button', { name: 'Build this app' }).click();
await waitIdle(page);
await page.waitForSelector('[data-testid="stats"] .classes li', { timeout: 90_000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/7-app-landcover.png` });
ok('land cover stats list classes', (await page.locator('[data-testid="stats"] .classes li').count()) >= 3);

// A new dataset: sea surface temperature over a whole ocean.
await ask(page, 'sea surface temperature in the gulf of mexico last summer');
ok('ocean question rides OISST', (await page.locator('.route[data-selected="true"] .route-title').innerText()).includes('OISST'));
await page.getByRole('button', { name: 'Build this app' }).click();
await waitIdle(page);
await page.waitForSelector('.legend-ends', { timeout: 90_000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/8-app-sst.png` });
ok('sea temperature legend reads in °C', (await page.locator('.legend-ends').innerText()).includes('°C'));

// No place in the question: pick it on the map.
await ask(page, 'greenness this summer');
await page.getByRole('button', { name: 'Pick it on the map' }).first().click();
await page.waitForSelector('.picker');
await page.fill('#picker-q', 'Ithaca');
await page.waitForSelector('.picker-hits button', { timeout: 20_000 });
await page.locator('.picker-hits button').first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/9-picker.png` });
await page.locator('.picker .btn-primary').click();
await page.waitForFunction(() => !document.querySelector('.no-place') && document.querySelector('.routes .route'), null, { timeout: 30_000 });
ok('place picked on the map plans a route', (await page.locator('.lede').innerText()).toLowerCase().includes('ithaca'));

// Phone.
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const m = await phone.newPage();
watch(m);
await m.goto(BASE);
await m.waitForSelector('.hero h1');
await m.waitForTimeout(1000);
await m.screenshot({ path: `${OUT}/10-phone-landing.png` });
const landingOverflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
ok('no horizontal page scroll on the phone landing page', !landingOverflow);
await m.goto(`${BASE}#build`);
await m.waitForSelector('#goal');
ok('ask view fits a phone', !(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
await m.goto(shareUrl);
await m.waitForSelector('.app');
await waitIdle(m);
await m.waitForTimeout(2000);
await m.screenshot({ path: `${OUT}/11-phone-app.png`, fullPage: true });
ok('no horizontal page scroll on a phone app', !(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));

ok('no console errors', errors.length === 0);
if (errors.length) console.log(errors.slice(0, 10).join('\n'));
await browser.close();
process.exit(checks.every((c) => c.pass) ? 0 : 1);
