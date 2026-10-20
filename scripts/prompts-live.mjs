// Live prompt test: types real questions into the built site, plans, builds the app and checks
// that the map actually draws data, several times each. Uses the real geocoders and catalogs,
// so it paces itself (Nominatim asks for at most one request a second).
//
//   npm run build && npx vite preview --port 4173 &
//   node scripts/prompts-live.mjs            # REPEAT=2 by default
//   BASE_URL=https://shourya0mehta.github.io/interchange/ node scripts/prompts-live.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const OUT = process.env.SHOTS_DIR ?? 'shots/live';
const REPEAT = Number(process.env.REPEAT ?? 2);
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
mkdirSync(OUT, { recursive: true });

/** Each prompt: the dataset its leading route should ride, and whether to click for history. */
const PROMPTS = [
  // Sentinel-2
  { q: 'Compare greenness of fields in Fresno County, California in summer 2019 vs summer 2025', via: 'Sentinel-2' },
  { q: 'ndvi near ithaca ny 2024', via: 'Sentinel-2' },
  { q: 'Burn severity in Paradise, California before and after November 2018', via: 'Sentinel-2' },
  { q: 'what does the salton sea look like now', via: 'Sentinel-2' },
  { q: 'greenness at 42.44, -76.50 summer 2025', via: 'Sentinel-2', chart: true },
  // Landsat
  { q: 'how has lake powell changed since 2000', via: 'Landsat' },
  { q: 'Greenness in the 1990s around Las Vegas', via: 'Landsat' },
  // Sentinel-1
  { q: 'Map flooding in Houston before and after August 2017', via: 'Sentinel-1' },
  { q: 'flooding from hurricane harvey', via: 'Sentinel-1' },
  // MODIS NDVI
  { q: 'vegetation health in iowa since 2015', via: 'MODIS', chart: true },
  { q: 'greenness across the united states this summer', via: 'MODIS' },
  // Land cover
  { q: 'How much of Austin, Texas is built up?', via: 'land cover' },
  { q: 'land cover of kenya', via: 'CCI' },
  { q: 'deforestation in rondonia brazil since 1995', via: 'CCI' },
  { q: 'what covers the netherlands', via: 'CCI' },
  // Crops
  { q: 'What crops grew around Ames, Iowa in 2021', via: 'Cropland' },
  { q: 'how much of kern county is almonds', via: 'Cropland' },
  // Water and terrain
  { q: 'Lake Mead water each year from 2015 to 2024', via: 'Landsat' },
  { q: 'elevation of mount rainier', via: 'Copernicus DEM' },
  // Ocean
  { q: 'i want sea surface temeprature, 1999-now, atlantic ocean', via: 'OISST', chart: true },
  { q: 'sst in the gulf of mexico last summer', via: 'OISST' },
  { q: 'marine heatwave off the coast of california 2015', via: 'OISST' },
  { q: 'el nino pacific ocean temperature anomaly 2023', via: 'OISST' },
  { q: 'Sea surface temperature of the Mediterranean, 2003 vs 2023', via: 'OISST' },
  // Heat, snow, fire
  { q: 'urban heat island in phoenix summer 2025', via: 'MODIS' },
  { q: 'snow cover in the sierra nevada this winter', via: 'MODIS snow' },
  { q: 'snow in the alps january 2024', via: 'MODIS snow' },
  { q: 'where did fires burn in california in 2020', via: 'Active fire' },
  { q: 'active fires in australia december 2019', via: 'Active fire' },
  // Rain and air temperature (US, 1895 to 2022)
  { q: 'rainfall in iowa 2019 vs 2012', via: 'NClimGrid' },
  { q: 'temperature in ithaca since 1950', via: 'NClimGrid', chart: true },
  { q: 'how much rain fell in kansas each year since 2010', via: 'NClimGrid' },
  // Phrasing and places
  { q: 'NYC heat island', via: 'MODIS' },
  { q: 'snow at 39.1N 120.2W last winter', via: 'Sentinel-2' },
  { q: "Fresno County field greenness: summer '19 vs summer '25", via: 'Sentinel-2' },
  { q: 'water temp of the ocean near cape cod since 2010', via: 'OISST' },
];

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const results = [];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function runOne(p, attempt) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const t0 = Date.now();
  const r = { q: p.q, attempt, via: p.via, ok: false, route: null, place: null, ms: null, note: '' };
  try {
    await page.goto(`${BASE}#build?q=${encodeURIComponent(p.q)}`);
    await page.waitForSelector('.routes .route, .ask-error, .no-place', { timeout: 60_000 });
    if (await page.locator('.ask-error').count()) throw new Error(`plan failed: ${await page.locator('.ask-error').innerText()}`);
    if (await page.locator('.no-place').count()) throw new Error('no place found');
    r.route = (await page.locator('.route[data-selected="true"] .route-title').innerText()).trim();
    r.place = (await page.locator('.pane .lede').innerText()).trim();
    if (p.via && !r.route.toLowerCase().includes(p.via.toLowerCase())) r.note += `rode "${r.route}", expected ${p.via}. `;
    const build = page.getByRole('button', { name: 'Build this app' });
    if (!(await build.count())) throw new Error('route is export-only');
    await build.click();
    await page.waitForSelector('.app', { timeout: 20_000 });
    await page.waitForFunction(() => !document.querySelector('.loading[role="status"] .train-track'), null, { timeout: 180_000 });
    const failed = await page.locator('.loading.error').count();
    if (failed) throw new Error(`layer failed: ${await page.locator('.loading.error').innerText()}`);
    const note = await page.locator('.loading[role="status"]').allInnerTexts();
    if (note.some((n) => /^No .* data|No .* scenes/.test(n))) throw new Error(`no data: ${note.join(' ')}`);
    const drawn = await page.locator('.legend-ramp, .classes li, .swipe-tags').count();
    if (!drawn) throw new Error('nothing drawn: no legend');
    if (p.chart) {
      const box = await page.getByTestId('map').boundingBox();
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await page.waitForSelector('.chart, .app-section .hint:has-text("No clear looks")', { timeout: 180_000 });
      const dots = await page.locator('.chart circle').count();
      r.note += `history chart: ${dots} readings. `;
      if (dots < 3) throw new Error('history chart came back nearly empty');
    }
    r.ms = Date.now() - t0;
    r.ok = true;
    await page.screenshot({ path: `${OUT}/${slug(p.q)}-${attempt}.png` });
  } catch (e) {
    r.ms = Date.now() - t0;
    r.note += String(e.message ?? e).split('\n')[0];
    await page.screenshot({ path: `${OUT}/FAIL-${slug(p.q)}-${attempt}.png` }).catch(() => {});
  }
  if (errors.length) r.note += ` page errors: ${errors.slice(0, 2).join(' | ')}`;
  await page.close();
  return r;
}

for (let attempt = 1; attempt <= REPEAT; attempt++) {
  for (const p of PROMPTS) {
    if (ONLY && !ONLY.test(p.q)) continue;
    const r = await runOne(p, attempt);
    results.push(r);
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  [${attempt}] ${(r.ms / 1000).toFixed(1)}s  ${p.q}  ->  ${r.route ?? '-'}  ${r.note}`);
    await pause(1500);
  }
}

const passed = results.filter((r) => r.ok).length;
const md = [
  `# Live prompt run`,
  '',
  `${passed} of ${results.length} runs drew a map (${PROMPTS.length} prompts, ${REPEAT} rounds) against ${BASE} on ${new Date().toISOString().slice(0, 16)}Z.`,
  '',
  '| Round | Prompt | Route | Seconds | Result |',
  '| --- | --- | --- | --- | --- |',
  ...results.map((r) => `| ${r.attempt} | ${r.q.replace(/\|/g, '/')} | ${r.route ?? ''} | ${(r.ms / 1000).toFixed(1)} | ${r.ok ? 'drew' : 'FAILED'} ${r.note.replace(/\|/g, '/')} |`),
  '',
].join('\n');
writeFileSync(`${OUT}/report.md`, md);
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n${passed}/${results.length} passed. Report: ${OUT}/report.md`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
