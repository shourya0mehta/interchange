import proj4 from 'proj4';

/** [west, south, east, north] in degrees. */
export type Bbox = [number, number, number, number];

const R = 6378137;
const MAX_LAT = 85.05112878;

export function lonLatToMerc(lon: number, lat: number): [number, number] {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const x = ((lon * Math.PI) / 180) * R;
  const y = Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360)) * R;
  return [x, y];
}

export function mercToLonLat(x: number, y: number): [number, number] {
  const lon = ((x / R) * 180) / Math.PI;
  const lat = ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI;
  return [lon, lat];
}

/** MODIS sinusoidal grid (no EPSG code). */
export const MODIS_SINUSOIDAL = '+proj=sinu +lon_0=0 +x_0=0 +y_0=0 +R=6371007.181 +units=m +no_defs';

/** A coordinate reference system we know how to reach from lon/lat. */
export type Crs = { epsg: number } | { proj4: string };

export function crsKey(crs: Crs): string {
  return 'epsg' in crs ? `EPSG:${crs.epsg}` : crs.proj4;
}

export function proj4Def(crs: Crs): string {
  if (!('epsg' in crs)) return crs.proj4;
  const e = crs.epsg;
  if (e === 4326) return '+proj=longlat +datum=WGS84 +no_defs';
  if (e === 3857) return '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs';
  // NAD83 / Conus Albers, used by the USDA Cropland Data Layer and other US federal maps.
  if (e === 5070) return '+proj=aea +lat_0=23 +lon_0=-96 +lat_1=29.5 +lat_2=45.5 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs';
  if (e >= 32601 && e <= 32660) return `+proj=utm +zone=${e - 32600} +datum=WGS84 +units=m +no_defs`;
  if (e >= 32701 && e <= 32760) return `+proj=utm +zone=${e - 32700} +south +datum=WGS84 +units=m +no_defs`;
  throw new Error(`Unsupported EPSG:${e}`);
}

const converters = new Map<string, (lon: number, lat: number) => [number, number]>();

/** Returns a function that projects lon/lat into the given CRS. */
export function fromLonLat(crs: Crs): (lon: number, lat: number) => [number, number] {
  const key = crsKey(crs);
  let fn = converters.get(key);
  if (!fn) {
    if ('epsg' in crs && crs.epsg === 4326) {
      fn = (lon, lat) => [lon, lat];
    } else {
      const conv = proj4('+proj=longlat +datum=WGS84 +no_defs', proj4Def(crs));
      fn = (lon, lat) => conv.forward([lon, lat]) as [number, number];
    }
    converters.set(key, fn);
  }
  return fn;
}

/** Parses STAC proj fields into a Crs. */
export function crsFromStac(props: Record<string, unknown>, collection?: string): Crs | null {
  const epsg = props['proj:epsg'];
  if (typeof epsg === 'number') return { epsg };
  const code = props['proj:code'];
  if (typeof code === 'string' && code.startsWith('EPSG:')) return { epsg: Number(code.slice(5)) };
  if (collection?.startsWith('modis')) return { proj4: MODIS_SINUSOIDAL };
  const wkt = props['proj:wkt2'];
  if (typeof wkt === 'string' && /sinusoidal/i.test(wkt)) return { proj4: MODIS_SINUSOIDAL };
  return null;
}

/** Area in km² of a lon/lat bbox (spherical approximation, good to ~0.5%). */
export function bboxAreaKm2(b: Bbox): number {
  const r = 6371.0088;
  const toRad = Math.PI / 180;
  return Math.abs((b[2] - b[0]) * toRad * (Math.sin(b[3] * toRad) - Math.sin(b[1] * toRad))) * r * r;
}

export function bboxCenter(b: Bbox): [number, number] {
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}

/** Shrinks a bbox around its center so its area is at most maxKm2. */
export function capBbox(b: Bbox, maxKm2: number): { bbox: Bbox; capped: boolean } {
  const area = bboxAreaKm2(b);
  if (area <= maxKm2) return { bbox: b, capped: false };
  const f = Math.sqrt(maxKm2 / area);
  const [cx, cy] = bboxCenter(b);
  const hw = ((b[2] - b[0]) / 2) * f;
  const hh = ((b[3] - b[1]) / 2) * f;
  return { bbox: [cx - hw, cy - hh, cx + hw, cy + hh], capped: true };
}

/** Output grid, aligned to Web Mercator so it drops straight onto a MapLibre image source. */
export interface Grid {
  bbox: Bbox;
  width: number;
  height: number;
  /** Mercator bounds [x0, y0, x1, y1]. */
  merc: [number, number, number, number];
}

export function makeGrid(bbox: Bbox, maxPx = 1024): Grid {
  const [x0, y0] = lonLatToMerc(bbox[0], bbox[1]);
  const [x1, y1] = lonLatToMerc(bbox[2], bbox[3]);
  const w = x1 - x0;
  const h = y1 - y0;
  const scale = maxPx / Math.max(w, h);
  return {
    bbox,
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    merc: [x0, y0, x1, y1],
  };
}

/** Ground size of one grid pixel in meters at the grid's center latitude. */
export function gridPixelMeters(grid: Grid): number {
  const dx = (grid.merc[2] - grid.merc[0]) / grid.width;
  const lat = (grid.bbox[1] + grid.bbox[3]) / 2;
  return dx * Math.cos((lat * Math.PI) / 180);
}

/** lon/lat of a grid pixel's center. */
export function gridPixelLonLat(grid: Grid, i: number, j: number): [number, number] {
  const dx = (grid.merc[2] - grid.merc[0]) / grid.width;
  const dy = (grid.merc[3] - grid.merc[1]) / grid.height;
  return mercToLonLat(grid.merc[0] + (i + 0.5) * dx, grid.merc[3] - (j + 0.5) * dy);
}

/** Grid pixel (i, j) containing a lon/lat, or null when outside. */
export function lonLatToGridPixel(grid: Grid, lon: number, lat: number): [number, number] | null {
  const [x, y] = lonLatToMerc(lon, lat);
  const i = Math.floor(((x - grid.merc[0]) / (grid.merc[2] - grid.merc[0])) * grid.width);
  const j = Math.floor(((grid.merc[3] - y) / (grid.merc[3] - grid.merc[1])) * grid.height);
  if (i < 0 || j < 0 || i >= grid.width || j >= grid.height) return null;
  return [i, j];
}

/**
 * Source-CRS coordinates for every grid pixel center, interleaved [x0, y0, x1, y1, ...].
 * Projects a sparse control lattice exactly and interpolates bilinearly between it, which is
 * accurate to well under a source pixel for county-sized grids and ~50x cheaper than
 * projecting every pixel.
 */
export function gridSourceCoords(grid: Grid, crs: Crs, step = 16): Float64Array {
  const project = fromLonLat(crs);
  const { width: W, height: H } = grid;
  const cw = Math.ceil(W / step) + 1;
  const ch = Math.ceil(H / step) + 1;
  const ctrl = new Float64Array(cw * ch * 2);
  for (let cj = 0; cj < ch; cj++) {
    for (let ci = 0; ci < cw; ci++) {
      const [lon, lat] = gridPixelLonLat(grid, Math.min(ci * step, W - 1), Math.min(cj * step, H - 1));
      const [x, y] = project(lon, lat);
      const k = (cj * cw + ci) * 2;
      ctrl[k] = x;
      ctrl[k + 1] = y;
    }
  }
  const out = new Float64Array(W * H * 2);
  for (let j = 0; j < H; j++) {
    const cj = Math.min(Math.floor(j / step), ch - 2);
    const jy0 = cj * step;
    const jy1 = Math.min((cj + 1) * step, H - 1);
    const ty = jy1 === jy0 ? 0 : (j - jy0) / (jy1 - jy0);
    for (let i = 0; i < W; i++) {
      const ci = Math.min(Math.floor(i / step), cw - 2);
      const ix0 = ci * step;
      const ix1 = Math.min((ci + 1) * step, W - 1);
      const tx = ix1 === ix0 ? 0 : (i - ix0) / (ix1 - ix0);
      const a = (cj * cw + ci) * 2;
      const b = (cj * cw + ci + 1) * 2;
      const c = ((cj + 1) * cw + ci) * 2;
      const d = ((cj + 1) * cw + ci + 1) * 2;
      const o = (j * W + i) * 2;
      for (let m = 0; m < 2; m++) {
        const top = ctrl[a + m] * (1 - tx) + ctrl[b + m] * tx;
        const bot = ctrl[c + m] * (1 - tx) + ctrl[d + m] * tx;
        out[o + m] = top * (1 - ty) + bot * ty;
      }
    }
  }
  return out;
}

/** Bounds of the grid in a source CRS, padded by one source pixel. */
export function sourceBounds(coords: Float64Array, pad = 0): [number, number, number, number] {
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  for (let k = 0; k < coords.length; k += 2) {
    const x = coords[k];
    const y = coords[k + 1];
    if (x < minx) minx = x;
    if (x > maxx) maxx = x;
    if (y < miny) miny = y;
    if (y > maxy) maxy = y;
  }
  return [minx - pad, miny - pad, maxx + pad, maxy + pad];
}
