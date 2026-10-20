import { fromUrl, type GeoTIFF, type GeoTIFFImage } from 'geotiff';

/** A rectangular block of one band, georeferenced in its source CRS. */
export interface RasterWindow {
  data: ArrayLike<number>;
  width: number;
  height: number;
  /** Source-CRS coordinate of the window's top-left corner. */
  x0: number;
  y0: number;
  /** Pixel size in source units (positive). */
  res: number;
  nodata: number | null;
}

const tiffs = new Map<string, Promise<GeoTIFF>>();
let urlSigner: (url: string) => Promise<string> = async (u) => u;

/** Lets Planetary Computer assets be signed before they are opened. */
export function setUrlSigner(fn: (url: string) => Promise<string>): void {
  urlSigner = fn;
}

export function openCog(url: string): Promise<GeoTIFF> {
  let p = tiffs.get(url);
  if (!p) {
    p = urlSigner(url).then((signed) => fromUrl(signed, { allowFullFile: false, blockSize: 65536, cacheSize: 512 } as never));
    p.catch(() => tiffs.delete(url));
    tiffs.set(url, p);
  }
  return p;
}

interface Level {
  image: GeoTIFFImage;
  res: number;
  width: number;
  height: number;
}

const levels = new WeakMap<GeoTIFF, Promise<{ x0: number; y0: number; levels: Level[]; nodata: number | null }>>();

function describe(tiff: GeoTIFF) {
  let p = levels.get(tiff);
  if (!p) {
    p = (async () => {
      const first = await tiff.getImage(0);
      const [x0, y0] = first.getOrigin();
      const [rx] = first.getResolution();
      const fullW = first.getWidth();
      const out: Level[] = [];
      const count = await tiff.getImageCount();
      for (let i = 0; i < count; i++) {
        const image = await tiff.getImage(i);
        const w = image.getWidth();
        // Skip masks and other non-overview subfiles.
        if (i > 0 && w >= fullW) continue;
        out.push({ image, res: Math.abs(rx) * (fullW / w), width: w, height: image.getHeight() });
      }
      out.sort((a, b) => a.res - b.res);
      const nd = first.getGDALNoData();
      return { x0, y0, levels: out, nodata: nd === null || Number.isNaN(nd) ? null : nd };
    })();
    levels.set(tiff, p);
  }
  return p;
}

/**
 * Reads the part of a single-band COG covering `bounds` (source CRS) from the coarsest
 * overview that is still at least as sharp as `targetRes`. Returns null when the COG does
 * not overlap the bounds.
 */
export async function readCogWindow(
  url: string,
  bounds: [number, number, number, number],
  targetRes: number,
  sample = 0,
): Promise<RasterWindow | null> {
  // Open data hosts drop the odd range request under load. Try twice more, on a fresh source
  // each time, before telling the reader the layer failed.
  for (let attempt = 0; ; attempt++) {
    try {
      return await readCogWindowOnce(url, bounds, targetRes, sample);
    } catch (e) {
      if ((e as Error).name === 'AbortError' || attempt >= 2) throw e;
      tiffs.delete(url);
      await new Promise((r) => setTimeout(r, attempt === 0 ? 600 : 1800));
    }
  }
}

async function readCogWindowOnce(
  url: string,
  bounds: [number, number, number, number],
  targetRes: number,
  sample: number,
): Promise<RasterWindow | null> {
  const tiff = await openCog(url);
  const info = await describe(tiff);
  let level = info.levels[0];
  for (const l of info.levels) {
    if (l.res <= targetRes * 1.001) level = l;
  }
  const { res } = level;
  const px0 = Math.max(0, Math.floor((bounds[0] - info.x0) / res));
  const px1 = Math.min(level.width, Math.ceil((bounds[2] - info.x0) / res));
  const py0 = Math.max(0, Math.floor((info.y0 - bounds[3]) / res));
  const py1 = Math.min(level.height, Math.ceil((info.y0 - bounds[1]) / res));
  if (px1 <= px0 || py1 <= py0) return null;
  const rasters = (await level.image.readRasters({
    window: [px0, py0, px1, py1],
    samples: [sample],
    interleave: false,
  })) as unknown as ArrayLike<number>[];
  return {
    data: rasters[0],
    width: px1 - px0,
    height: py1 - py0,
    x0: info.x0 + px0 * res,
    y0: info.y0 - py0 * res,
    res,
    nodata: info.nodata,
  };
}

/** Value at a source-CRS coordinate, or NaN outside the window or on nodata. */
export function sampleAt(win: RasterWindow, x: number, y: number): number {
  const c = Math.floor((x - win.x0) / win.res);
  const r = Math.floor((win.y0 - y) / win.res);
  if (c < 0 || r < 0 || c >= win.width || r >= win.height) return NaN;
  const v = win.data[r * win.width + c];
  if (win.nodata !== null && v === win.nodata) return NaN;
  return v;
}

/** Drops cached file handles (tests, or a signer that expired). */
export function clearCogCache(): void {
  tiffs.clear();
}
