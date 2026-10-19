import type { Signal } from './sources';

export type Rgb = [number, number, number];

export interface Ramp {
  /** Value domain mapped onto the stops (values outside are clamped). */
  domain: [number, number];
  stops: { at: number; color: string }[];
  units: string;
  /** Words at the low and high ends of the legend. */
  low: string;
  high: string;
  /** Values at or below this are drawn transparent. */
  transparentBelow?: number;
}

export interface ClassEntry {
  value: number;
  label: string;
  color: string;
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export const RAMPS: Record<Exclude<Signal, 'true-color' | 'landcover' | 'native'>, Ramp> = {
  ndvi: {
    domain: [-0.1, 0.9],
    stops: [
      { at: 0, color: '#8a5a2b' },
      { at: 0.25, color: '#d9b77a' },
      { at: 0.42, color: '#efe6b5' },
      { at: 0.6, color: '#9cc76a' },
      { at: 0.8, color: '#3f8f3e' },
      { at: 1, color: '#14532d' },
    ],
    units: 'NDVI',
    low: 'bare',
    high: 'green',
  },
  ndmi: {
    domain: [-0.4, 0.6],
    stops: [
      { at: 0, color: '#8a5a2b' },
      { at: 0.4, color: '#efe6b5' },
      { at: 0.7, color: '#5fb3a6' },
      { at: 1, color: '#13505b' },
    ],
    units: 'NDMI',
    low: 'dry',
    high: 'moist',
  },
  ndwi: {
    domain: [-0.6, 0.6],
    stops: [
      { at: 0, color: '#7a6244' },
      { at: 0.45, color: '#ece6d6' },
      { at: 0.6, color: '#7fb3e0' },
      { at: 1, color: '#123f8a' },
    ],
    units: 'NDWI',
    low: 'dry land',
    high: 'open water',
  },
  mndwi: {
    domain: [-0.6, 0.6],
    stops: [
      { at: 0, color: '#7a6244' },
      { at: 0.45, color: '#ece6d6' },
      { at: 0.6, color: '#7fb3e0' },
      { at: 1, color: '#123f8a' },
    ],
    units: 'MNDWI',
    low: 'dry land',
    high: 'open water',
  },
  nbr: {
    domain: [-0.4, 0.8],
    stops: [
      { at: 0, color: '#5b1a3a' },
      { at: 0.3, color: '#c4572f' },
      { at: 0.5, color: '#f0d58c' },
      { at: 0.75, color: '#7fb069' },
      { at: 1, color: '#245c32' },
    ],
    units: 'NBR',
    low: 'burned',
    high: 'healthy',
  },
  ndsi: {
    domain: [-0.4, 0.9],
    stops: [
      { at: 0, color: '#6b5b45' },
      { at: 0.45, color: '#d7cfbf' },
      { at: 0.6, color: '#bfe3f2' },
      { at: 1, color: '#ffffff' },
    ],
    units: 'NDSI',
    low: 'no snow',
    high: 'snow',
  },
  ndbi: {
    domain: [-0.6, 0.3],
    stops: [
      { at: 0, color: '#2f6b3a' },
      { at: 0.5, color: '#d9d4c7' },
      { at: 1, color: '#9b3b2a' },
    ],
    units: 'NDBI',
    low: 'vegetated',
    high: 'built-up',
  },
  elevation: {
    domain: [0, 1000],
    stops: [
      { at: 0, color: '#4f7a54' },
      { at: 0.3, color: '#a8b97b' },
      { at: 0.55, color: '#e6d9a8' },
      { at: 0.8, color: '#b98c5e' },
      { at: 1, color: '#f4f1ea' },
    ],
    units: 'm',
    low: 'low',
    high: 'high',
  },
  'water-occurrence': {
    domain: [0, 100],
    stops: [
      { at: 0, color: '#d6e8f5' },
      { at: 0.5, color: '#5b9bd5' },
      { at: 1, color: '#0b2f6b' },
    ],
    units: '% of months',
    low: 'rarely water',
    high: 'always water',
    transparentBelow: 0.5,
  },
  'radar-vv': {
    domain: [-25, 0],
    stops: [
      { at: 0, color: '#0b2346' },
      { at: 0.35, color: '#4a5d73' },
      { at: 0.7, color: '#b9bec4' },
      { at: 1, color: '#fbfaf6' },
    ],
    units: 'dB',
    low: 'smooth (water)',
    high: 'rough',
  },
};

/** Diverging ramp for after-minus-before maps. */
export const CHANGE_RAMP: Ramp = {
  domain: [-0.4, 0.4],
  stops: [
    { at: 0, color: '#9e2a2b' },
    { at: 0.5, color: '#f4f1ea' },
    { at: 1, color: '#1f6f43' },
  ],
  units: 'change',
  low: 'decrease',
  high: 'increase',
};

export const LANDCOVER_CLASSES: Record<string, ClassEntry[]> = {
  'esa-worldcover': [
    { value: 10, label: 'Tree cover', color: '#006400' },
    { value: 20, label: 'Shrubland', color: '#ffbb22' },
    { value: 30, label: 'Grassland', color: '#ffff4c' },
    { value: 40, label: 'Cropland', color: '#f096ff' },
    { value: 50, label: 'Built-up', color: '#fa0000' },
    { value: 60, label: 'Bare / sparse', color: '#b4b4b4' },
    { value: 70, label: 'Snow and ice', color: '#f0f0f0' },
    { value: 80, label: 'Open water', color: '#0064c8' },
    { value: 90, label: 'Herbaceous wetland', color: '#0096a0' },
    { value: 95, label: 'Mangroves', color: '#00cf75' },
    { value: 100, label: 'Moss and lichen', color: '#fae6a0' },
  ],
  'io-lulc': [
    { value: 1, label: 'Water', color: '#419bdf' },
    { value: 2, label: 'Trees', color: '#397d49' },
    { value: 4, label: 'Flooded vegetation', color: '#7a87c6' },
    { value: 5, label: 'Crops', color: '#e49635' },
    { value: 7, label: 'Built area', color: '#c4281b' },
    { value: 8, label: 'Bare ground', color: '#a59b8f' },
    { value: 9, label: 'Snow and ice', color: '#a8ebff' },
    { value: 10, label: 'Clouds', color: '#616161' },
    { value: 11, label: 'Rangeland', color: '#e3e2c3' },
  ],
};

function buildLut(ramp: Ramp, n = 256): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(n * 3);
  const stops = ramp.stops.map((s) => ({ at: s.at, rgb: hexToRgb(s.color) }));
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1].at) k++;
    const a = stops[k];
    const b = stops[k + 1];
    const u = b.at === a.at ? 0 : Math.min(1, Math.max(0, (t - a.at) / (b.at - a.at)));
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = a.rgb[c] + (b.rgb[c] - a.rgb[c]) * u;
  }
  return lut;
}

/** Continuous values -> RGBA, NaN transparent. */
export function rampToRgba(values: Float32Array, ramp: Ramp, opacity = 1): Uint8ClampedArray {
  const lut = buildLut(ramp);
  const out = new Uint8ClampedArray(values.length * 4);
  const [d0, d1] = ramp.domain;
  const span = d1 - d0 || 1;
  const alpha = Math.round(255 * opacity);
  for (let k = 0; k < values.length; k++) {
    const v = values[k];
    if (Number.isNaN(v) || (ramp.transparentBelow !== undefined && v < ramp.transparentBelow)) continue;
    const t = Math.min(255, Math.max(0, Math.round(((v - d0) / span) * 255)));
    out[k * 4] = lut[t * 3];
    out[k * 4 + 1] = lut[t * 3 + 1];
    out[k * 4 + 2] = lut[t * 3 + 2];
    out[k * 4 + 3] = alpha;
  }
  return out;
}

export function rampColorAt(ramp: Ramp, t: number): string {
  const lut = buildLut(ramp, 101);
  const i = Math.round(Math.min(1, Math.max(0, t)) * 100);
  return `rgb(${lut[i * 3]}, ${lut[i * 3 + 1]}, ${lut[i * 3 + 2]})`;
}

/** Class values -> RGBA; unknown classes transparent. */
export function classesToRgba(values: Float32Array, classes: ClassEntry[]): Uint8ClampedArray {
  const map = new Map(classes.map((c) => [c.value, hexToRgb(c.color)]));
  const out = new Uint8ClampedArray(values.length * 4);
  for (let k = 0; k < values.length; k++) {
    const rgb = map.get(values[k]);
    if (!rgb) continue;
    out[k * 4] = rgb[0];
    out[k * 4 + 1] = rgb[1];
    out[k * 4 + 2] = rgb[2];
    out[k * 4 + 3] = 255;
  }
  return out;
}

/** Surface reflectance RGB -> display RGBA with a gentle stretch. */
export function trueColorToRgba(r: Float32Array, g: Float32Array, b: Float32Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(r.length * 4);
  const stretch = (v: number) => 255 * Math.pow(Math.min(1, Math.max(0, v / 0.28)), 0.85);
  for (let k = 0; k < r.length; k++) {
    if (Number.isNaN(r[k]) || Number.isNaN(g[k]) || Number.isNaN(b[k])) continue;
    out[k * 4] = stretch(r[k]);
    out[k * 4 + 1] = stretch(g[k]);
    out[k * 4 + 2] = stretch(b[k]);
    out[k * 4 + 3] = 255;
  }
  return out;
}
