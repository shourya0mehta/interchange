import { writeFileSync, mkdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { setUrlSigner } from '../../src/runtime/cog';
import { makeGrid, type Bbox } from '../../src/runtime/geo';
import { evaluateLayer } from '../../src/runtime/layers';
import { pointSeries } from '../../src/runtime/series';
import { signPlanetaryComputer } from '../../src/runtime/stac';
import { RAMPS, rampToRgba, classesToRgba, LANDCOVER_CLASSES, trueColorToRgba } from '../../src/runtime/colormap';
import { encodePng } from '../helpers/png';

const live = process.env.INTEGRATION === '1';
const OUT = process.env.SHOTS_DIR ?? 'shots/spike';
// Tompkins County, NY (Ithaca)
const TOMPKINS: Bbox = [-76.7, 42.26, -76.24, 42.63];

describe.skipIf(!live)('spike: real data in, pixels out', () => {
  setUrlSigner(signPlanetaryComputer);
  mkdirSync(OUT, { recursive: true });

  it('Sentinel-2 NDVI for a county, two summers', async () => {
    const grid = makeGrid(TOMPKINS, 768);
    for (const [label, start, end] of [['Summer 2019', '2019-06-15', '2019-08-31'], ['Summer 2025', '2025-06-15', '2025-08-31']] as const) {
      const t0 = performance.now();
      const r = await evaluateLayer({ station: 'sentinel-2', signal: 'ndvi' }, grid, { label, start, end }, { onProgress: (m) => console.log('  ', m) });
      const ms = performance.now() - t0;
      console.log(label, 'coverage', r.coverage.toFixed(3), 'scenes', r.scenes.map((s) => s.date).join(','), `${ms.toFixed(0)} ms`);
      expect(r.coverage).toBeGreaterThan(0.9);
      writeFileSync(`${OUT}/s2-ndvi-${start.slice(0, 4)}.png`, encodePng(rampToRgba(r.values, RAMPS.ndvi), grid.width, grid.height));
    }
  }, 240_000);

  it('Sentinel-2 true color', async () => {
    const grid = makeGrid(TOMPKINS, 768);
    const r = await evaluateLayer({ station: 'sentinel-2', signal: 'true-color' }, grid, { label: 'Aug 2025', start: '2025-07-15', end: '2025-08-31' });
    expect(r.coverage).toBeGreaterThan(0.9);
    writeFileSync(`${OUT}/s2-rgb.png`, encodePng(trueColorToRgba(...r.rgb!), grid.width, grid.height));
  }, 240_000);

  it('Landsat NDVI from Planetary Computer (signed)', async () => {
    const grid = makeGrid(TOMPKINS, 512);
    const r = await evaluateLayer({ station: 'landsat', signal: 'ndvi' }, grid, { label: 'Summer 2010', start: '2010-06-01', end: '2010-08-31' }, { onProgress: (m) => console.log('  ', m) });
    console.log('landsat coverage', r.coverage.toFixed(3), r.scenes.map((s) => s.id).join(','));
    expect(r.coverage).toBeGreaterThan(0.7);
    writeFileSync(`${OUT}/landsat-ndvi-2010.png`, encodePng(rampToRgba(r.values, RAMPS.ndvi), grid.width, grid.height));
  }, 240_000);

  it('Land cover, elevation, MODIS NDVI', async () => {
    const grid = makeGrid(TOMPKINS, 512);
    const lc = await evaluateLayer({ station: 'io-lulc', signal: 'landcover' }, grid, { label: '2023', start: '2023-01-01', end: '2023-12-31' });
    expect(lc.coverage).toBeGreaterThan(0.95);
    writeFileSync(`${OUT}/io-lulc.png`, encodePng(classesToRgba(lc.values, LANDCOVER_CLASSES['io-lulc']), grid.width, grid.height));
    const dem = await evaluateLayer({ station: 'cop-dem', signal: 'elevation' }, grid, { label: 'DEM', start: '2021-01-01', end: '2021-12-31' });
    console.log('dem domain', dem.domain);
    expect(dem.coverage).toBeGreaterThan(0.95);
    writeFileSync(`${OUT}/dem.png`, encodePng(rampToRgba(dem.values, { ...RAMPS.elevation, domain: dem.domain! }), grid.width, grid.height));
    const modis = await evaluateLayer({ station: 'modis-vi', signal: 'ndvi' }, grid, { label: 'Jul 2024', start: '2024-07-01', end: '2024-07-31' });
    console.log('modis coverage', modis.coverage.toFixed(3), modis.scenes.length);
    expect(modis.coverage).toBeGreaterThan(0.9);
    writeFileSync(`${OUT}/modis-ndvi.png`, encodePng(rampToRgba(modis.values, RAMPS.ndvi), grid.width, grid.height));
  }, 240_000);

  it('point time series at a farm field (Sentinel-2 NDVI, 2024)', async () => {
    const t0 = performance.now();
    const s = await pointSeries('sentinel-2', 'ndvi', [-76.4651, 42.4747], '2024-01-01', '2024-12-31');
    console.log('series', s.points.length, 'of', s.looked, `${(performance.now() - t0).toFixed(0)} ms`);
    console.log(s.points.map((p) => `${p.date}:${p.value.toFixed(2)}`).join(' '));
    expect(s.points.length).toBeGreaterThan(10);
    const summer = s.points.filter((p) => p.date >= '2024-06-15' && p.date <= '2024-08-15').map((p) => p.value);
    const winter = s.points.filter((p) => p.date <= '2024-03-01').map((p) => p.value);
    expect(Math.max(...summer)).toBeGreaterThan(Math.max(...winter, -1));
  }, 240_000);
});
