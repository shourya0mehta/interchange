import { describe, expect, it } from 'vitest';
import { fromArrayBuffer } from 'geotiff';
import { bboxAreaKm2, capBbox, fromLonLat, gridPixelLonLat, gridSourceCoords, makeGrid, type Bbox } from '../src/runtime/geo';
import { RAMPS, rampToRgba } from '../src/runtime/colormap';
import { layerGeoTiff } from '../src/runtime/export';
import { regionStats } from '../src/runtime/render';
import { groupByDay, type LayerResult } from '../src/runtime/layers';
import { maskIsClear } from '../src/runtime/sources';
import { parseItem } from '../src/runtime/stac';

const TOMPKINS: Bbox = [-76.7, 42.26, -76.24, 42.63];

describe('geo', () => {
  it('interpolated source coordinates stay within a meter of exact UTM', () => {
    const grid = makeGrid(TOMPKINS, 400);
    const coords = gridSourceCoords(grid, { epsg: 32618 });
    const exact = fromLonLat({ epsg: 32618 });
    let worst = 0;
    for (let j = 0; j < grid.height; j += 37) {
      for (let i = 0; i < grid.width; i += 41) {
        const [x, y] = exact(...gridPixelLonLat(grid, i, j));
        const k = (j * grid.width + i) * 2;
        worst = Math.max(worst, Math.hypot(coords[k] - x, coords[k + 1] - y));
      }
    }
    expect(worst).toBeLessThan(1);
  });

  it('caps large areas around their center', () => {
    const iowa: Bbox = [-96.64, 40.38, -90.14, 43.5];
    const { bbox, capped } = capBbox(iowa, 3000);
    expect(capped).toBe(true);
    expect(bboxAreaKm2(bbox)).toBeCloseTo(3000, -1);
    expect((bbox[0] + bbox[2]) / 2).toBeCloseTo((iowa[0] + iowa[2]) / 2, 6);
  });
});

describe('pixels and summaries', () => {
  it('draws NaN as transparent and clamps out-of-range values', () => {
    const rgba = rampToRgba(new Float32Array([NaN, -5, 5]), RAMPS.ndvi);
    expect(rgba[3]).toBe(0);
    expect(rgba[7]).toBe(255);
    expect(Array.from(rgba.slice(4, 7))).toEqual([0x8a, 0x5a, 0x2b]);
    expect(Array.from(rgba.slice(8, 11))).toEqual([0x14, 0x53, 0x2d]);
  });

  it('class areas add up to the area of the map', () => {
    const grid = makeGrid(TOMPKINS, 200);
    const values = new Float32Array(grid.width * grid.height).map((_, k) => (k % 3 === 0 ? 2 : 5));
    const r = { grid, values, kind: 'categorical', recipe: { station: 'io-lulc', signal: 'landcover' } } as unknown as LayerResult;
    const s = regionStats(r);
    expect(s?.kind).toBe('classes');
    if (s?.kind !== 'classes') return;
    const total = s.rows.reduce((a, b) => a + b.km2, 0);
    expect(total / bboxAreaKm2(TOMPKINS)).toBeCloseTo(1, 1);
    expect(s.rows[0].entry.label).toBe('Crops');
  });

  it('writes a georeferenced GeoTIFF that reads back', async () => {
    const grid = makeGrid(TOMPKINS, 64);
    const values = new Float32Array(grid.width * grid.height).map((_, k) => k / 100);
    const tiff = await fromArrayBuffer(layerGeoTiff(values, grid));
    const img = await tiff.getImage();
    expect(img.getWidth()).toBe(grid.width);
    expect(img.getGeoKeys()!.ProjectedCSTypeGeoKey).toBe(3857);
    const [x0, y1] = img.getOrigin();
    expect(x0).toBeCloseTo(grid.merc[0], 3);
    expect(y1).toBeCloseTo(grid.merc[3], 3);
    const [band] = (await img.readRasters()) as unknown as Float32Array[];
    expect(band[123]).toBeCloseTo(1.23, 5);
  });
});

describe('scene handling', () => {
  it('keeps Sentinel-2 surface classes and drops clouds', () => {
    expect(maskIsClear('scl', 4)).toBe(true);
    expect(maskIsClear('scl', 9)).toBe(false);
    expect(maskIsClear('scl', 3)).toBe(false);
    expect(maskIsClear('landsat-qa', 21824)).toBe(true); // clear land
    expect(maskIsClear('landsat-qa', 22280)).toBe(false); // cloud bit set
  });

  it('merges tiles from one overpass and drops reprocessed duplicates', () => {
    const item = (id: string, tile: string, day: string, cloud: number) =>
      parseItem({ id, collection: 'sentinel-2-l2a', properties: { datetime: `${day}T16:00:00Z`, 'eo:cloud_cover': cloud, 'grid:code': tile, platform: 'sentinel-2b' }, assets: {} });
    const groups = groupByDay([
      item('a_0', 'MGRS-18TUN', '2025-08-02', 5),
      item('a_1', 'MGRS-18TUN', '2025-08-02', 3),
      item('b', 'MGRS-18TUM', '2025-08-02', 8),
      item('c', 'MGRS-18TUN', '2025-08-07', 1),
    ]);
    expect(groups.map((g) => g.map((i) => i.id).sort())).toEqual([['a_1', 'b'], ['c']]);
  });
});
