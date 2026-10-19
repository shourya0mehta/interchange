import type { Band, Signal } from './sources';

export type BandValues = Partial<Record<Band, number>>;

const nd = (a: number | undefined, b: number | undefined): number => {
  if (a === undefined || b === undefined || Number.isNaN(a) || Number.isNaN(b)) return NaN;
  const s = a + b;
  return s === 0 ? NaN : (a - b) / s;
};

export interface IndexDef {
  bands: Band[];
  compute: (v: BandValues) => number;
  /** Plain-words description for dossiers and the "How this map was made" strip. */
  formula: string;
}

/** Normalized-difference indices and the bands they need. */
export const INDICES: Partial<Record<Signal, IndexDef>> = {
  ndvi: { bands: ['nir', 'red'], compute: (v) => nd(v.nir, v.red), formula: '(NIR - Red) / (NIR + Red)' },
  ndwi: { bands: ['green', 'nir'], compute: (v) => nd(v.green, v.nir), formula: '(Green - NIR) / (Green + NIR)' },
  mndwi: { bands: ['green', 'swir16'], compute: (v) => nd(v.green, v.swir16), formula: '(Green - SWIR1) / (Green + SWIR1)' },
  nbr: { bands: ['nir', 'swir22'], compute: (v) => nd(v.nir, v.swir22), formula: '(NIR - SWIR2) / (NIR + SWIR2)' },
  ndsi: { bands: ['green', 'swir16'], compute: (v) => nd(v.green, v.swir16), formula: '(Green - SWIR1) / (Green + SWIR1)' },
  ndmi: { bands: ['nir', 'swir16'], compute: (v) => nd(v.nir, v.swir16), formula: '(NIR - SWIR1) / (NIR + SWIR1)' },
  ndbi: { bands: ['swir16', 'nir'], compute: (v) => nd(v.swir16, v.nir), formula: '(SWIR1 - NIR) / (SWIR1 + NIR)' },
  'radar-vv': {
    bands: ['vv'],
    compute: (v) => (v.vv === undefined || !(v.vv > 0) ? NaN : 10 * Math.log10(v.vv)),
    formula: '10 * log10(VV backscatter)',
  },
};

/** Bands a scene layer needs for a signal. */
export function bandsFor(signal: Signal): Band[] {
  if (signal === 'true-color') return ['red', 'green', 'blue'];
  const def = INDICES[signal];
  if (!def) throw new Error(`Signal ${signal} is not computed from scene bands`);
  return def.bands;
}
