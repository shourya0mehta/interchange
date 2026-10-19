import { readCogWindow, sampleAt } from './cog';
import { fromLonLat } from './geo';
import { INDICES, bandsFor } from './indices';
import { MAX_REFLECTANCE, RUNTIME_SOURCES, maskIsClear, type Band, type Signal } from './sources';
import { dayKey, searchItems, type StacItem } from './stac';
import type { EvalOptions } from './layers';

export interface SeriesPoint {
  date: string;
  value: number;
  source: string;
}

export interface SeriesResult {
  points: SeriesPoint[];
  /** Scenes looked at, including cloudy ones that were dropped. */
  looked: number;
  station: string;
  signal: Signal;
}

/** Runs `fn` over `items` with at most `limit` in flight. */
async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Keeps one item per day so overlapping tiles don't double-count a date. */
function onePerDay(items: StacItem[]): StacItem[] {
  const seen = new Map<string, StacItem>();
  for (const it of items) {
    const k = dayKey(it);
    const prev = seen.get(k);
    if (!prev || (it.cloud ?? 0) < (prev.cloud ?? 0)) seen.set(k, it);
  }
  return [...seen.values()].sort((a, b) => a.datetime.localeCompare(b.datetime));
}

/**
 * The signal's history at one point, read straight from each scene's COG at a coarse
 * overview (about one tile per band per scene). Cloudy observations are dropped.
 */
export async function pointSeries(
  station: string,
  signal: Signal,
  lonLat: [number, number],
  start: string,
  end: string,
  opts: EvalOptions & { maxScenes?: number } = {},
): Promise<SeriesResult> {
  const src = RUNTIME_SOURCES[station];
  if (!src) throw new Error(`${station} has no live reader yet`);
  const maxScenes = opts.maxScenes ?? 80;
  opts.onProgress?.(`Finding ${src.collection} scenes`);
  // One search per year, so a long range isn't cut off at the first few hundred results.
  const y0 = Number(start.slice(0, 4));
  const y1 = Number(end.slice(0, 4));
  const spans: [string, string][] = [];
  for (let y = y0; y <= y1; y++) spans.push([y === y0 ? start : `${y}-01-01`, y === y1 ? end : `${y}-12-31`]);
  const pages = await Promise.all(
    spans.map(([s0, s1]) =>
      searchItems({
        catalog: src.catalog,
        collection: src.collection,
        point: lonLat,
        start: s0,
        end: s1,
        maxCloud: src.kind === 'scene' && src.maxCloud !== null ? Math.min(src.maxCloud, 50) : undefined,
        sort: 'date',
        limit: 200,
        query: src.kind === 'scene' ? src.query : undefined,
        signal: opts.signal,
      }),
    ),
  );
  const found = pages.flat();
  let items = onePerDay(found);
  if (items.length > maxScenes) {
    // Thin evenly through time instead of truncating the end.
    const step = items.length / maxScenes;
    items = Array.from({ length: maxScenes }, (_, i) => items[Math.floor(i * step)]);
  }
  let done = 0;
  const values = await pool(items, 6, async (item) => {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!item.crs) return NaN;
    const [x, y] = fromLonLat(item.crs)(lonLat[0], lonLat[1]);
    const eps = 1e-6;
    const bounds: [number, number, number, number] = [x - eps, y - eps, x + eps, y + eps];
    let v = NaN;
    if (src.kind === 'scene') {
      const bands = bandsFor(signal) as Band[];
      const keys = bands.map((b) => src.bands[b]);
      if (keys.some((k) => !k || !item.assets[k!])) return NaN;
      const reads = await Promise.all([
        ...keys.map((k) => readCogWindow(item.assets[k!].href, bounds, src.readRes)),
        src.mask && item.assets[src.mask.asset]
          ? readCogWindow(item.assets[src.mask.asset].href, bounds, 0)
          : Promise.resolve(null),
      ]);
      const maskWin = reads[keys.length];
      if (src.mask && (!maskWin || !maskIsClear(src.mask.type, sampleAt(maskWin, x, y)))) {
        v = NaN;
      } else {
        const vals: Partial<Record<Band, number>> = {};
        bands.forEach((b, i) => {
          const w = reads[i];
          const raw = w ? sampleAt(w, x, y) : NaN;
          vals[b] = raw * item.assets[keys[i]!].scale + (src.ignoreOffset ? 0 : item.assets[keys[i]!].offset);
        });
        const saturated = signal !== 'radar-vv' && Object.values(vals).some((r) => r! > MAX_REFLECTANCE);
        v = saturated ? NaN : (INDICES[signal]?.compute(vals) ?? NaN);
      }
    } else {
      const asset = item.assets[src.asset];
      if (!asset) return NaN;
      const [w, qa] = await Promise.all([
        readCogWindow(asset.href, bounds, src.nativeRes),
        src.qa && item.assets[src.qa.asset]
          ? readCogWindow(item.assets[src.qa.asset].href, bounds, src.nativeRes)
          : Promise.resolve(null),
      ]);
      const raw = w ? sampleAt(w, x, y) : NaN;
      const ok = !src.qa || !qa || src.qa.valid(sampleAt(qa, x, y));
      v = ok && raw !== src.nodata ? raw * src.scale + src.offset : NaN;
    }
    done++;
    if (done % 5 === 0) opts.onProgress?.(`Read ${done} of ${items.length} scenes`);
    return v;
  });
  const points: SeriesPoint[] = [];
  items.forEach((it, i) => {
    if (!Number.isNaN(values[i])) points.push({ date: dayKey(it), value: values[i], source: it.id });
  });
  return { points, looked: items.length, station, signal };
}
