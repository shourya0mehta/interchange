import { readCogWindow, sampleAt, type RasterWindow } from './cog';
import {
  type Crs,
  type Grid,
  crsKey,
  gridPixelMeters,
  gridSourceCoords,
  sourceBounds,
} from './geo';
import { INDICES, bandsFor } from './indices';
import {
  MAX_REFLECTANCE,
  RUNTIME_SOURCES,
  maskIsClear,
  type Band,
  type ProductSource,
  type SceneSource,
  type Signal,
} from './sources';
import { dayKey, searchItems, type StacItem } from './stac';

export interface TimeWindow {
  label: string;
  /** YYYY-MM-DD, inclusive. */
  start: string;
  end: string;
}

export interface LayerRecipe {
  station: string;
  signal: Signal;
  /** Scene sources: blend at most this many clear days to fill gaps. */
  maxDays?: number;
}

export interface SceneUsed {
  id: string;
  date: string;
  cloud: number | null;
}

export interface LayerResult {
  grid: Grid;
  recipe: LayerRecipe;
  window: TimeWindow;
  kind: 'continuous' | 'categorical' | 'rgb';
  values: Float32Array;
  rgb?: [Float32Array, Float32Array, Float32Array];
  /** Fraction of grid pixels that received a value. */
  coverage: number;
  scenes: SceneUsed[];
  /** Data-driven domain for signals without a fixed one (elevation). */
  domain?: [number, number];
  note?: string;
}

export interface EvalOptions {
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

function nanArray(n: number): Float32Array {
  const a = new Float32Array(n);
  a.fill(NaN);
  return a;
}

function coverageOf(values: Float32Array): number {
  let n = 0;
  for (let k = 0; k < values.length; k++) if (!Number.isNaN(values[k])) n++;
  return values.length ? n / values.length : 0;
}

class CoordCache {
  private cache = new Map<string, Float64Array>();
  constructor(private grid: Grid) {}
  get(crs: Crs): Float64Array {
    const key = crsKey(crs);
    let c = this.cache.get(key);
    if (!c) {
      c = gridSourceCoords(this.grid, crs);
      this.cache.set(key, c);
    }
    return c;
  }
}

const coordCaches = new WeakMap<Grid, CoordCache>();
function coordsFor(grid: Grid, crs: Crs): Float64Array {
  let cc = coordCaches.get(grid);
  if (!cc) {
    cc = new CoordCache(grid);
    coordCaches.set(grid, cc);
  }
  return cc.get(crs);
}

/** Read resolution in source units: no sharper than the grid shows, no sharper than allowed. */
function readResFor(grid: Grid, crs: Crs, minRes: number): number {
  const meters = Math.max(minRes, gridPixelMeters(grid) * 0.9);
  if ('epsg' in crs && crs.epsg === 4326) return meters / 111_320;
  return meters;
}

/** Groups items from the same overpass, keeping one item per tile (reprocessed duplicates exist). */
export function groupByDay(items: StacItem[]): StacItem[][] {
  const groups = new Map<string, Map<string, StacItem>>();
  for (const it of items) {
    const k = `${dayKey(it)}|${it.platform ?? ''}`;
    const p = it.properties;
    const tile = String(
      p['grid:code'] ?? (p['landsat:wrs_path'] ? `${p['landsat:wrs_path']}-${p['landsat:wrs_row']}` : it.id),
    );
    let g = groups.get(k);
    if (!g) groups.set(k, (g = new Map()));
    const prev = g.get(tile);
    if (!prev || (it.cloud ?? 0) < (prev.cloud ?? 0)) g.set(tile, it);
  }
  return [...groups.values()].map((g) => [...g.values()]);
}

function meanCloud(g: StacItem[]): number {
  const cs = g.map((i) => i.cloud).filter((c): c is number => c !== null);
  return cs.length ? cs.reduce((a, b) => a + b, 0) / cs.length : 0;
}

async function evaluateScene(
  src: SceneSource,
  recipe: LayerRecipe,
  grid: Grid,
  window: TimeWindow,
  opts: EvalOptions,
): Promise<LayerResult> {
  const n = grid.width * grid.height;
  const isRgb = recipe.signal === 'true-color';
  const bands = bandsFor(recipe.signal);
  const index = INDICES[recipe.signal];
  const out = nanArray(n);
  const rgb: [Float32Array, Float32Array, Float32Array] | undefined = isRgb
    ? [nanArray(n), nanArray(n), nanArray(n)]
    : undefined;
  const target = isRgb ? rgb![0] : out;

  opts.onProgress?.(`Searching ${src.collection}`);
  const items = await searchItems({
    catalog: src.catalog,
    collection: src.collection,
    bbox: grid.bbox,
    start: window.start,
    end: window.end,
    maxCloud: src.maxCloud ?? undefined,
    sort: src.maxCloud === null ? 'date' : 'cloud',
    limit: 60,
    query: src.query,
    signal: opts.signal,
  });
  let groups = groupByDay(items);
  if (src.maxCloud === null) groups = groups.reverse();
  else groups.sort((a, b) => meanCloud(a) - meanCloud(b));

  const used: SceneUsed[] = [];
  const maxDays = recipe.maxDays ?? 3;
  for (const group of groups.slice(0, maxDays)) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    opts.onProgress?.(`Reading ${dayKey(group[0])} (${group.length} tile${group.length > 1 ? 's' : ''})`);
    let usedThisDay = false;
    for (const item of group) {
      if (!item.crs) continue;
      const coords = coordsFor(grid, item.crs);
      const res = readResFor(grid, item.crs, src.readRes);
      const bounds = sourceBounds(coords, res * 2);
      const keys = bands.map((b) => src.bands[b]).filter((k): k is string => !!k && !!item.assets[k]);
      if (keys.length !== bands.length) continue;
      const reads = await Promise.all([
        ...keys.map((k) => readCogWindow(item.assets[k].href, bounds, res)),
        // Bit-packed and class masks are read at full resolution: averaged overviews scramble them.
        src.mask && item.assets[src.mask.asset]
          ? readCogWindow(item.assets[src.mask.asset].href, bounds, 0)
          : Promise.resolve(null),
      ]);
      const bandWins = reads.slice(0, keys.length) as (RasterWindow | null)[];
      const maskWin = reads[keys.length] as RasterWindow | null;
      if (bandWins.some((w) => w === null)) continue;
      const scales = keys.map((k) => item.assets[k].scale);
      const offsets = keys.map((k) => (src.ignoreOffset ? 0 : item.assets[k].offset));
      const vals: Partial<Record<Band, number>> = {};
      const optical = recipe.signal !== 'radar-vv';
      let filled = 0;
      for (let p = 0; p < n; p++) {
        if (!Number.isNaN(target[p])) continue;
        const x = coords[p * 2];
        const y = coords[p * 2 + 1];
        if (src.mask) {
          if (!maskWin) continue;
          if (!maskIsClear(src.mask.type, sampleAt(maskWin, x, y))) continue;
        }
        let ok = true;
        for (let b = 0; b < bands.length; b++) {
          const raw = sampleAt(bandWins[b]!, x, y);
          if (Number.isNaN(raw)) {
            ok = false;
            break;
          }
          const v = raw * scales[b] + offsets[b];
          if (optical && v > MAX_REFLECTANCE) {
            ok = false;
            break;
          }
          vals[bands[b]] = v;
        }
        if (!ok) continue;
        if (isRgb) {
          rgb![0][p] = vals.red!;
          rgb![1][p] = vals.green!;
          rgb![2][p] = vals.blue!;
          filled++;
        } else {
          const v = index!.compute(vals);
          if (!Number.isNaN(v)) {
            out[p] = v;
            filled++;
          }
        }
      }
      if (filled > 0) usedThisDay = true;
    }
    if (usedThisDay) used.push({ id: group[0].id, date: dayKey(group[0]), cloud: group[0].cloud });
    if (coverageOf(target) >= 0.985) break;
  }

  const coverage = coverageOf(target);
  return {
    grid,
    recipe,
    window,
    kind: isRgb ? 'rgb' : 'continuous',
    values: isRgb ? rgb![0] : out,
    rgb,
    coverage,
    scenes: used,
    note:
      items.length === 0
        ? `No ${src.collection} scenes in ${window.label}`
        : coverage < 0.5
          ? `Only ${Math.round(coverage * 100)}% of the area was clear in ${window.label}`
          : undefined,
  };
}

function percentile(values: Float32Array, q: number): number {
  const v: number[] = [];
  const stride = Math.max(1, Math.floor(values.length / 20000));
  for (let k = 0; k < values.length; k += stride) if (!Number.isNaN(values[k])) v.push(values[k]);
  if (!v.length) return NaN;
  v.sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
}

function productRange(src: ProductSource, window: TimeWindow): { start: string; end: string } {
  if (src.temporal === 'static') return { start: '1900-01-01', end: '2100-12-31' };
  if (src.temporal === 'annual') {
    const [y0, y1] = src.years ?? [1900, 2100];
    const y = Math.min(y1, Math.max(y0, Number(window.end.slice(0, 4))));
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  return { start: window.start, end: window.end };
}

async function evaluateProduct(
  src: ProductSource,
  recipe: LayerRecipe,
  grid: Grid,
  window: TimeWindow,
  opts: EvalOptions,
): Promise<LayerResult> {
  const n = grid.width * grid.height;
  const range = productRange(src, window);
  opts.onProgress?.(`Searching ${src.collection}`);
  let items = await searchItems({
    catalog: src.catalog,
    collection: src.collection,
    bbox: grid.bbox,
    start: range.start,
    end: range.end,
    sort: 'date',
    limit: 40,
    signal: opts.signal,
  });
  if (src.temporal === 'composite') items = items.slice(-24);
  const categorical = src.signal === 'landcover';
  const sum = new Float64Array(n);
  const count = new Uint16Array(n);
  const out = nanArray(n);
  const used: SceneUsed[] = [];
  for (const item of items) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const asset = item.assets[src.asset];
    if (!asset || !item.crs) continue;
    const coords = coordsFor(grid, item.crs);
    const res = readResFor(grid, item.crs, src.nativeRes);
    const bounds = sourceBounds(coords, res * 2);
    opts.onProgress?.(`Reading ${item.id}`);
    const [win, qa] = await Promise.all([
      readCogWindow(asset.href, bounds, res),
      src.qa && item.assets[src.qa.asset]
        ? readCogWindow(item.assets[src.qa.asset].href, bounds, res)
        : Promise.resolve(null),
    ]);
    if (!win) continue;
    let filled = 0;
    for (let p = 0; p < n; p++) {
      const x = coords[p * 2];
      const y = coords[p * 2 + 1];
      const raw = sampleAt(win, x, y);
      if (Number.isNaN(raw) || (src.nodata !== null && raw === src.nodata)) continue;
      if (src.qa && qa && !src.qa.valid(sampleAt(qa, x, y))) continue;
      if (src.temporal === 'composite') {
        sum[p] += raw * src.scale + src.offset;
        count[p]++;
        filled++;
      } else if (Number.isNaN(out[p])) {
        out[p] = categorical ? raw : raw * src.scale + src.offset;
        filled++;
      }
    }
    if (filled) used.push({ id: item.id, date: dayKey(item), cloud: item.cloud });
  }
  if (src.temporal === 'composite') {
    for (let p = 0; p < n; p++) if (count[p]) out[p] = sum[p] / count[p];
  }
  const coverage = coverageOf(out);
  const result: LayerResult = {
    grid,
    recipe,
    window,
    kind: categorical ? 'categorical' : 'continuous',
    values: out,
    coverage,
    scenes: used,
    note: used.length === 0 ? `No ${src.collection} data for ${window.label}` : undefined,
  };
  if (src.signal === 'elevation') {
    const lo = percentile(out, 0.02);
    const hi = percentile(out, 0.98);
    if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) result.domain = [lo, hi];
  }
  return result;
}

/** Evaluates one layer of a route over a grid and time window, entirely in the browser. */
export async function evaluateLayer(
  recipe: LayerRecipe,
  grid: Grid,
  window: TimeWindow,
  opts: EvalOptions = {},
): Promise<LayerResult> {
  const src = RUNTIME_SOURCES[recipe.station];
  if (!src) throw new Error(`${recipe.station} has no live reader yet; export this route instead`);
  return src.kind === 'scene'
    ? evaluateScene(src, recipe, grid, window, opts)
    : evaluateProduct(src, recipe, grid, window, opts);
}

/** After-minus-before for continuous layers on the same grid. */
export function differenceLayer(before: LayerResult, after: LayerResult): Float32Array {
  const out = nanArray(after.values.length);
  for (let k = 0; k < out.length; k++) {
    const a = after.values[k];
    const b = before.values[k];
    if (!Number.isNaN(a) && !Number.isNaN(b)) out[k] = a - b;
  }
  return out;
}
