import { bboxAreaKm2, bboxCenter, type Bbox } from '../runtime/geo';
import { getFetcher } from '../runtime/stac';
import { regionByName } from './gazetteer';
import type { Geocoder, Place } from './plan';

/** A point or a building is too small to map; give it a couple of kilometres around. */
function atLeast(b: Bbox, km = 3): Bbox {
  if (bboxAreaKm2(b) >= km * km) return b;
  const [x, y] = bboxCenter(b);
  const dy = km / 2 / 111.32;
  const dx = dy / Math.max(0.2, Math.cos((y * Math.PI) / 180));
  return [x - dx, y - dy, x + dx, y + dy];
}

/** "42.44000, -76.50000" -> a ~10 km box around the point. */
function coordsPlace(query: string): Place | null {
  const m = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(query.trim());
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return { name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, bbox: atLeast([lon, lat, lon, lat], 10) };
}

const cache = new Map<string, Promise<Place | null>>();

/** Thrown when the lookup services themselves fail, as opposed to not knowing the place. */
export class LookupDown extends Error {
  constructor() {
    super("Place lookup isn't answering right now");
    this.name = 'LookupDown';
  }
}

/** Remembers whether the last answer from a service was a failure rather than "no such place". */
let lastFailed = { nominatim: false, photon: false };

function once(query: string, signal?: AbortSignal): Promise<Place | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  return getFetcher()(url, { signal, headers: { Accept: 'application/json' } })
    .then((r) => {
      lastFailed.nominatim = !r.ok;
      return r.ok ? r.json() : [];
    })
    .then((rows: { display_name: string; boundingbox: [string, string, string, string] }[]) => {
      const row = rows[0];
      if (!row) return null;
      const [s, n, w, e] = row.boundingbox.map(Number);
      const bbox: Bbox = [w, s, e, n];
      return { name: row.display_name.split(',').slice(0, 2).join(',').trim(), bbox };
    })
    .catch((e) => {
      if ((e as Error).name === 'AbortError') throw e;
      lastFailed.nominatim = true;
      return null;
    });
}

interface PhotonFeature {
  properties: { name?: string; state?: string; country?: string; type?: string; osm_key?: string; osm_value?: string; extent?: [number, number, number, number] };
  geometry: { coordinates: [number, number] };
}

const GOOD_KEYS: Record<string, number> = { place: 3, boundary: 2, natural: 3, water: 3, waterway: 2, leisure: 1, landuse: -4, amenity: -4, shop: -4, office: -4, building: -4, tourism: -3, aeroway: -4, highway: -4, railway: -4, historic: -2, man_made: -3, craft: -4, healthcare: -4 };
const TYPES: Record<string, number> = { country: 6, state: 5, county: 5, city: 5, district: 3, locality: 3, other: 0, street: -3, house: -5 };

/**
 * How sure we are that a Photon hit is the place meant: areas (counties, cities, lakes, parks)
 * whose name matches the phrase score high; a cemetery or an office that merely shares the
 * name ("Fresno County Cemetery #1") scores below zero.
 */
export function photonScore(f: PhotonFeature, query: string): number {
  const p = f.properties;
  const name = (p.name ?? '').toLowerCase();
  const head = query.split(',')[0].trim().toLowerCase();
  // OSM names counties "Fresno", people write "Fresno County".
  const core = head.replace(/\s+(county|parish|borough)\b.*$/, '');
  let score = TYPES[p.type ?? 'other'] ?? 0;
  score += GOOD_KEYS[p.osm_key ?? ''] ?? 0;
  if (p.osm_key === 'leisure' && /park|nature_reserve/.test(p.osm_value ?? '')) score += 1;
  if (p.osm_key === 'boundary' && p.osm_value === 'national_park') score += 1;
  if (name === head || (p.type === 'county' && name === core)) score += 4;
  else if (name.startsWith(head) || head.startsWith(name)) score += 1;
  // "Ithaca NY", "Fresno County, California": the rest of the phrase should match the state or country.
  const tail = query.toLowerCase().replace(head, '');
  const region = `${p.state ?? ''} ${p.country ?? ''}`.toLowerCase();
  if (tail.trim() && region.split(/\s+/).some((w) => w.length > 2 && tail.includes(w))) score += 1;
  return score;
}

function photonPlace(f: PhotonFeature, query: string): Place {
  const p = f.properties;
  const [x, y] = f.geometry.coordinates;
  // Photon extents are [west, north, east, south]; points without one get a ~10 km box.
  const e = p.extent;
  const bbox: Bbox = e ? [e[0], e[3], e[2], e[1]] : [x - 0.06, y - 0.045, x + 0.06, y + 0.045];
  const base = p.type === 'county' && p.name && !/\b(county|parish|borough)\b/i.test(p.name) && /\bcounty\b/i.test(query) ? `${p.name} County` : p.name;
  const name = [base, p.type === 'country' || p.type === 'state' ? null : p.state].filter(Boolean).join(', ') || query;
  return { name, bbox };
}

/** Komoot's Photon, built on OpenStreetMap and made for search-as-you-type. */
function photon(query: string, signal?: AbortSignal, minScore = 3): Promise<Place | null> {
  // Counties hide behind parks and fairgrounds that share their name unless asked for by layer.
  const layer = /\b(county|parish|borough)\b/i.test(query) ? '&layer=county' : '';
  const url = `https://photon.komoot.io/api/?limit=8&q=${encodeURIComponent(query)}${layer}`;
  return getFetcher()(url, { signal })
    .then((r) => {
      lastFailed.photon = !r.ok;
      return r.ok ? r.json() : { features: [] };
    })
    .then((j: { features: PhotonFeature[] }) => {
      const ranked = j.features.map((f) => ({ f, s: photonScore(f, query) })).sort((a, b) => b.s - a.s);
      const best = ranked[0];
      return best && best.s >= minScore ? photonPlace(best.f, query) : null;
    })
    .catch((e) => {
      if ((e as Error).name === 'AbortError') throw e;
      lastFailed.photon = true;
      return null;
    });
}

async function lookup(query: string, signal?: AbortSignal): Promise<Place | null> {
  lastFailed = { nominatim: false, photon: false };
  const first = await once(query, signal);
  if (first) return first;
  const second = await photon(query, signal);
  if (second) return second;
  // Both services failed outright (not "no such place"): say so now rather than after retries.
  if (lastFailed.nominatim && lastFailed.photon) throw new LookupDown();
  // Nominatim asks for at most one request a second; wait before the retry.
  await new Promise((r) => setTimeout(r, 1100));
  const third = await once(query, signal);
  if (third) return third;
  // "Fresno County, California, USA" -> "Fresno County, California"
  const parts = query.split(',');
  return parts.length > 1 ? once(parts.slice(0, -1).join(','), signal) : null;
}

function localPlace(query: string): Place | null {
  const c = coordsPlace(query);
  if (c) return c;
  const r = regionByName(query);
  return r ? { name: r.name, bbox: r.bbox, note: r.note } : null;
}

const previewCache = new Map<string, Promise<Place | null>>();

/**
 * While someone types: coordinates and named regions locally, everything else through Photon,
 * accepted only when the hit is clearly the place. Nominatim's policy rules out lookups as
 * you type, so it is only asked when a plan is made.
 */
export const previewGeocoder: Geocoder = (query, signal) => {
  const fixed = localPlace(query);
  if (fixed) return Promise.resolve(fixed);
  const key = query.trim().toLowerCase();
  let p = previewCache.get(key);
  if (!p) {
    p = photon(query, signal, 5).then((v) => (v ? { ...v, bbox: atLeast(v.bbox) } : v));
    p.then((v) => v === null && previewCache.delete(key));
    previewCache.set(key, p);
  }
  return p;
};

/**
 * OpenStreetMap Nominatim lookup: free, no key, one request per plan. Hits are cached for the
 * session; misses are retried next time.
 */
export const nominatim: Geocoder = (query, signal) => {
  const fixed = localPlace(query);
  if (fixed) return Promise.resolve(fixed);
  const key = query.trim().toLowerCase();
  let p = cache.get(key);
  if (!p) {
    p = lookup(query, signal).then((v) => (v ? { ...v, bbox: atLeast(v.bbox) } : v));
    p.then(
      (v) => v === null && cache.delete(key),
      () => cache.delete(key),
    );
    cache.set(key, p);
  }
  return p;
};

/** Tries each place phrase in turn and returns the first that's found, with the phrase used. */
export async function geocodeFirst(geocoder: Geocoder, phrases: string[], signal?: AbortSignal): Promise<{ place: Place; phrase: string } | null> {
  for (const phrase of phrases.slice(0, 4)) {
    const place = await geocoder(phrase, signal);
    if (place) return { place, phrase };
  }
  return null;
}

/** A geocoder backed by a fixed table, for tests and the gallery harness. */
export function tableGeocoder(table: Record<string, Bbox>): Geocoder {
  const entries = Object.entries(table).map(([k, v]) => [k.toLowerCase(), v] as const);
  return async (query) => {
    const q = query.toLowerCase();
    const hit = entries.find(([k]) => q.includes(k) || k.includes(q));
    return hit ? { name: query, bbox: hit[1] } : null;
  };
}
