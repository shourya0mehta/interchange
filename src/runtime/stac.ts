import { type Bbox, type Crs, crsFromStac } from './geo';

export type Catalog = 'earth-search' | 'planetary-computer';

export const STAC_ENDPOINTS: Record<Catalog, string> = {
  'earth-search': 'https://earth-search.aws.element84.com/v1',
  'planetary-computer': 'https://planetarycomputer.microsoft.com/api/stac/v1',
};

export interface StacAsset {
  href: string;
  scale: number;
  offset: number;
  nodata: number | null;
}

export interface StacItem {
  id: string;
  collection: string;
  datetime: string;
  cloud: number | null;
  bbox: Bbox;
  crs: Crs | null;
  platform: string | null;
  assets: Record<string, StacAsset>;
  properties: Record<string, unknown>;
}

export interface SearchOptions {
  catalog: Catalog;
  collection: string;
  bbox?: Bbox;
  point?: [number, number];
  start: string;
  end: string;
  maxCloud?: number;
  sort?: 'cloud' | 'date';
  limit?: number;
  /** Extra STAC query-extension filters. */
  query?: Record<string, unknown>;
  signal?: AbortSignal;
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
let fetcher: Fetcher = (u, i) => fetch(u, i);

/** Swapped out in tests. */
export function setFetcher(f: Fetcher): void {
  fetcher = f;
}

export function getFetcher(): Fetcher {
  return fetcher;
}

function parseAsset(a: Record<string, unknown>): StacAsset {
  const bands = (a['raster:bands'] as Record<string, unknown>[] | undefined)?.[0] ?? {};
  const nd = bands.nodata ?? a['nodata'];
  return {
    href: String(a.href),
    scale: typeof bands.scale === 'number' ? bands.scale : 1,
    offset: typeof bands.offset === 'number' ? bands.offset : 0,
    nodata: typeof nd === 'number' ? nd : null,
  };
}

export function parseItem(f: Record<string, unknown>): StacItem {
  const props = (f.properties ?? {}) as Record<string, unknown>;
  const collection = String(f.collection ?? '');
  const assets: Record<string, StacAsset> = {};
  for (const [k, v] of Object.entries((f.assets ?? {}) as Record<string, Record<string, unknown>>)) {
    if (typeof v?.href === 'string' && /^https?:/.test(v.href)) assets[k] = parseAsset(v);
  }
  const cc = props['eo:cloud_cover'];
  return {
    id: String(f.id),
    collection,
    datetime: String(props.datetime ?? props.start_datetime ?? ''),
    cloud: typeof cc === 'number' ? cc : null,
    bbox: (f.bbox as Bbox) ?? [0, 0, 0, 0],
    crs: crsFromStac(props, collection),
    platform: typeof props.platform === 'string' ? props.platform : null,
    assets,
    properties: props,
  };
}

/**
 * Catalogs throttle bursts (Planetary Computer answers 403 or 429 when a history chart fires
 * dozens of searches at once). Waits and tries again, up to three times, honoring Retry-After.
 */
async function withRetry(go: () => Promise<Response>): Promise<Response> {
  let res = await go();
  for (let attempt = 1; attempt <= 3 && [403, 429, 500, 502, 503, 504].includes(res.status); attempt++) {
    const after = Number(res.headers.get('retry-after'));
    const wait = Number.isFinite(after) && after > 0 ? Math.min(after, 15) * 1000 : [0, 1000, 3000, 8000][attempt];
    await new Promise((r) => setTimeout(r, wait + Math.random() * 300));
    res = await go();
  }
  return res;
}

/** STAC item search across pages, newest-first or clearest-first. */
export async function searchItems(o: SearchOptions): Promise<StacItem[]> {
  const limit = o.limit ?? 50;
  const body: Record<string, unknown> = {
    collections: [o.collection],
    datetime: `${o.start}T00:00:00Z/${o.end}T23:59:59Z`,
    limit: Math.min(limit, 100),
  };
  if (o.bbox) body.bbox = o.bbox;
  if (o.point) body.intersects = { type: 'Point', coordinates: o.point };
  const query: Record<string, unknown> = { ...(o.query ?? {}) };
  if (o.maxCloud !== undefined) query['eo:cloud_cover'] = { lte: o.maxCloud };
  if (Object.keys(query).length) body.query = query;
  if (o.sort === 'cloud') body.sortby = [{ field: 'properties.eo:cloud_cover', direction: 'asc' }];
  if (o.sort === 'date') body.sortby = [{ field: 'properties.datetime', direction: 'asc' }];

  const out: StacItem[] = [];
  let url = `${STAC_ENDPOINTS[o.catalog]}/search`;
  let payload: Record<string, unknown> | null = body;
  for (let page = 0; page < 10 && payload && out.length < limit; page++) {
    const res = await withRetry(() =>
      fetcher(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: o.signal,
      }),
    );
    if (!res.ok) throw new Error(`STAC search failed (${res.status}) for ${o.collection}`);
    const json = (await res.json()) as { features: Record<string, unknown>[]; links?: Record<string, unknown>[] };
    for (const f of json.features) out.push(parseItem(f));
    const next = json.links?.find((l) => l.rel === 'next');
    payload = null;
    if (next && typeof next.href === 'string') {
      url = next.href;
      payload = (next.body as Record<string, unknown>) ?? null;
      if (!payload && next.method !== 'POST') {
        // GET-style next link: fall back to re-posting with a token if present.
        const token = new URL(next.href).searchParams.get('token');
        if (token) payload = { ...body, token };
        url = `${STAC_ENDPOINTS[o.catalog]}/search`;
      }
    }
  }
  return out.slice(0, limit);
}

/** Day key used to merge tiles from the same overpass. */
export function dayKey(item: StacItem): string {
  return item.datetime.slice(0, 10);
}

// ---- Planetary Computer signing -------------------------------------------------------

const tokens = new Map<string, Promise<{ token: string; expires: number }>>();

/** Appends a short-lived anonymous SAS token to Planetary Computer blob URLs. */
export async function signPlanetaryComputer(url: string): Promise<string> {
  const m = /^https:\/\/([a-z0-9]+)\.blob\.core\.windows\.net\/([^/?]+)\//.exec(url);
  if (!m || url.includes('?')) return url;
  const key = `${m[1]}/${m[2]}`;
  let p = tokens.get(key);
  const now = Date.now();
  if (p) {
    const t = await p.catch(() => null);
    if (!t || t.expires - now < 5 * 60_000) p = undefined;
  }
  if (!p) {
    p = withRetry(() => fetcher(`https://planetarycomputer.microsoft.com/api/sas/v1/token/${key}`))
      .then((r) => {
        if (!r.ok) throw new Error(`Planetary Computer token failed (${r.status})`);
        return r.json();
      })
      .then((j: { token: string; 'msft:expiry': string }) => ({
        token: j.token,
        expires: Date.parse(j['msft:expiry']) || now + 30 * 60_000,
      }));
    tokens.set(key, p);
  }
  const t = await p;
  return `${url}?${t.token}`;
}
