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
  /** An export-only dataset's own variable (fire counts, NO2, rainfall...). */
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
}

export interface ProductSource {
  kind: 'product';
  catalog: Catalog;
  collection: string;
  asset: string;
  signal: Signal;
  /** composite: many dated items (MODIS); annual: one map per year; static: one map. */
  temporal: 'composite' | 'annual' | 'static';
  nativeRes: number;
  scale: number;
  offset: number;
  nodata: number | null;
  /** Optional companion asset; pixels where `valid(qa)` is false are dropped. */
  qa?: { asset: string; valid: (v: number) => boolean };
  years?: [number, number];
}

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
  },
  'modis-vi': {
    kind: 'product',
    catalog: 'planetary-computer',
    collection: 'modis-13Q1-061',
    asset: '250m_16_days_NDVI',
    signal: 'ndvi',
    temporal: 'composite',
    nativeRes: 250,
    scale: 0.0001,
    offset: 0,
    nodata: -3000,
    qa: { asset: '250m_16_days_pixel_reliability', valid: (v) => v === 0 || v === 1 },
    years: [2000, 2026],
  },
  'esa-worldcover': {
    kind: 'product',
    catalog: 'planetary-computer',
    collection: 'esa-worldcover',
    asset: 'map',
    signal: 'landcover',
    temporal: 'annual',
    nativeRes: 10,
    scale: 1,
    offset: 0,
    nodata: 0,
    years: [2020, 2021],
  },
  'io-lulc': {
    kind: 'product',
    catalog: 'planetary-computer',
    collection: 'io-lulc-annual-v02',
    asset: 'data',
    signal: 'landcover',
    temporal: 'annual',
    nativeRes: 10,
    scale: 1,
    offset: 0,
    nodata: 0,
    years: [2017, 2023],
  },
  'jrc-water': {
    kind: 'product',
    catalog: 'planetary-computer',
    collection: 'jrc-gsw',
    asset: 'occurrence',
    signal: 'water-occurrence',
    temporal: 'static',
    nativeRes: 30,
    scale: 1,
    offset: 0,
    nodata: 255,
  },
  'cop-dem': {
    kind: 'product',
    catalog: 'planetary-computer',
    collection: 'cop-dem-glo-30',
    asset: 'data',
    signal: 'elevation',
    temporal: 'static',
    nativeRes: 30,
    scale: 1,
    offset: 0,
    nodata: null,
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
