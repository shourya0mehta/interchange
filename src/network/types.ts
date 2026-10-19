import type { Bbox } from '../runtime/geo';
import type { TimeWindow } from '../runtime/layers';
import type { Signal } from '../runtime/sources';

export type LineId = 'atmosphere' | 'biosphere' | 'hydrosphere' | 'cryosphere' | 'lithosphere';

export interface Line {
  id: LineId;
  name: string;
  color: string;
  blurb: string;
}

/**
 * What flows between stops. A route only type-checks when each stop's input matches
 * the previous stop's output.
 *   scene   multiband imagery over an area and dates
 *   raster  one continuous value per pixel (an index, elevation, backscatter)
 *   classes one category per pixel (land cover)
 *   image   display-only color (true color); can't be charted or summarized
 */
export type PortType = 'scene' | 'raster' | 'classes' | 'image';

export interface Tool {
  name: string;
  url: string;
  what: string;
}

export type Temporal = 'dense' | 'composite' | 'annual' | 'static' | 'in-situ';

export interface Station {
  id: string;
  name: string;
  /** Source family, in the NGI observing-system sense. */
  family: string;
  lines: LineId[];
  measures: string;
  specs: {
    resolution: string;
    revisit: string;
    years: string;
    license: string;
  };
  /** Numbers the planner compares routes on. */
  score: {
    resolutionM: number;
    revisitDays: number | null;
    startYear: number;
    endYear: number | null;
    /** Optical sensors lose scenes to cloud; radar and products don't. */
    cloudBlind: boolean;
  };
  temporal: Temporal;
  provides: PortType;
  signals: Signal[];
  goodAt: string[];
  badAt: string[];
  access: { earthEngine?: string; stac?: string; other?: string };
  /** The browser can read it in v1. Otherwise routes through it end in an export. */
  live: boolean;
  tools: Tool[];
  /** Position along its lines on the network map, 0 to 1000. */
  x: number;
}

export type MethodId =
  | 'find-scenes'
  | 'cloud-mask'
  | 'clear-days'
  | 'true-color'
  | 'index'
  | 'radar-db'
  | 'composite-mean'
  | 'pick-year'
  | 'difference';

export interface Method {
  id: MethodId;
  name: string;
  does: string;
  /** 'any' passes whatever arrives straight through ('same'). */
  input: PortType | 'any';
  output: PortType | 'same';
  /** Only meaningful on these station kinds. */
  for?: 'optical' | 'radar' | 'composite' | 'annual';
  weight: 'light' | 'heavy';
  tools: Tool[];
}

export type ComponentId = 'layer' | 'legend' | 'swipe' | 'time-slider' | 'click-chart' | 'region-stats' | 'download';

export interface ComponentDef {
  id: ComponentId;
  name: string;
  does: string;
  accepts: PortType[];
  /** Needs a station that changes over time. */
  temporal?: boolean;
  /** Exact or minimum number of time windows. */
  windows?: { min: number; max?: number };
}

export interface RouteStop {
  kind: 'source' | 'method' | 'view';
  ref: string;
  /** Plain-words note shown under the stop. */
  note: string;
  /** Index method signal, when the stop is `index`. */
  signal?: Signal;
}

export interface Tradeoff {
  label: string;
  value: string;
  /** Better, worse or neutral relative to the other candidate routes. */
  tone: 'good' | 'bad' | 'neutral';
}

export interface Route {
  id: string;
  title: string;
  /** The dates in words, e.g. "Summer 2019 vs Summer 2025". */
  when?: string;
  why: string;
  station: string;
  signal: Signal;
  methods: MethodId[];
  views: ComponentId[];
  windows: TimeWindow[];
  /** Range for click-for-history charts. */
  historyRange?: { start: string; end: string };
  aoi: { name: string; bbox: Bbox; capped?: boolean };
  runs: 'live' | 'export';
  tradeoffs: Tradeoff[];
  warnings: string[];
}
