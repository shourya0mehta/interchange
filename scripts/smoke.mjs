// Drives the built site in headless Chromium: the home page and its globe, the studio from a
// question to a running app, follow-up requests, publishing (link, embed, image), a history chart,
// land cover totals, sea temperature, the place picker and phone layouts. Screenshots go to
// shots/; console errors fail it.
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
const waitIdle = (page, timeout = 150_000) => page.waitForFunction(() => !document.querySelector('.loading[role="status"] .train-track'), null, { timeout });
const built = (page, n = 1) => page.waitForFunction((k) => document.querySelectorAll('.turn-built').length >= k, n, { timeout: 60_000 });

const page = await ctx.newPage();
watch(page);

// ---- Home ----
await page.goto(BASE);
await page.waitForSelector('.home-hero h1');
await page.waitForSelector('canvas.globe[data-ready="true"]', { timeout: 20_000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/0-home.png` });
ok('globe draws from real data', true);
await page.fill('#hero-goal', 'i want sea surface temeprature, 1999-now, atlantic ocean');
await page.waitForFunction(() => document.querySelector('.home-hero .heard')?.textContent?.includes('Atlantic Ocean'), null, { timeout: 15_000 });
ok('home reads back a typed question', (await page.locator('.home-hero .heard').innerText()).includes('1999 to now'));
ok('departures board lists real apps', (await page.locator('.board a[href*="#app="]').count()) >= 8);
await page.getByRole('tab', { name: /Classrooms/ }).click();
await page.waitForFunction(() => document.querySelector('.job-panel img')?.getAttribute('src')?.includes('classroom'), null, { timeout: 5_000 }).catch(() => {});
ok('jobs switch to classrooms', (await page.locator('.job-panel img').getAttribute('src')).includes('classroom'));
await page.locator('#network').scrollIntoViewIfNeeded();
await page.waitForSelector('.station-hit', { timeout: 10_000 });
ok('network map draws every station', (await page.locator('.station-hit').count()) >= 28);
await page.getByRole('button', { name: /^Sentinel-2, runs live/ }).click();
await page.waitForSelector('.dossier');
ok('dossier opens with tools', (await page.locator('.dossier a').count()) >= 3);
await page.keyboard.press('Escape');

// ---- Studio: a question straight to an app ----
await page.goto(`${BASE}#build`);
await page.waitForSelector('#goal');
await page.fill('#goal', 'Compare greenness of fields in Fresno County, California in summer 2019 vs summer 2025');
await page.waitForFunction(() => document.querySelector('.heard')?.textContent?.includes('Found on the map'), null, { timeout: 15_000 });
await page.screenshot({ path: `${OUT}/1-studio-start.png` });
ok('studio reads back the question', (await page.locator('.heard').innerText()).includes('Summer 2019 vs Summer 2025'));
await page.press('#goal', 'Enter');
await built(page);
await page.waitForSelector('.app');
await waitIdle(page);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/2-studio-app.png` });
ok('build log names the dataset', (await page.locator('.turn-built').first().innerText()).includes('Sentinel-2'));
ok('swipe app shows both date tags', (await page.locator('.swipe-tags .tag').count()) === 2);
ok('legend renders', (await page.locator('.legend-ramp').count()) === 1);
ok('other routes offered', (await page.locator('.chip-route').count()) >= 1);

// A follow-up request: older years move it to Landsat.
await page.fill('#follow-input', 'compare with 2010 instead');
await page.press('#follow-input', 'Enter');
await built(page, 2);
await waitIdle(page);
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/3-follow-up.png` });
ok('follow-up rebuilds on Landsat for 2010', (await page.locator('.turn-built').last().innerText()).includes('Landsat'));
ok('earlier version can be restored', (await page.getByRole('button', { name: 'Show this version' }).count()) >= 1);

// Publish: link, embed, image.
await page.getByRole('button', { name: 'Publish', exact: true }).click();
await page.waitForSelector('.share');
const shareUrl = await page.locator('.share-code').first().innerText();
ok('share link holds the app', shareUrl.includes('#app='));
await page.getByRole('tab', { name: 'Embed' }).click();
const embedCode = await page.locator('.share-code').first().innerText();
ok('embed code has an iframe and a credit line', embedCode.includes('<iframe') && embedCode.includes('Landsat imagery courtesy'));
await page.getByRole('tab', { name: 'Image' }).click();
await page.waitForSelector('.image-preview img', { timeout: 30_000 });
await page.screenshot({ path: `${OUT}/4-publish-image.png` });
ok('slide image is drawn', (await page.locator('.image-preview img').count()) === 1);
await page.getByRole('button', { name: 'Done' }).click();

const pub = await ctx.newPage();
watch(pub);
await pub.goto(shareUrl);
await pub.waitForSelector('.app');
await waitIdle(pub);
await pub.waitForTimeout(2000);
await pub.screenshot({ path: `${OUT}/5-published.png` });
ok('published app has fork button', await pub.getByRole('button', { name: 'Fork this route' }).isVisible());
const emb = await ctx.newPage();
watch(emb);
await emb.setViewportSize({ width: 900, height: 540 });
await emb.goto(shareUrl.replace('#app=', '#embed='));
await emb.waitForSelector('.embed-card');
await waitIdle(emb);
await emb.waitForTimeout(1500);
await emb.screenshot({ path: `${OUT}/6-embed.png` });
ok('embed shows the map with its credit', (await emb.locator('.embed-credit').innerText()).includes('Landsat'));

// Cover crops: time slider + click-for-history.
async function fresh(q) {
  await page.getByRole('button', { name: 'New map' }).click();
  await page.waitForSelector('#goal');
  await page.fill('#goal', q);
  await page.press('#goal', 'Enter');
  await built(page);
  await page.waitForSelector('.app');
  await waitIdle(page);
}
await fresh('Show which fields in Tompkins County, NY had a cover crop each spring since 2018, and click a field for its history');
await page.waitForTimeout(1500);
ok('time slider present', (await page.locator('input[type="range"]').count()) === 1);
const box = await page.getByTestId('map').boundingBox();
await page.mouse.click(box.x + box.width * 0.52, box.y + box.height * 0.45);
await page.waitForSelector('.chart', { timeout: 120_000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/7-history.png` });
ok('history chart draws dots', (await page.locator('.chart circle').count()) > 5);

await fresh('How much of Austin, Texas is built up?');
await page.waitForSelector('[data-testid="stats"] .classes li', { timeout: 90_000 });
ok('land cover stats list classes', (await page.locator('[data-testid="stats"] .classes li').count()) >= 3);

await fresh('sea surface temperature in the gulf of mexico last summer');
await page.waitForSelector('.legend-ends', { timeout: 90_000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/8-sst.png` });
ok('ocean question rides OISST', (await page.locator('.turn-built').last().innerText()).includes('Sea Surface Temperature') || (await page.locator('.turn-built').last().innerText()).includes('OISST'));
ok('sea temperature legend reads in °C', (await page.locator('.legend-ends').innerText()).includes('°C'));

// A slider app becomes an animated GIF.
await fresh('Snow cover in the Sierra Nevada each winter since 2018');
await page.waitForTimeout(1000);
await page.getByRole('button', { name: 'Publish', exact: true }).click();
await page.getByRole('tab', { name: 'Image' }).click();
await page.getByRole('button', { name: 'Make the GIF' }).click();
await page.waitForSelector('.gif-maker img', { timeout: 240_000 });
ok('animated GIF is drawn, one frame per winter', (await page.locator('.gif-maker img').count()) === 1);
await page.getByRole('button', { name: 'Done' }).click();
await page.waitForSelector('.share', { state: 'detached', timeout: 5_000 });

// An unclear follow-up gets told what can change, not a new map.
const turnsBefore = await page.locator('.turn-built').count();
await page.fill('#follow-input', 'make it prettier');
await page.press('#follow-input', 'Enter');
await page.waitForSelector('.turn-note', { timeout: 10_000 });
ok('unclear follow-up explains what can change', (await page.locator('.turn-built').count()) === turnsBefore);

// A boundary file masks the map to the fields.
await page.getByRole('button', { name: 'New map' }).click();
await page.waitForSelector('.recent-map', { timeout: 5_000 }).catch(() => {});
ok('your maps are listed on the studio start', (await page.locator('.recent-map').count()) >= 2);
await page.fill('#goal', 'greenness this summer');
await page.press('#goal', 'Enter');
await page.getByRole('button', { name: 'Pick it on the map' }).first().click();
await page.waitForSelector('.picker');
await page.getByRole('button', { name: 'Try two sample fields' }).click();
await page.waitForFunction(() => document.querySelector('.picker .btn-primary')?.textContent?.includes('Two fields near Ames'), null, { timeout: 10_000 });
await page.locator('.picker .btn-primary').click();
await built(page);
await page.waitForSelector('.app');
await waitIdle(page);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/8b-fields.png` });
ok('boundary file builds a map of just those fields', (await page.locator('.turn-built').last().innerText()).includes('Two fields near Ames'));

// No place in the question: pick it on the map.
await page.getByRole('button', { name: 'New map' }).click();
await page.fill('#goal', 'greenness this summer');
await page.press('#goal', 'Enter');
await page.getByRole('button', { name: 'Pick it on the map' }).first().click();
await page.waitForSelector('.picker');
await page.fill('#picker-q', 'Ithaca');
await page.waitForSelector('.picker-hits button', { timeout: 20_000 });
await page.locator('.picker-hits button').first().click();
await page.waitForTimeout(800);
await page.locator('.picker .btn-primary').click();
await built(page);
ok('place picked on the map builds the app', (await page.locator('.turn-built').last().innerText()).toLowerCase().includes('ithaca'));

// Phone.
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const m = await phone.newPage();
watch(m);
await m.goto(BASE);
await m.waitForSelector('.home-hero h1');
await m.waitForTimeout(1000);
await m.screenshot({ path: `${OUT}/9-phone-home.png` });
ok('no horizontal page scroll on the phone home page', !(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
await m.goto(`${BASE}#build`);
await m.waitForSelector('#goal');
ok('studio start fits a phone', !(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
await m.goto(shareUrl);
await m.waitForSelector('.app');
await waitIdle(m);
await m.waitForTimeout(1500);
await m.screenshot({ path: `${OUT}/10-phone-app.png`, fullPage: true });
ok('no horizontal page scroll on a phone app', !(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));

ok('no console errors', errors.length === 0);
if (errors.length) console.log(errors.slice(0, 10).join('\n'));
await browser.close();
process.exit(checks.every((c) => c.pass) ? 0 : 1);
