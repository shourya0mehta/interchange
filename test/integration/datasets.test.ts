import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { setUrlSigner } from '../../src/runtime/cog';
import { LANDCOVER_CLASSES, RAMPS, classesToRgba, rampToRgba } from '../../src/runtime/colormap';
import { makeGrid, type Bbox } from '../../src/runtime/geo';
import { evaluateLayer, type LayerResult } from '../../src/runtime/layers';
import { regionStats } from '../../src/runtime/render';
import { pointSeries } from '../../src/runtime/series';
import type { Signal } from '../../src/runtime/sources';
import { signPlanetaryComputer } from '../../src/runtime/stac';
import { encodePng } from '../helpers/png';

const live = process.env.INTEGRATION === '1';
const OUT = process.env.SHOTS_DIR ?? 'shots/datasets';

function save(name: string, r: LayerResult) {
  const { grid } = r;
  const rgba =
    r.kind === 'categorical'
      ? classesToRgba(r.values, LANDCOVER_CLASSES[r.recipe.station] ?? [])
      : rampToRgba(r.values, { ...RAMPS[r.recipe.signal as keyof typeof RAMPS], ...(r.domain ? { domain: r.domain } : {}) });
  writeFileSync(`${OUT}/${name}.png`, encodePng(rgba, grid.width, grid.height));
}

function range(r: LayerResult): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of r.values) {
    if (Number.isNaN(v)) continue;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return [lo, hi];
}

interface Case {
  name: string;
  station: string;
  signal: Signal;
  bbox: Bbox;
  window: { label: string; start: string; end: string };
  minCoverage: number;
  /** Plausible value range (median must fall inside). */
  expect?: [number, number];
}

const CASES: Case[] = [
  { name: 'sst-north-atlantic', station: 'oisst', signal: 'sst', bbox: [-82, 0, 0, 66], window: { label: 'Summer 2026', start: '2026-06-15', end: '2026-08-31' }, minCoverage: 0.5, expect: [5, 30] },
  { name: 'sst-1999-gulf', station: 'oisst', signal: 'sst', bbox: [-98, 18, -80.5, 31], window: { label: 'Summer 1999', start: '1999-06-15', end: '1999-08-31' }, minCoverage: 0.4, expect: [26, 32] },
  { name: 'sst-anomaly-pacific', station: 'oisst', signal: 'sst-anomaly', bbox: [-180, -55, -77, 60], window: { label: 'Summer 2026', start: '2026-06-15', end: '2026-08-31' }, minCoverage: 0.6, expect: [-2, 3] },
  { name: 'lst-phoenix', station: 'modis-lst', signal: 'lst', bbox: [-112.4, 33.2, -111.7, 33.75], window: { label: 'Summer 2025', start: '2025-06-15', end: '2025-08-31' }, minCoverage: 0.9, expect: [35, 60] },
  { name: 'snow-sierra', station: 'modis-snow', signal: 'snow-frequency', bbox: [-120.5, 37.5, -118.8, 39.2], window: { label: 'Winter 2023-24', start: '2023-12-01', end: '2024-02-29' }, minCoverage: 0.8, expect: [0, 1] },
  { name: 'fire-california-2020', station: 'active-fire', signal: 'fire-frequency', bbox: [-124, 36, -119, 42], window: { label: 'Aug to Sep 2020', start: '2020-08-15', end: '2020-09-30' }, minCoverage: 0.8 },
  { name: 'precip-iowa-2019', station: 'nclimgrid', signal: 'precip', bbox: [-96.7, 40.3, -90.1, 43.6], window: { label: 'Spring 2019', start: '2019-03-20', end: '2019-05-31' }, minCoverage: 0.9, expect: [150, 450] },
  { name: 'air-temp-texas-1950', station: 'nclimgrid', signal: 'air-temp', bbox: [-106.7, 25.8, -93.5, 36.5], window: { label: 'Summer 1950', start: '1950-06-15', end: '1950-08-31' }, minCoverage: 0.5, expect: [22, 32] },
  { name: 'cdl-story-county', station: 'usda-cdl', signal: 'landcover', bbox: [-93.7, 41.86, -93.23, 42.21], window: { label: '2021', start: '2021-01-01', end: '2021-12-31' }, minCoverage: 0.95 },
  { name: 'cci-rondonia-1995', station: 'esa-cci-lc', signal: 'landcover', bbox: [-66, -13.7, -60, -8], window: { label: '1995', start: '1995-01-01', end: '1995-12-31' }, minCoverage: 0.95 },
];

describe.skipIf(!live)('new datasets read real pixels', () => {
  setUrlSigner(signPlanetaryComputer);
  mkdirSync(OUT, { recursive: true });

  for (const c of CASES) {
    it(c.name, async () => {
      const grid = makeGrid(c.bbox, 512);
      const t0 = performance.now();
      const r = await evaluateLayer({ station: c.station, signal: c.signal }, grid, c.window);
      const ms = Math.round(performance.now() - t0);
      const stats = regionStats(r);
      const [lo, hi] = range(r);
      console.log(
        c.name,
        `coverage ${r.coverage.toFixed(2)}`,
        `range ${lo.toFixed(2)}..${hi.toFixed(2)}`,
        stats?.kind === 'continuous' ? `median ${stats.median.toFixed(2)}` : stats?.kind === 'classes' ? stats.rows.slice(0, 4).map((x) => `${x.entry.label} ${Math.round(x.share * 100)}%`).join(', ') : '',
        `dates ${r.scenes.length}`,
        `${ms} ms`,
      );
      save(c.name, r);
      expect(r.coverage).toBeGreaterThan(c.minCoverage);
      if (c.expect && stats?.kind === 'continuous') {
        expect(stats.median).toBeGreaterThanOrEqual(c.expect[0]);
        expect(stats.median).toBeLessThanOrEqual(c.expect[1]);
      }
      if (stats?.kind === 'classes') expect(stats.rows.length).toBeGreaterThan(1);
    }, 300_000);
  }

  it('SST history at a point, 1999 to now', async () => {
    const s = await pointSeries('oisst', 'sst', [-70, 38], '1999-01-01', '2026-10-01', { maxScenes: 40 });
    console.log('sst series', s.points.length, 'of', s.looked, s.points.slice(0, 3), s.points.slice(-2));
    expect(s.points.length).toBeGreaterThan(25);
    expect(s.points[0].date < '2001-01-01').toBe(true);
  }, 300_000);

  it('Snow history at a point', async () => {
    const s = await pointSeries('modis-snow', 'snow-frequency', [-119.6, 38.4], '2015-01-01', '2024-12-31', { maxScenes: 30 });
    console.log('snow series', s.points.length, 'of', s.looked, s.points.slice(0, 4));
    expect(s.points.length).toBeGreaterThan(15);
  }, 300_000);

  it('Monthly rain history at a point since 1950', async () => {
    const s = await pointSeries('nclimgrid', 'precip', [-93.6, 42.0], '1950-01-01', '2022-09-30', { maxScenes: 40 });
    console.log('rain series', s.points.length, 'of', s.looked, s.points.slice(0, 3));
    expect(s.points.length).toBeGreaterThan(30);
  }, 300_000);
});
