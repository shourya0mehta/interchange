import type { Bbox } from '../runtime/geo';
import { getFetcher } from '../runtime/stac';
import type { Geocoder, Place } from './plan';

const cache = new Map<string, Promise<Place | null>>();

function once(query: string, signal?: AbortSignal): Promise<Place | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  return getFetcher()(url, { signal, headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : []))
    .then((rows: { display_name: string; boundingbox: [string, string, string, string] }[]) => {
      const row = rows[0];
      if (!row) return null;
      const [s, n, w, e] = row.boundingbox.map(Number);
      const bbox: Bbox = [w, s, e, n];
      return { name: row.display_name.split(',').slice(0, 2).join(',').trim(), bbox };
    })
    .catch(() => null);
}

/** Komoot's Photon, also built on OpenStreetMap: the fallback when Nominatim is busy. */
function photon(query: string, signal?: AbortSignal): Promise<Place | null> {
  const url = `https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(query)}`;
  return getFetcher()(url, { signal })
    .then((r) => (r.ok ? r.json() : { features: [] }))
    .then((j: { features: { properties: { name?: string; state?: string; extent?: [number, number, number, number] }; geometry: { coordinates: [number, number] } }[] }) => {
      const f = j.features[0];
      if (!f) return null;
      const [x, y] = f.geometry.coordinates;
      // Photon extents are [west, north, east, south]; points without one get a ~10 km box.
      const e = f.properties.extent;
      const bbox: Bbox = e ? [e[0], e[3], e[2], e[1]] : [x - 0.06, y - 0.045, x + 0.06, y + 0.045];
      const name = [f.properties.name, f.properties.state].filter(Boolean).join(', ') || query;
      return { name, bbox };
    })
    .catch(() => null);
}

async function lookup(query: string, signal?: AbortSignal): Promise<Place | null> {
  const first = await once(query, signal);
  if (first) return first;
  const second = await photon(query, signal);
  if (second) return second;
  // Nominatim asks for at most one request a second; wait before the retry.
  await new Promise((r) => setTimeout(r, 1100));
  const third = await once(query, signal);
  if (third) return third;
  // "Fresno County, California, USA" -> "Fresno County, California"
  const parts = query.split(',');
  return parts.length > 1 ? once(parts.slice(0, -1).join(','), signal) : null;
}

/**
 * OpenStreetMap Nominatim lookup: free, no key. A person typing goals stays far under its
 * one-request-a-second policy. Hits are cached for the session; misses are retried next time.
 */
export const nominatim: Geocoder = (query, signal) => {
  const key = query.trim().toLowerCase();
  let p = cache.get(key);
  if (!p) {
    p = lookup(query, signal);
    p.then((v) => v === null && cache.delete(key));
    cache.set(key, p);
  }
  return p;
};

/** A geocoder backed by a fixed table, for tests and the gallery harness. */
export function tableGeocoder(table: Record<string, Bbox>): Geocoder {
  const entries = Object.entries(table).map(([k, v]) => [k.toLowerCase(), v] as const);
  return async (query) => {
    const q = query.toLowerCase();
    const hit = entries.find(([k]) => q.includes(k) || k.includes(q));
    return hit ? { name: query, bbox: hit[1] } : null;
  };
}
