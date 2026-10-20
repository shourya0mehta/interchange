import type { Catalog, StacItem } from './stac';

/** What a layer measures. Each signal has one formula and one color ramp. */
export type Signal =
  | 'true-color'
  | 'ndvi'
  | 'ndwi'
  | 'mndwi'
  | 'nbr'
  | 'ndsi'
  | 'ndmi'
  | 'ndbi'
  | 'landcover'
  | 'elevation'
  | 'water-occurrence'
  | 'radar-vv'
  /** Sea surface temperature, °C. */
  | 'sst'
  /** Sea surface temperature minus the long-term normal for that day, °C. */
  | 'sst-anomaly'
  /** Land surface (skin) temperature by day, °C. */
  | 'lst'
  /** Share of looks in a window where the ground was snow-covered, 0 to 1. */
  | 'snow-frequency'
  /** Share of 8-day periods in a window with a fire detection, 0 to 1. */
  | 'fire-frequency'
  /** Precipitation total over the window, mm. */
  | 'precip'
  /** Mean air temperature, °C. */
  | 'air-temp'
  /** An export-only dataset's own variable (NO2, soil moisture...). */
  | 'native';

export type Band = 'red' | 'green' | 'blue' | 'nir' | 'swir16' | 'swir22' | 'vv' | 'vh';

export interface SceneSource {
  kind: 'scene';
  catalog: Catalog;
  collection: string;
  /** Logical band -> STAC asset key. */
  bands: Partial<Record<Band, string>>;
  mask: { asset: string; type: 'scl' | 'landsat-qa' } | null;
  /** Resolution the browser reads at by default (an overview, not the native grid). */
  readRes: number;
  nativeRes: number;
  maxCloud: number | null;
  query?: Record<string, unknown>;
  /**
   * Earth Search publishes offset -0.1 on every Sentinel-2 band, but its COG pixels are already
   * harmonized: vegetation reads red 300-800 and water 80-300 across baselines 02.13 to 05.11,
   * which only makes sense with no offset. Applying it drives red negative and NDVI to 1.
   */
  ignoreOffset?: boolean;
  /** Converts a scaled reflectance (or backscatter) per band. Defaults to the asset's scale/offset. */
  signals: Signal[];
  /** Biggest area a live preview reads, km². Scenes come in ~100 km tiles, so this stays small. */
  previewMaxKm2: number;
}

/** One variable of a product: the asset that holds it and how to scale its raw values. */
export interface ProductVariant {
  asset: string;
  scale: number;
  offset: number;
  nodata: number | null;
  /** How dated maps in one window combine: average, add up, or count how often `hit` is true. */
  reduce: 'mean' | 'sum' | 'frequency';
  /** Raw values that are a usable look (frequency, and dropping flags such as cloud or ocean). */
  valid?: (raw: number) => boolean;
  /** frequency: raw values that count as a hit. */
  hit?: (raw: number) => boolean;
}

export interface ProductSource {
  kind: 'product';
  catalog: Catalog;
  collection: string;
  /** Signal -> the variable that answers it. The first entry is the default. */
  variants: Partial<Record<Signal, ProductVariant>>;
  /** composite: many dated items (MODIS); annual: one map per year; static: one map. */
  temporal: 'composite' | 'annual' | 'static';
  nativeRes: number;
  /** Optional companion asset; pixels where `valid(qa)` is false are dropped. */
  qa?: { asset: string; valid: (v: number) => boolean };
  years?: [number, number];
  /** Extra STAC query-extension filters. */
  query?: Record<string, unknown>;
  /** composite: most dates read per window, spread evenly through it. */
  maxDates?: number;
  /** composite: days between successive maps (1 daily, 8 for MODIS 8-day, 30 monthly). */
  stepDays?: number;
  /** Biggest area a live preview reads, km². Global single-file products can show an ocean. */
  previewMaxKm2: number;
}

const one = (asset: string, o: Partial<ProductVariant> = {}): ProductVariant => ({
  asset,
  scale: 1,
  offset: 0,
  nodata: null,
  reduce: 'mean',
  ...o,
});

/** The variant a product uses for a signal, falling back to its first. */
export function variantFor(src: ProductSource, signal: Signal): ProductVariant {
  return src.variants[signal] ?? Object.values(src.variants)[0]!;
}

/** Scaled value of one raw pixel, or NaN when it's nodata or flagged. Frequency returns 1 or 0. */
export function productValue(v: ProductVariant, raw: number): number {
  if (Number.isNaN(raw) || (v.nodata !== null && raw === v.nodata)) return NaN;
  if (v.valid && !v.valid(raw)) return NaN;
  if (v.reduce === 'frequency') return v.hit?.(raw) ? 1 : 0;
  return raw * v.scale + v.offset;
}

/** Contiguous US, for datasets that stop at the border. */
export const CONUS: [number, number, number, number] = [-125, 24.3, -66.9, 49.5];

export type RuntimeSource = SceneSource | ProductSource;

/** Station id -> how the browser reads it. Stations not listed here are export-only in v1. */
export const RUNTIME_SOURCES: Record<string, RuntimeSource> = {
  'sentinel-2': {
    kind: 'scene',
    catalog: 'earth-search',
    collection: 'sentinel-2-l2a',
    bands: { red: 'red', green: 'green', blue: 'blue', nir: 'nir', swir16: 'swir16', swir22: 'swir22' },
    mask: { asset: 'scl', type: 'scl' },
    readRes: 20,
    nativeRes: 10,
    maxCloud: 60,
    ignoreOffset: true,
    signals: ['true-color', 'ndvi', 'ndwi', 'mndwi', 'nbr', 'ndsi', 'ndmi', 'ndbi'],
    previewMaxKm2: 3000,
  },
  landsat: {
    kind: 'scene',
    catalog: 'planetary-computer',
    collection: 'landsat-c2-l2',
    bands: { red: 'red', green: 'green', blue: 'blue', nir: 'nir08', swir16: 'swir16', swir22: 'swir22' },
    mask: { asset: 'qa_pixel', type: 'landsat-qa' },
    readRes: 30,
    nativeRes: 30,
    maxCloud: 60,
    // Tier 2 scenes fail USGS geometric or quality checks; their cloud masks are unreliable.
    query: { platform: { in: ['landsat-5', 'landsat-8', 'landsat-9'] }, 'landsat:collection_category': { in: ['T1'] } },
    signals: ['true-color', 'ndvi', 'ndwi', 'mndwi', 'nbr', 'ndsi', 'ndmi', 'ndbi'],
    previewMaxKm2: 6000,
  },
  'sentinel-1': {
    kind: 'scene',
    catalog: 'planetary-computer',
    collection: 'sentinel-1-rtc',
    bands: { vv: 'vv', vh: 'vh' },
    mask: null,
    readRes: 20,
    nativeRes: 10,
    maxCloud: null,
    signals: ['radar-vv'],
    previewMaxKm2: 3000,
  },
  'modis-vi': {
    kind: 'product',
    catalog: 'planetary-computer',
    collection: 'modis-13Q1-061',
    variants: { ndvi: one('250m_16_days_NDVI', { scale: 0.0001, nodata: -3000 }) },
    temporal: 'composite',
    stepDays: 16,
    nativeRes: 250,
    qa: { asset: '250m_16_days_pixel_reliability', valid: (v) => v === 0 || v === 1 },
    years: [2000, 2026],
    maxDates: 6,
    previewMaxKm2: 400_000,
  },
  'esa-worldcover': {
    kind: 'product',
    catalog: 'planetary-computer',
    collection: 'esa-worldcover',
    variants: { landcover: one('map', { nodata: 0 }) },
    temporal: 'annual',
    nativeRes: 10,
    years: [2020, 2021],
    previewMaxKm2: 20_000,
  },
  'io-lulc': {
    kind: 'product',
    catalog: 'planetary-computer',
    collection: 'io-lulc-annual-v02',
    variants: { landcover: one('data', { nodata: 0 }) },
    temporal: 'annual',
    nativeRes: 10,
    years: [2017, 2023],
    previewMaxKm2: 20_000,
  },
  'esa-cci-lc': {
    kind: 'product',
    catalog: 'planetary-computer',
    collection: 'esa-cci-lc',
    variants: { landcover: one('lccs_class', { nodata: 0 }) },
    temporal: 'annual',
    nativeRes: 300,
    years: [1992, 2020],
    previewMaxKm2: 4_000_000,
  },
  'usda-cdl': {
    kind: 'product',
    catalog: 'planetary-computer',
    collection: 'usda-cdl',
    // Each year ships four layers (cropland, cultivated, frequency, confidence); crops by type is "cropland".
    query: { 'usda_cdl:type': { eq: 'cropland' } },
    variants: { landcover: one('cropland', { nodata: 0 }) },
    temporal: 'annual',
    nativeRes: 30,
    years: [2008, 2021],
    previewMaxKm2: 15_000,
  },
  'jrc-water': {
    kind: 'product',
    catalog: 'planetary-computer',
    collection: 'jrc-gsw',
    variants: { 'water-occurrence': one('occurrence', { nodata: 255 }) },
    temporal: 'static',
    nativeRes: 30,
    previewMaxKm2: 40_000,
  },
  'cop-dem': {
    kind: 'product',
    catalog: 'planetary-computer',
    collection: 'cop-dem-glo-30',
    variants: { elevation: one('data') },
    temporal: 'static',
    nativeRes: 30,
    previewMaxKm2: 20_000,
  },
  oisst: {
    kind: 'product',
    catalog: 'planetary-computer',
    collection: 'noaa-cdr-sea-surface-temperature-optimum-interpolation',
    variants: {
      sst: one('sst', { scale: 0.01, nodata: -999 }),
      'sst-anomaly': one('anom', { scale: 0.01, nodata: -999 }),
    },
    temporal: 'composite',
    stepDays: 1,
    nativeRes: 27_750,
    years: [1981, 2026],
    maxDates: 12,
    // One global quarter-degree file per day: a whole ocean costs the same as a bay.
    previewMaxKm2: 200_000_000,
  },
  'modis-lst': {
    kind: 'product',
    catalog: 'planetary-computer',
    collection: 'modis-11A2-061',
    variants: { lst: one('LST_Day_1km', { scale: 0.02, offset: -273.15, nodata: 0 }) },
    temporal: 'composite',
    stepDays: 8,
    nativeRes: 1000,
    years: [2000, 2026],
    maxDates: 8,
    previewMaxKm2: 1_000_000,
  },
  'modis-snow': {
    kind: 'product',
    catalog: 'planetary-computer',
    collection: 'modis-10A2-061',
    // Maximum_Snow_Extent: 200 snow, 25 no snow; cloud, night, water and fill are not looks.
    variants: {
      'snow-frequency': one('Maximum_Snow_Extent', { reduce: 'frequency', valid: (v) => v === 200 || v === 25, hit: (v) => v === 200 }),
    },
    temporal: 'composite',
    stepDays: 8,
    nativeRes: 500,
    years: [2000, 2026],
    maxDates: 10,
    previewMaxKm2: 250_000,
  },
  'active-fire': {
    kind: 'product',
    catalog: 'planetary-computer',
    collection: 'modis-14A2-061',
    // FireMask: 5 land without fire, 7 to 9 fire (low, nominal, high confidence); water, cloud and unknown are not looks.
    variants: {
      'fire-frequency': one('FireMask', { reduce: 'frequency', valid: (v) => v === 5 || v >= 7, hit: (v) => v >= 7 }),
    },
    temporal: 'composite',
    stepDays: 8,
    nativeRes: 1000,
    years: [2000, 2026],
    maxDates: 12,
    previewMaxKm2: 400_000,
  },
  nclimgrid: {
    kind: 'product',
    catalog: 'planetary-computer',
    collection: 'noaa-nclimgrid-monthly',
    variants: {
      precip: one('prcp', { reduce: 'sum' }),
      'air-temp': one('tavg'),
    },
    temporal: 'composite',
    stepDays: 30,
    nativeRes: 4600,
    years: [1895, 2022],
    maxDates: 12,
    previewMaxKm2: 10_000_000,
  },
};

/** Sentinel-2 scene classes that are a real surface (not cloud, shadow, saturation or nodata). */
const SCL_CLEAR = new Set([2, 4, 5, 6, 7, 11]);

export function maskIsClear(type: 'scl' | 'landsat-qa', v: number): boolean {
  if (Number.isNaN(v)) return false;
  if (type === 'scl') return SCL_CLEAR.has(v);
  // Landsat QA_PIXEL: bit 0 fill, 1 dilated cloud, 2 cirrus, 3 cloud, 4 shadow.
  return (v & 0b11111) === 0;
}

/** Optical surface reflectance above this is saturated or a mask miss (bright cloud). */
export const MAX_REFLECTANCE = 1.05;

export function itemYear(item: StacItem): number {
  return Number(item.datetime.slice(0, 4));
}
