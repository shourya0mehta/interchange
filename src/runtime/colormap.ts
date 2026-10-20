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
  /** How legend and chart numbers read: plain, a share shown as a percent, °C or mm. */
  format?: 'percent' | 'celsius' | 'mm' | 'db';
  /**
   * Stretch the colors over what the map actually holds (2nd to 98th percentile), never
   * narrower than this span. A Gulf summer at 28 to 31 °C would otherwise be one shade of red.
   */
  adaptive?: number;
}

/** A ramp value in words: 0.42 -> "42%", 21.3 -> "21 °C". */
export function formatValue(ramp: Pick<Ramp, 'format'>, v: number): string {
  if (!Number.isFinite(v)) return '';
  switch (ramp.format) {
    case 'percent':
      return `${Math.round(v * 100)}%`;
    case 'celsius':
      return `${Math.abs(v) < 10 && v % 1 !== 0 ? v.toFixed(1) : Math.round(v)} °C`;
    case 'mm':
      return `${Math.round(v).toLocaleString('en-US')} mm`;
    case 'db':
      return `${Math.abs(v) < 3 && v % 1 !== 0 ? v.toFixed(1) : Math.round(v)} dB`;
    default:
      return Math.abs(v) >= 20 ? Math.round(v).toLocaleString('en-US') : v.toFixed(2);
  }
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

const BASE_RAMPS = {
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
    // Open water reflects the radar away, so it reads below about -17 dB. Everything under that
    // is drawn in blue and everything over it in greys, so new water stands out in a swipe.
    stops: [
      { at: 0, color: '#0d2a9c' },
      { at: 0.3, color: '#2f63e0' },
      { at: 0.32, color: '#5d656e' },
      { at: 0.7, color: '#b9bec4' },
      { at: 1, color: '#fbfaf6' },
    ],
    units: 'Radar echo',
    low: 'smooth (water)',
    high: 'rough',
    format: 'db',
  },
} satisfies Record<string, Ramp>;

const THERMAL = [
  { at: 0, color: '#2c3e8f' },
  { at: 0.2, color: '#3f7fc0' },
  { at: 0.38, color: '#8cc3dc' },
  { at: 0.52, color: '#f3ead0' },
  { at: 0.66, color: '#f6b26b' },
  { at: 0.8, color: '#e2603b' },
  { at: 0.92, color: '#b3202b' },
  { at: 1, color: '#6b0d1f' },
];

const EXTRA_RAMPS = {
  sst: { domain: [-2, 32], stops: THERMAL, units: 'Sea surface temperature', low: 'cooler', high: 'warmer', format: 'celsius', adaptive: 4 },
  'sst-anomaly': {
    domain: [-3, 3],
    stops: [
      { at: 0, color: '#1f4e9c' },
      { at: 0.3, color: '#87b6d9' },
      { at: 0.5, color: '#f4f1ea' },
      { at: 0.7, color: '#f19a6b' },
      { at: 1, color: '#9c1d22' },
    ],
    units: 'Difference from the normal for the date',
    low: 'cooler',
    high: 'warmer',
    format: 'celsius',
  },
  lst: { domain: [0, 50], stops: THERMAL, units: 'Ground surface temperature by day', low: 'cooler', high: 'hotter', format: 'celsius', adaptive: 8 },
  'air-temp': { domain: [-15, 35], stops: THERMAL, units: 'Average air temperature', low: 'cooler', high: 'warmer', format: 'celsius', adaptive: 4 },
  'snow-frequency': {
    domain: [0, 1],
    stops: [
      { at: 0, color: '#e8e0cc' },
      { at: 0.25, color: '#b9d3e6' },
      { at: 0.6, color: '#5b97c9' },
      { at: 1, color: '#173f78' },
    ],
    units: 'Share of weeks with snow on the ground',
    low: 'never',
    high: 'always',
    format: 'percent',
  },
  'fire-frequency': {
    domain: [0, 0.5],
    stops: [
      { at: 0, color: '#f7c85f' },
      { at: 0.4, color: '#ec6a1e' },
      { at: 1, color: '#7a0f12' },
    ],
    units: 'Share of 8-day periods with a fire detected',
    low: 'once',
    high: 'often',
    transparentBelow: 0.0001,
    format: 'percent',
  },
  precip: {
    domain: [0, 450],
    stops: [
      { at: 0, color: '#f3ead0' },
      { at: 0.2, color: '#c5dfa0' },
      { at: 0.45, color: '#5fb3a6' },
      { at: 0.7, color: '#2f6fb5' },
      { at: 1, color: '#2a1f6b' },
    ],
    units: 'Total precipitation',
    low: 'dry',
    high: 'wet',
    format: 'mm',
  },
} satisfies Record<string, Ramp>;

export const RAMPS: Record<Exclude<Signal, 'true-color' | 'landcover' | 'native'>, Ramp> = { ...BASE_RAMPS, ...EXTRA_RAMPS };

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

/**
 * Radar echo after minus before, in dB. Ground that turned to standing water goes dark by 3 dB or
 * more, so that end is a strong blue; small changes (speckle, crops, wind) fade to near white.
 */
export const RADAR_CHANGE_RAMP: Ramp = {
  domain: [-9, 9],
  stops: [
    { at: 0, color: '#0d2a9c' },
    { at: 0.28, color: '#2f63e0' },
    { at: 0.36, color: '#dfe3ea' },
    { at: 0.66, color: '#e6e3de' },
    { at: 1, color: '#b39878' },
  ],
  units: 'Change in radar echo',
  low: 'darker: likely new water',
  high: 'brighter',
  format: 'db',
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
  'usda-cdl': [
    { value: 1, label: 'Corn', color: '#ffd300' },
    { value: 2, label: 'Cotton', color: '#ff2626' },
    { value: 3, label: 'Rice', color: '#00a8e2' },
    { value: 4, label: 'Sorghum', color: '#ff9e0a' },
    { value: 5, label: 'Soybeans', color: '#267000' },
    { value: 6, label: 'Sunflower', color: '#ffff00' },
    { value: 10, label: 'Peanuts', color: '#70a500' },
    { value: 11, label: 'Tobacco', color: '#00af49' },
    { value: 12, label: 'Sweet corn', color: '#dda50a' },
    { value: 13, label: 'Popcorn or ornamental corn', color: '#dda50a' },
    { value: 14, label: 'Mint', color: '#7cd3ff' },
    { value: 21, label: 'Barley', color: '#e2007c' },
    { value: 22, label: 'Durum wheat', color: '#896054' },
    { value: 23, label: 'Spring wheat', color: '#d8b56b' },
    { value: 24, label: 'Winter wheat', color: '#a57000' },
    { value: 25, label: 'Other small grains', color: '#d69ebc' },
    { value: 26, label: 'Winter wheat, then soybeans', color: '#707000' },
    { value: 27, label: 'Rye', color: '#aa007c' },
    { value: 28, label: 'Oats', color: '#a05989' },
    { value: 29, label: 'Millet', color: '#700049' },
    { value: 30, label: 'Speltz', color: '#d69ebc' },
    { value: 31, label: 'Canola', color: '#d1ff00' },
    { value: 32, label: 'Flaxseed', color: '#7c99ff' },
    { value: 33, label: 'Safflower', color: '#d6d600' },
    { value: 34, label: 'Rapeseed', color: '#d1ff00' },
    { value: 35, label: 'Mustard', color: '#00af49' },
    { value: 36, label: 'Alfalfa', color: '#ffa5e2' },
    { value: 37, label: 'Other hay', color: '#a5f28c' },
    { value: 38, label: 'Camelina', color: '#00af49' },
    { value: 39, label: 'Buckwheat', color: '#d69ebc' },
    { value: 41, label: 'Sugar beets', color: '#a800e2' },
    { value: 42, label: 'Dry beans', color: '#a50000' },
    { value: 43, label: 'Potatoes', color: '#702600' },
    { value: 44, label: 'Other crops', color: '#00af49' },
    { value: 45, label: 'Sugarcane', color: '#af7cff' },
    { value: 46, label: 'Sweet potatoes', color: '#702600' },
    { value: 47, label: 'Other vegetables and fruit', color: '#ff6666' },
    { value: 48, label: 'Watermelons', color: '#ff6666' },
    { value: 49, label: 'Onions', color: '#ffcc66' },
    { value: 50, label: 'Cucumbers', color: '#ff6666' },
    { value: 51, label: 'Chickpeas', color: '#00af49' },
    { value: 52, label: 'Lentils', color: '#00ddaf' },
    { value: 53, label: 'Peas', color: '#54ff00' },
    { value: 54, label: 'Tomatoes', color: '#f2a377' },
    { value: 55, label: 'Caneberries', color: '#ff6666' },
    { value: 56, label: 'Hops', color: '#00af49' },
    { value: 57, label: 'Herbs', color: '#7cd3ff' },
    { value: 58, label: 'Clover and wildflowers', color: '#e8bfff' },
    { value: 59, label: 'Sod and grass seed', color: '#afffdd' },
    { value: 60, label: 'Switchgrass', color: '#00af49' },
    { value: 61, label: 'Fallow or idle cropland', color: '#bfbf77' },
    { value: 63, label: 'Forest', color: '#93cc93' },
    { value: 64, label: 'Shrubland', color: '#c6d69e' },
    { value: 65, label: 'Barren', color: '#ccbfa3' },
    { value: 66, label: 'Cherries', color: '#ff00ff' },
    { value: 67, label: 'Peaches', color: '#ff8eaa' },
    { value: 68, label: 'Apples', color: '#ba004f' },
    { value: 69, label: 'Grapes', color: '#704489' },
    { value: 70, label: 'Christmas trees', color: '#007777' },
    { value: 71, label: 'Other tree crops', color: '#af9970' },
    { value: 72, label: 'Citrus', color: '#ffff7c' },
    { value: 74, label: 'Pecans', color: '#b5705b' },
    { value: 75, label: 'Almonds', color: '#00a582' },
    { value: 76, label: 'Walnuts', color: '#e8d6af' },
    { value: 77, label: 'Pears', color: '#af9970' },
    { value: 81, label: 'Clouds or no data', color: '#f2f2f2' },
    { value: 82, label: 'Developed', color: '#999999' },
    { value: 83, label: 'Water', color: '#4970a3' },
    { value: 87, label: 'Wetlands', color: '#7cafaf' },
    { value: 88, label: 'Other non-crop land', color: '#e8ffbf' },
    { value: 92, label: 'Aquaculture', color: '#00ffff' },
    { value: 111, label: 'Open water', color: '#4970a3' },
    { value: 112, label: 'Ice and snow', color: '#d3e2f9' },
    { value: 121, label: 'Developed, open space', color: '#bdbdbd' },
    { value: 122, label: 'Developed, low intensity', color: '#a3a3a3' },
    { value: 123, label: 'Developed, medium intensity', color: '#858585' },
    { value: 124, label: 'Developed, high intensity', color: '#5e5e5e' },
    { value: 131, label: 'Barren', color: '#ccbfa3' },
    { value: 141, label: 'Deciduous forest', color: '#93cc93' },
    { value: 142, label: 'Evergreen forest', color: '#5f9e5f' },
    { value: 143, label: 'Mixed forest', color: '#7cb87c' },
    { value: 152, label: 'Shrubland', color: '#c6d69e' },
    { value: 176, label: 'Grassland and pasture', color: '#e8ffbf' },
    { value: 190, label: 'Woody wetlands', color: '#7cafaf' },
    { value: 195, label: 'Herbaceous wetlands', color: '#7cafaf' },
    { value: 204, label: 'Pistachios', color: '#00ff8c' },
    { value: 205, label: 'Triticale', color: '#d69ebc' },
    { value: 206, label: 'Carrots', color: '#ff6666' },
    { value: 207, label: 'Asparagus', color: '#ff6666' },
    { value: 208, label: 'Garlic', color: '#ff6666' },
    { value: 209, label: 'Cantaloupes', color: '#ff6666' },
    { value: 210, label: 'Prunes', color: '#ff8eaa' },
    { value: 211, label: 'Olives', color: '#334933' },
    { value: 212, label: 'Oranges', color: '#e27026' },
    { value: 213, label: 'Honeydew melons', color: '#ff6666' },
    { value: 214, label: 'Broccoli', color: '#ff6666' },
    { value: 215, label: 'Avocados', color: '#66994c' },
    { value: 216, label: 'Peppers', color: '#ff6666' },
    { value: 217, label: 'Pomegranates', color: '#af9970' },
    { value: 218, label: 'Nectarines', color: '#ff8eaa' },
    { value: 219, label: 'Greens', color: '#ff6666' },
    { value: 220, label: 'Plums', color: '#ff8eaa' },
    { value: 221, label: 'Strawberries', color: '#ff6666' },
    { value: 222, label: 'Squash', color: '#ff6666' },
    { value: 223, label: 'Apricots', color: '#ff8eaa' },
    { value: 224, label: 'Vetch', color: '#00af49' },
    { value: 225, label: 'Winter wheat, then corn', color: '#ffd300' },
    { value: 226, label: 'Oats, then corn', color: '#ffd300' },
    { value: 227, label: 'Lettuce', color: '#ff6666' },
    { value: 228, label: 'Triticale, then corn', color: '#ffd300' },
    { value: 229, label: 'Pumpkins', color: '#ff6666' },
    { value: 230, label: 'Lettuce, then durum wheat', color: '#896054' },
    { value: 231, label: 'Lettuce, then cantaloupe', color: '#ff6666' },
    { value: 232, label: 'Lettuce, then cotton', color: '#ff2626' },
    { value: 233, label: 'Lettuce, then barley', color: '#e2007c' },
    { value: 234, label: 'Durum wheat, then sorghum', color: '#ff9e0a' },
    { value: 235, label: 'Barley, then sorghum', color: '#ff9e0a' },
    { value: 236, label: 'Winter wheat, then sorghum', color: '#a57000' },
    { value: 237, label: 'Barley, then corn', color: '#ffd300' },
    { value: 238, label: 'Winter wheat, then cotton', color: '#a57000' },
    { value: 239, label: 'Soybeans, then cotton', color: '#267000' },
    { value: 240, label: 'Soybeans, then oats', color: '#267000' },
    { value: 241, label: 'Corn, then soybeans', color: '#ffd300' },
    { value: 242, label: 'Blueberries', color: '#000099' },
    { value: 243, label: 'Cabbage', color: '#ff6666' },
    { value: 244, label: 'Cauliflower', color: '#ff6666' },
    { value: 245, label: 'Celery', color: '#ff6666' },
    { value: 246, label: 'Radishes', color: '#ff6666' },
    { value: 247, label: 'Turnips', color: '#ff6666' },
    { value: 248, label: 'Eggplants', color: '#ff6666' },
    { value: 249, label: 'Gourds', color: '#ff6666' },
    { value: 250, label: 'Cranberries', color: '#ff6666' },
    { value: 254, label: 'Barley, then soybeans', color: '#267000' },
  ],
  'esa-cci-lc': [
    { value: 10, label: 'Cropland, rainfed', color: '#ffff64' },
    { value: 11, label: 'Cropland, herbaceous', color: '#ffff64' },
    { value: 12, label: 'Cropland, tree or shrub', color: '#ffff00' },
    { value: 20, label: 'Cropland, irrigated', color: '#aaf0f0' },
    { value: 30, label: 'Mostly cropland, some natural vegetation', color: '#dcf064' },
    { value: 40, label: 'Mostly natural vegetation, some cropland', color: '#c8c864' },
    { value: 50, label: 'Broadleaf evergreen forest', color: '#006400' },
    { value: 60, label: 'Broadleaf deciduous forest', color: '#00a000' },
    { value: 61, label: 'Broadleaf deciduous forest, closed', color: '#00a000' },
    { value: 62, label: 'Broadleaf deciduous forest, open', color: '#aac800' },
    { value: 70, label: 'Needleleaf evergreen forest', color: '#003c00' },
    { value: 71, label: 'Needleleaf evergreen forest, closed', color: '#003c00' },
    { value: 72, label: 'Needleleaf evergreen forest, open', color: '#005000' },
    { value: 80, label: 'Needleleaf deciduous forest', color: '#285000' },
    { value: 81, label: 'Needleleaf deciduous forest, closed', color: '#285000' },
    { value: 82, label: 'Needleleaf deciduous forest, open', color: '#286400' },
    { value: 90, label: 'Mixed forest', color: '#788200' },
    { value: 100, label: 'Mostly trees and shrubs, some grass', color: '#8ca000' },
    { value: 110, label: 'Mostly grass, some trees and shrubs', color: '#be9600' },
    { value: 120, label: 'Shrubland', color: '#966400' },
    { value: 121, label: 'Evergreen shrubland', color: '#966400' },
    { value: 122, label: 'Deciduous shrubland', color: '#966400' },
    { value: 130, label: 'Grassland', color: '#ffb432' },
    { value: 140, label: 'Lichens and mosses', color: '#ffdcd2' },
    { value: 150, label: 'Sparse vegetation', color: '#ffebaf' },
    { value: 151, label: 'Sparse trees', color: '#ffc864' },
    { value: 152, label: 'Sparse shrubs', color: '#ffd278' },
    { value: 153, label: 'Sparse grass', color: '#ffebaf' },
    { value: 160, label: 'Flooded forest, fresh water', color: '#00785a' },
    { value: 170, label: 'Flooded forest, salt water (mangroves)', color: '#009678' },
    { value: 180, label: 'Flooded shrubs or grass', color: '#00dc82' },
    { value: 190, label: 'Urban', color: '#c31400' },
    { value: 200, label: 'Bare ground', color: '#fff5d7' },
    { value: 201, label: 'Bare rock', color: '#dcdcdc' },
    { value: 202, label: 'Bare sand or soil', color: '#fff5d7' },
    { value: 210, label: 'Water', color: '#0046c8' },
    { value: 220, label: 'Snow and ice', color: '#e6f2ff' },
  ],
};

/** Legend heading for each class map. */
export const CLASS_TITLES: Record<string, string> = {
  'usda-cdl': 'Crop or cover type',
  'esa-cci-lc': 'Land cover',
  'io-lulc': 'Land cover',
  'esa-worldcover': 'Land cover',
};

/** After-minus-before ramp in the signal's own units. */
export function changeRampFor(format: Ramp['format'], span: number): Ramp {
  const base = { units: 'Change, after minus before', format };
  const cool = [
    { at: 0, color: '#1f4e9c' },
    { at: 0.5, color: '#f4f1ea' },
    { at: 1, color: '#9c1d22' },
  ];
  const wet = [
    { at: 0, color: '#8a5a2b' },
    { at: 0.5, color: '#f4f1ea' },
    { at: 1, color: '#1f4e9c' },
  ];
  if (format === 'celsius') return { ...base, domain: [-4, 4], stops: cool, low: 'cooler', high: 'warmer' };
  if (format === 'mm') return { ...base, domain: [-span / 3, span / 3], stops: wet, low: 'drier', high: 'wetter' };
  if (format === 'percent') return { ...base, domain: [-0.5, 0.5], stops: wet, low: 'less', high: 'more' };
  return CHANGE_RAMP;
}

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
