// Re-draws the newsroom job's picture on the home page: the Harvey app as a reader sees it embedded.
// Usage: node scripts/make-job-shots.mjs  (with the built site served on :4173)
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(BASE);
const href = await p.getByRole('link', { name: 'Open this app' }).first().getAttribute('href');
const e = await b.newPage({ viewport: { width: 960, height: 560 } });
await e.goto(new URL(href.replace('#app=', '#embed='), BASE).href);
await e.waitForSelector('text=/likely new water/', { timeout: 150_000 });
await e.waitForFunction(() => !document.querySelector('.loading[role="status"]'), null, { timeout: 150_000 });
await e.waitForTimeout(2500);
await e.screenshot({ path: 'public/shots/use-newsroom.jpg', type: 'jpeg', quality: 86 });
await b.close();
console.log('wrote public/shots/use-newsroom.jpg');
