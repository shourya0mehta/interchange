// Builds public/globe/earth-05.bin.gz: a half-degree grid of the planet from real data, for the
// landing page globe. Three bytes per cell, rows north to south, columns west to east:
//   0: land cover group (low 4 bits; ESA CCI 2020, majority in the cell) | urban share (high 4 bits, 0-15)
//   1: sea surface temperature code, (°C + 5) * 6 rounded, 255 = none (NOAA OISST, latest day)
//   2: sea ice concentration in percent, 255 = none
// Groups: 0 ocean, 1 cropland, 2 forest, 3 shrub and grass, 4 sparse and tundra, 5 wetland,
//         6 urban, 7 bare and desert, 8 inland water, 9 snow and ice.
//   node scripts/build-globe-data.mjs
import { fromUrl } from 'geotiff';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const PC = 'https://planetarycomputer.microsoft.com/api';
const W = 720;
const H = 360;
const tokens = {};
async function sign(_collection, href) {
  const m = /^https:\/\/([a-z0-9]+)\.blob\.core\.windows\.net\/([^/?]+)\//.exec(href);
  const key = `${m[1]}/${m[2]}`;
  for (let attempt = 0; !tokens[key] && attempt < 5; attempt++) {
    const r = await fetch(`${PC}/sas/v1/token/${key}`);
    if (r.ok) tokens[key] = (await r.json()).token;
    else await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
  }
  return `${href}?${tokens[key]}`;
}
async function items(collection, query) {
  const r = await fetch(`${PC}/stac/v1/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ collections: [collection], limit: 100, ...query }) });
  return (await r.json()).features;
}
async function readOverview(url, minWidth) {
  const tiff = await fromUrl(url, { allowFullFile: false });
  const n = await tiff.getImageCount();
  let pick = await tiff.getImage(0);
  for (let i = n - 1; i >= 0; i--) {
    const img = await tiff.getImage(i);
    if (img.getWidth() >= minWidth) {
      pick = img;
      break;
    }
  }
  const [data] = await pick.readRasters({ interleave: false });
  return { data, w: pick.getWidth(), h: pick.getHeight() };
}

function group(c) {
  if (c === 0) return 0;
  if (c >= 10 && c <= 30) return 1;
  if (c === 40 || c === 110 || (c >= 120 && c <= 130)) return 3;
  if (c >= 50 && c <= 100) return 2;
  if (c === 140 || (c >= 150 && c <= 153)) return 4;
  if (c >= 160 && c <= 180) return 5;
  if (c === 190) return 6;
  if (c >= 200 && c <= 202) return 7;
  if (c === 210) return 8;
  if (c === 220) return 9;
  return 0;
}

const out = new Uint8Array(W * H * 3);
for (let i = 0; i < W * H; i++) {
  out[i * 3 + 1] = 255;
  out[i * 3 + 2] = 255;
}

// ---- Land cover: 32 tiles of 45 by 45 degrees, read at the overview just above 0.25° ----
const lc = await items('esa-cci-lc', { datetime: '2020-01-01T00:00:00Z/2020-12-31T23:59:59Z' });
console.log(`land cover tiles: ${lc.length}`);
const counts = new Map(); // cell -> Uint16Array(10)
let urbanCount = new Uint16Array(W * H);
let totalCount = new Uint16Array(W * H);
for (const f of lc) {
  const [w0, s0, e0, n0] = f.bbox;
  const url = await sign('esa-cci-lc', f.assets.lccs_class.href);
  const { data, w, h } = await readOverview(url, 180);
  for (let y = 0; y < h; y++) {
    const lat = n0 - ((y + 0.5) / h) * (n0 - s0);
    const row = Math.min(H - 1, Math.floor((90 - lat) / 0.5));
    for (let x = 0; x < w; x++) {
      const lon = w0 + ((x + 0.5) / w) * (e0 - w0);
      const col = Math.min(W - 1, Math.floor((lon + 180) / 0.5));
      const cell = row * W + col;
      const g = group(data[y * w + x]);
      let c = counts.get(cell);
      if (!c) counts.set(cell, (c = new Uint16Array(10)));
      c[g]++;
      totalCount[cell]++;
      if (g === 6) urbanCount[cell]++;
    }
  }
  process.stdout.write('.');
}
console.log('');
for (const [cell, c] of counts) {
  // Ocean wins only when it is the majority; otherwise the most common land group.
  let best = 0;
  let bestN = -1;
  const land = c.reduce((a, b) => a + b, 0) - c[0];
  if (c[0] > land) best = 0;
  else
    for (let g = 1; g < 10; g++)
      if (c[g] > bestN) {
        best = g;
        bestN = c[g];
      }
  const urban = totalCount[cell] ? Math.min(15, Math.round((urbanCount[cell] / totalCount[cell]) * 30)) : 0;
  out[cell * 3] = best | (urban << 4);
}

// ---- Sea surface temperature and ice: the latest OISST day ----
const sst = await items('noaa-cdr-sea-surface-temperature-optimum-interpolation', { sortby: [{ field: 'datetime', direction: 'desc' }], limit: 1 });
const day = sst[0];
console.log(`sea surface temperature: ${day.id}`);
for (const [asset, slot, conv] of [
  ['sst', 1, (v) => (v <= -900 ? 255 : Math.max(0, Math.min(254, Math.round((v * 0.01 + 5) * 6))))],
  ['ice', 2, (v) => (v <= -900 || v < 0 ? 255 : Math.min(100, Math.round(v * 0.01 * 100)))],
]) {
  const { data, w, h } = await readOverview(await sign('noaa-cdr-sea-surface-temperature-optimum-interpolation', day.assets[asset].href), 1440);
  // The Planetary Computer copy of OISST runs -180 to 180; average 2 by 2 into half-degree cells.
  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      let sum = 0;
      let n = 0;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const y = row * 2 + dy;
          const lon = -180 + (col * 2 + dx + 0.5) * 0.25;
          const x = Math.min(w - 1, Math.floor((lon + 180) / 0.25));
          const v = data[y * w + x];
          if (v > -900) {
            sum += v;
            n++;
          }
        }
      const cell = row * W + col;
      out[cell * 3 + slot] = n ? conv(sum / n) : 255;
    }
  }
}

// CCI calls the sea "water bodies" too: wherever OISST has a reading, the cell is ocean.
for (let cell = 0; cell < W * H; cell++) {
  const g = out[cell * 3] & 15;
  if ((g === 8 || g === 0) && (out[cell * 3 + 1] !== 255 || out[cell * 3 + 2] !== 255)) out[cell * 3] = out[cell * 3] & 0xf0;
  else if (g === 0) out[cell * 3] = (out[cell * 3] & 0xf0) | 8;
}

mkdirSync('public/globe', { recursive: true });
writeFileSync('public/globe/earth-05.bin.gz', gzipSync(out, { level: 9 }));
writeFileSync('public/globe/earth-05.json', JSON.stringify({ width: W, height: H, sstDate: day.properties.datetime ?? day.id.slice(-8), landCover: 'ESA CCI 2020' }, null, 2));
console.log('wrote public/globe/earth-05.bin.gz');
