import { RUNTIME_SOURCES } from './sources';
import { searchItems } from './stac';
import type { Bbox } from './geo';

const cache = new Map<string, Promise<string | null>>();

/**
 * When a dataset last looked at a place: the newest item over it in the catalog. Only for
 * datasets that keep looking (scenes and repeating composites), not yearly maps.
 */
export function latestLook(station: string, bbox: Bbox): Promise<string | null> {
  const src = RUNTIME_SOURCES[station];
  if (!src || !['sentinel-2', 'landsat', 'sentinel-1', 'modis-vi', 'modis-lst', 'modis-snow', 'active-fire', 'oisst'].includes(station)) return Promise.resolve(null);
  const key = `${station}|${bbox.map((v) => v.toFixed(2)).join(',')}`;
  let p = cache.get(key);
  if (!p) {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 200 * 86400_000).toISOString().slice(0, 10);
    const cx = (bbox[0] + bbox[2]) / 2;
    const cy = (bbox[1] + bbox[3]) / 2;
    p = searchItems({ catalog: src.catalog, collection: src.collection, point: [cx, cy], start, end, sort: 'newest', limit: 1, query: 'query' in src ? (src as { query?: Record<string, unknown> }).query : undefined })
      .then((items) => (items[0] ? String(items[0].properties.datetime ?? items[0].properties.start_datetime ?? '').slice(0, 10) || null : null))
      .catch(() => null);
    cache.set(key, p);
  }
  return p;
}

/** Whole days between a date and today, counted in the viewer's own calendar. */
export function daysAgo(iso: string, now = new Date()): number {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86400_000));
}
