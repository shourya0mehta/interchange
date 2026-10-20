/**
 * The landing globe's data: a half-degree grid of the planet built from real data by
 * scripts/build-globe-data.mjs (ESA CCI land cover 2020, NOAA OISST sea surface temperature and
 * sea ice for one recent day). Three bytes per cell, rows north to south from 90°N.
 */
export const GROUPS = [
  'ocean',
  'cropland',
  'forest',
  'shrub and grass',
  'sparse and tundra',
  'wetland',
  'built-up',
  'bare ground and desert',
  'lake or river',
  'snow and ice',
] as const;
export type Group = (typeof GROUPS)[number];

export interface Earth {
  width: number;
  height: number;
  cells: Uint8Array;
  sstDate: string;
}

export interface Sample {
  group: number;
  /** 0 to 15: how much of the cell is built up. */
  urban: number;
  /** Sea surface temperature in °C, or null on land. */
  sst: number | null;
  /** Sea ice concentration 0 to 100, or null. */
  ice: number | null;
}

let loading: Promise<Earth> | null = null;

export function loadEarth(base = import.meta.env.BASE_URL): Promise<Earth> {
  if (loading) return loading;
  loading = (async () => {
    const [bin, meta] = await Promise.all([
      fetch(`${base}globe/earth-05.bin.gz`).then((r) => {
        if (!r.ok) throw new Error(`globe data ${r.status}`);
        return r.arrayBuffer();
      }),
      fetch(`${base}globe/earth-05.json`).then((r) => r.json() as Promise<{ width: number; height: number; sstDate: string }>),
    ]);
    let bytes = new Uint8Array(bin);
    // Some servers decode .gz on the way; only inflate when the gzip magic is still there.
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    return { width: meta.width, height: meta.height, cells: bytes, sstDate: meta.sstDate };
  })();
  loading.catch(() => (loading = null));
  return loading;
}

export function sample(earth: Earth, lat: number, lon: number): Sample {
  const row = Math.min(earth.height - 1, Math.max(0, Math.floor(((90 - lat) / 180) * earth.height)));
  let col = Math.floor(((lon + 180) / 360) * earth.width) % earth.width;
  if (col < 0) col += earth.width;
  const i = (row * earth.width + col) * 3;
  const a = earth.cells[i];
  const s = earth.cells[i + 1];
  const ice = earth.cells[i + 2];
  return { group: a & 15, urban: a >> 4, sst: s === 255 ? null : s / 6 - 5, ice: ice === 255 ? null : ice };
}

/** "Tree cover", "Open ocean, 27.4 °C", "Sea ice, 80% cover" — what the cursor is over. */
export function describe(s: Sample): string {
  if (s.group === 0) {
    if (s.ice !== null && s.ice >= 15) return `Sea ice, ${s.ice}% cover`;
    return s.sst !== null ? `Ocean, ${s.sst.toFixed(1)} °C at the surface` : 'Ocean';
  }
  const name = GROUPS[s.group];
  const label = name[0].toUpperCase() + name.slice(1);
  return s.urban >= 4 && s.group !== 6 ? `${label}, with towns and cities` : label;
}

export function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}°${ns} ${Math.abs(lon).toFixed(1)}°${ew}`;
}
