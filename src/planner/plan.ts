import { bboxAreaKm2, bboxCenter, capBbox, type Bbox } from '../runtime/geo';
import type { TimeWindow } from '../runtime/layers';
import { RUNTIME_SOURCES, variantFor, type Signal } from '../runtime/sources';
import { COMPONENT_BY_ID, SIGNAL_NAMES, STATION_BY_ID } from '../network/network';
import { checkRoute } from '../network/typecheck';
import type { ComponentId, MethodId, Route, Station, Tradeoff } from '../network/types';
import type { Intent, Theme } from './intent';

/** Live previews are capped to keep reads small; bigger areas export. The cap depends on how the
 * dataset is tiled: scenes come in ~100 km tiles, a global SST file covers an ocean in one read. */
export const PREVIEW_MAX_KM2 = 3000;

export function previewCap(stationId: string): number {
  return RUNTIME_SOURCES[stationId]?.previewMaxKm2 ?? PREVIEW_MAX_KM2;
}

export interface Place {
  name: string;
  bbox: Bbox;
  /** An uploaded boundary (outer rings, lon/lat), for masking the map and its totals. */
  shape?: [number, number][][];
  /** Said once under the routes when the box is a compromise (oceans that cross the date line). */
  note?: string;
}

export type Geocoder = (query: string, signal?: AbortSignal) => Promise<Place | null>;

interface Candidate {
  station: string;
  signal: Signal;
  /** Stands in for a variable that isn't live yet (greenness for drought). */
  proxy?: boolean;
  /** The only dataset that answers the exact question (crop by crop): seeing part of a big
   * place beats seeing all of it without the answer. */
  specific?: boolean;
}

/** Datasets that can answer each theme, best first. */
export const THEME_CANDIDATES: Record<Theme, Candidate[]> = {
  vegetation: [
    { station: 'sentinel-2', signal: 'ndvi' },
    { station: 'landsat', signal: 'ndvi' },
    { station: 'modis-vi', signal: 'ndvi' },
  ],
  'cover-crop': [
    { station: 'sentinel-2', signal: 'ndvi' },
    { station: 'landsat', signal: 'ndvi' },
  ],
  'crop-type': [
    { station: 'usda-cdl', signal: 'landcover', specific: true },
    { station: 'io-lulc', signal: 'landcover' },
    { station: 'esa-cci-lc', signal: 'landcover' },
  ],
  water: [
    { station: 'sentinel-2', signal: 'mndwi' },
    { station: 'jrc-water', signal: 'water-occurrence' },
    { station: 'landsat', signal: 'mndwi' },
    { station: 'sentinel-1', signal: 'radar-vv' },
  ],
  flood: [
    { station: 'sentinel-1', signal: 'radar-vv' },
    { station: 'sentinel-2', signal: 'mndwi' },
    { station: 'landsat', signal: 'mndwi' },
    { station: 'jrc-water', signal: 'water-occurrence' },
  ],
  fire: [
    { station: 'sentinel-2', signal: 'nbr' },
    { station: 'landsat', signal: 'nbr' },
    { station: 'active-fire', signal: 'fire-frequency' },
  ],
  snow: [
    { station: 'sentinel-2', signal: 'ndsi' },
    { station: 'modis-snow', signal: 'snow-frequency' },
    { station: 'landsat', signal: 'ndsi' },
  ],
  built: [
    { station: 'io-lulc', signal: 'landcover' },
    { station: 'sentinel-2', signal: 'ndbi' },
    { station: 'esa-cci-lc', signal: 'landcover' },
    { station: 'viirs-night', signal: 'native' },
  ],
  landcover: [
    { station: 'io-lulc', signal: 'landcover' },
    { station: 'esa-worldcover', signal: 'landcover' },
    { station: 'esa-cci-lc', signal: 'landcover' },
    { station: 'dynamic-world', signal: 'native' },
  ],
  terrain: [{ station: 'cop-dem', signal: 'elevation' }],
  moisture: [
    { station: 'sentinel-2', signal: 'ndmi' },
    { station: 'landsat', signal: 'ndmi' },
  ],
  imagery: [
    { station: 'sentinel-2', signal: 'true-color' },
    { station: 'landsat', signal: 'true-color' },
  ],
  'forest-loss': [
    { station: 'landsat', signal: 'ndvi' },
    { station: 'sentinel-2', signal: 'ndvi' },
    { station: 'esa-cci-lc', signal: 'landcover' },
    { station: 'hansen', signal: 'native' },
  ],
  air: [{ station: 's5p', signal: 'native' }],
  heat: [
    { station: 'modis-lst', signal: 'lst' },
    { station: 'nclimgrid', signal: 'air-temp' },
    { station: 'era5', signal: 'native' },
  ],
  rain: [
    { station: 'nclimgrid', signal: 'precip' },
    { station: 'chirps', signal: 'native' },
    { station: 'era5', signal: 'native' },
  ],
  'night-lights': [{ station: 'viirs-night', signal: 'native' }],
  // Soil moisture itself isn't readable in the browser yet; rain and plant greenness show a drought's mark.
  'soil-moisture': [
    { station: 'smap', signal: 'native' },
    { station: 'era5', signal: 'native' },
    { station: 'nclimgrid', signal: 'precip', proxy: true },
    { station: 'modis-vi', signal: 'ndvi', proxy: true },
  ],
  groundwater: [{ station: 'grace', signal: 'native' }],
  'canopy-height': [{ station: 'gedi', signal: 'native' }],
  ocean: [
    { station: 'oisst', signal: 'sst' },
    { station: 'argo', signal: 'native' },
  ],
};

/** Reorders or retunes a theme's candidates for what the sentence actually says. */
function candidatesFor(intent: Intent): Candidate[] {
  const text = intent.text;
  let c = [...THEME_CANDIDATES[intent.theme]];
  const first = (station: string) => {
    const hit = c.find((x) => x.station === station);
    if (hit) c = [hit, ...c.filter((x) => x !== hit)];
  };
  if (intent.theme === 'ocean') {
    if (/anomal|marine heat ?waves?|heat ?waves?|warmer than|cooler than|above normal|below normal|bleach|el ni|la ni|unusual/i.test(text)) {
      c = c.map((x) => (x.station === 'oisst' ? { ...x, signal: 'sst-anomaly' } : x));
    }
    // OISST is the skin of the sea; questions about what lies beneath go to the floats.
    if (/below the surface|deep|subsurface|heat content|salinity|argo|profiles?|\d+ ?m(eters)? down/i.test(text)) c = c.filter((x) => x.station !== 'oisst');
  }
  if (intent.theme === 'heat') {
    if (/\bair\b|weather|climate|average temp|daily temp|degrees/i.test(text) && !/surface|island|roofs?|pavement|asphalt|street|ground/i.test(text)) first('nclimgrid');
  }
  if (intent.theme === 'fire' && /active|hot ?spots?|burning (now|right now)|where (are|were) .*fires|fire (activity|season|counts?)|how many fires|thermal/i.test(text)) first('active-fire');
  if (intent.theme === 'snow' && /how long|snow season|how often|duration|persist|snow cover days|snow days|melt[- ]?out|first snow/i.test(text)) first('modis-snow');
  if ((intent.theme === 'landcover' || intent.theme === 'built' || intent.theme === 'forest-loss') && /\b19[89]\d\b|\b200\d\b|\bsince (the )?(90s|1990s|2000s)\b|three decades|30 years/i.test(text)) first('esa-cci-lc');
  return c;
}

/** True when a place sits mostly outside a station's coverage. */
function outsideCoverage(st: Station, bbox: Bbox): boolean {
  if (!st.coverage) return false;
  const [x, y] = bboxCenter(bbox);
  const [w, s, e, n] = st.coverage.bbox;
  return x < w || x > e || y < s || y > n;
}

const THEME_NOTES: Partial<Record<Theme, string>> = {
  'cover-crop': 'Snow reads as bare soil, so the windows sit in early spring, after melt and before cash crops green up.',
  flood: 'Storm clouds hide floods from optical sensors; radar sees through them.',
  fire: 'Burn severity reads best when the before and after windows are close to the fire date.',
  'forest-loss': 'Greenness can drop for reasons other than tree loss (drought, harvest); check the true-color view.',
  water: 'Wind roughens open water, which can confuse radar.',
};

export function methodsFor(st: Station, signal: Signal, wantsChange: boolean): MethodId[] {
  if (!st.live) return ['find-scenes'];
  const m: MethodId[] = ['find-scenes'];
  if (signal === 'radar-vv') m.push('radar-db');
  else if (st.provides === 'scene') {
    m.push('cloud-mask', 'clear-days', signal === 'true-color' ? 'true-color' : 'index');
  } else if (st.temporal === 'composite') {
    const src = RUNTIME_SOURCES[st.id];
    const reduce = src?.kind === 'product' ? variantFor(src, signal).reduce : 'mean';
    m.push(reduce === 'frequency' ? 'count-looks' : reduce === 'sum' ? 'add-up' : 'composite-mean');
  }
  else if (st.temporal === 'annual') m.push('pick-year');
  if (wantsChange && signal !== 'true-color' && st.provides !== 'classes' && st.temporal !== 'static') m.push('difference');
  return m;
}

function yearWindow(y: number): TimeWindow {
  return { label: String(y), start: `${y}-01-01`, end: `${y}-12-31` };
}

/** Fits the intent's windows to a station's calendar. Returns null when it can't. */
function windowsFor(st: Station, intent: Intent): { windows: TimeWindow[]; history?: { start: string; end: string }; notes: string[] } | null {
  const notes: string[] = [];
  const t = intent.time;
  const base: TimeWindow[] =
    t.kind === 'compare' ? [...t.windows] : t.kind === 'yearly' ? [...t.windows] : [t.window];

  if (st.temporal === 'static') {
    return { windows: [{ label: st.specs.years, start: '1900-01-01', end: '2100-12-31' }], notes };
  }
  if (st.temporal === 'annual') {
    const y0 = st.score.startYear;
    const y1 = st.score.endYear ?? new Date().getUTCFullYear();
    const fit = (w: TimeWindow) => Math.min(y1, Math.max(y0, Number(w.end.slice(0, 4))));
    let years = [...new Set(base.map(fit))];
    if (t.kind === 'compare' && years.length < 2) years = [y0, y1];
    if (t.kind === 'compare') years = [Math.min(...years), Math.max(...years)];
    const asked = base.map((w) => Number(w.end.slice(0, 4)));
    if (asked.some((y) => y < y0 || y > y1)) notes.push(`${st.name} covers ${y0} to ${y1}, so the closest years are used.`);
    return { windows: years.map(yearWindow), notes };
  }
  // Dense and composite: every window must fall inside the record.
  const start = st.score.startYear;
  const end = st.score.endYear;
  const askedYears = /\b(18|19|20)\d\d\b/.test(intent.text);
  let windows = base;
  // Year-by-year asks keep the years the record covers ("each year since 2010" on a record ending 2022).
  if (t.kind === 'yearly' && end !== null) {
    const kept = base.filter((w) => Number(w.start.slice(0, 4)) <= end);
    if (kept.length >= 2 && kept.length < base.length) {
      windows = kept;
      notes.push(`${st.name} ends in ${end} here, so the slider stops there.`);
    }
  }
  const lastYear = Math.max(...windows.map((w) => Number(w.start.slice(0, 4))));
  if (end !== null && lastYear > end) {
    // A record that stopped (NClimGrid here ends in 2022): when no year was asked for, use its
    // latest matching season instead of nothing.
    if (askedYears && t.kind !== 'history') return null;
    const shift = (d: string, k: number) => `${Number(d.slice(0, 4)) - k}${d.slice(4)}`;
    const k = lastYear - end;
    windows = windows.map((w) => ({ label: w.label.replace(/\b(18|19|20)\d\d\b/g, (y) => String(Number(y) - k)), start: shift(w.start, k), end: shift(w.end, k) }));
    notes.push(`${st.name} ends in ${end} here, so the latest ${end} data is used.`);
  }
  for (const w of windows) {
    const wy = Number(w.end.slice(0, 4));
    if (wy < start) return null;
  }
  let history: { start: string; end: string } | undefined;
  if (t.kind === 'history') {
    history = { ...t.range };
    if (Number(history.start.slice(0, 4)) < start) {
      history.start = `${start}-01-01`;
      notes.push(`${st.name} history starts in ${start}.`);
    }
    if (end !== null && history.end > `${end}-12-31`) history.end = `${end}-12-31`;
  }
  return { windows, history, notes };
}

function chooseViews(st: Station, intent: Intent, output: 'scene' | 'raster' | 'classes' | 'image', windowCount: number): { views: ComponentId[]; notes: string[] } {
  const notes: string[] = [];
  const wanted = new Set<ComponentId>(intent.views);
  if (!wanted.size) {
    if ((st.temporal === 'dense' || st.temporal === 'composite') && output === 'raster') wanted.add('click-chart');
    else wanted.add('region-stats');
  }
  if (intent.time.kind === 'compare') wanted.add('swipe');
  if (intent.time.kind === 'yearly') wanted.add('time-slider');
  const views: ComponentId[] = ['layer'];
  if (output !== 'image') views.push('legend');
  for (const v of wanted) {
    const c = COMPONENT_BY_ID[v];
    if (!c || views.includes(v)) continue;
    if (!c.accepts.includes(output)) {
      notes.push(`${c.name} isn't offered on ${output === 'image' ? 'true color' : 'this layer'}.`);
      continue;
    }
    if (c.temporal && (st.temporal === 'static' || st.temporal === 'in-situ')) {
      notes.push(`${c.name} needs data that changes over time; ${st.name} is one map.`);
      continue;
    }
    if (v === 'click-chart' && st.temporal === 'annual') {
      notes.push(`Click for history needs frequent looks; ${st.name} is yearly, so it gets a time slider.`);
      if (windowCount >= 2 && !views.includes('time-slider')) views.push('time-slider');
      continue;
    }
    if (c.windows && (windowCount < c.windows.min || (c.windows.max !== undefined && windowCount > c.windows.max))) continue;
    views.push(v);
  }
  if (!views.includes('download')) views.push('download');
  return { views, notes };
}

function windowsSummary(windows: TimeWindow[], history?: { start: string; end: string }): string {
  if (history) return `${history.start.slice(0, 4)} to ${history.end.slice(0, 4)}`;
  if (windows.length === 2) return `${windows[0].label} vs ${windows[1].label}`;
  if (windows.length > 2) return `${windows[0].label} to ${windows[windows.length - 1].label}`;
  return windows[0]?.label ?? '';
}

function tradeoffs(st: Station, all: Station[]): Tradeoff[] {
  const best = <T,>(vals: T[], better: (a: T, b: T) => boolean, v: T) => vals.every((o) => o === v || !better(o, v));
  const res = all.map((s) => s.score.resolutionM).filter((r) => r > 0);
  const starts = all.map((s) => s.score.startYear);
  const revisits = all.map((s) => s.score.revisitDays ?? 9999);
  const tone = (good: boolean, bad: boolean): Tradeoff['tone'] => (all.length < 2 ? 'neutral' : good ? 'good' : bad ? 'bad' : 'neutral');
  const r = st.score.resolutionM;
  const out: Tradeoff[] = [
    {
      label: 'Detail',
      value: st.specs.resolution,
      tone: tone(r > 0 && best(res, (a, b) => a < b, r), r > 0 && best(res, (a, b) => a > b, r)),
    },
    {
      label: 'Looks',
      value: st.specs.revisit,
      tone: tone(best(revisits, (a, b) => a < b, st.score.revisitDays ?? 9999), best(revisits, (a, b) => a > b, st.score.revisitDays ?? 9999)),
    },
    {
      label: 'Years',
      value: st.specs.years,
      tone: tone(best(starts, (a, b) => a < b, st.score.startYear), best(starts, (a, b) => a > b, st.score.startYear)),
    },
    {
      label: 'Clouds',
      value: st.score.cloudBlind ? (st.provides === 'scene' ? 'Sees through them' : 'Already handled') : 'Can block the view',
      tone: st.score.cloudBlind ? 'good' : 'bad',
    },
    {
      label: 'Runs',
      value: st.live ? 'Live in the browser' : 'Export to Earth Engine',
      tone: st.live ? 'good' : 'bad',
    },
  ];
  return out;
}

export interface PlanResult {
  intent: Intent;
  place: Place | null;
  routes: Route[];
  /** Datasets considered and left out, with the reason. */
  skipped: { station: string; reason: string }[];
  warnings: string[];
}

/** Route title in plain words: "Sentinel-2, greenness (NDVI)". */
function titleFor(st: Station, signal: Signal): string {
  const what = st.id === 'usda-cdl' ? 'crop types' : (SIGNAL_NAMES[signal]?.long ?? signal);
  return `${st.name}, ${what}`;
}

/** Turns a parsed goal and a place into ranked, type-checked candidate routes. */
const pad2 = (n: number) => String(n).padStart(2, '0');
const lastOfFeb = (y: number) => (new Date(Date.UTC(y, 2, 0)).getUTCDate());

/**
 * Seasons south of the tropics run the other way: "summer 2016" on the Great Barrier Reef is
 * December 2015 to February 2016. Season windows are re-read by their labels; event and month
 * windows are left alone.
 */
export function southernSeasons<T extends { label: string; start: string; end: string }>(w: T): T {
  let m = /^Summer (\d{4})$/.exec(w.label);
  if (m) {
    const y = Number(m[1]);
    return { ...w, label: `Summer ${y - 1}-${String(y).slice(2)}`, start: `${y - 1}-12-01`, end: `${y}-02-${pad2(lastOfFeb(y))}` };
  }
  m = /^Winter (\d{4})-(\d{2})$/.exec(w.label);
  if (m) {
    const y = Number(m[1]) + 1;
    return { ...w, label: `Winter ${y}`, start: `${y}-06-01`, end: `${y}-08-31` };
  }
  m = /^Spring (\d{4})$/.exec(w.label);
  if (m) return { ...w, label: `Spring ${m[1]}`, start: `${m[1]}-09-20`, end: `${m[1]}-11-30` };
  m = /^Fall (\d{4})$/.exec(w.label);
  if (m) return { ...w, label: `Fall ${m[1]}`, start: `${m[1]}-03-20`, end: `${m[1]}-05-31` };
  return w;
}

function southernIntent(intent: Intent): Intent {
  const t = intent.time;
  const today = new Date().toISOString().slice(0, 10);
  const clamp = <W extends { end: string }>(w: W): W => (w.end > today ? { ...w, end: today } : w);
  const f = (w: TimeWindow): TimeWindow => clamp(southernSeasons(w));
  if (t.kind === 'snapshot') return { ...intent, time: { ...t, window: f(t.window) } };
  if (t.kind === 'history') return { ...intent, time: { ...t, window: f(t.window) } };
  if (t.kind === 'compare') return { ...intent, time: { ...t, windows: [f(t.windows[0]), f(t.windows[1])] } };
  return { ...intent, time: { ...t, windows: t.windows.map(f) } };
}

export function planRoutes(intent: Intent, place: Place | null): PlanResult {
  if (place && (place.bbox[1] + place.bbox[3]) / 2 < -15) intent = southernIntent(intent);
  const warnings: string[] = [];
  const skipped: PlanResult['skipped'] = [];
  if (!place) warnings.push('Name a place (a county, city, park, lake or ocean) so the map knows where to look.');
  if (place?.note) warnings.push(place.note);
  const placeArea = place ? bboxAreaKm2(place.bbox) : 0;

  let cands = candidatesFor(intent);
  if (intent.station) {
    const named = STATION_BY_ID[intent.station];
    const already = cands.find((c) => c.station === intent.station);
    if (already) cands = [already, ...cands.filter((c) => c !== already)];
    else if (named?.live) {
      const sig = named.signals.includes(cands[0]?.signal) ? cands[0].signal : named.signals[0];
      if (sig) cands = [{ station: named.id, signal: sig }, ...cands];
    }
  }
  const wantsChange = intent.theme === 'forest-loss' || intent.theme === 'fire' || /\bchange|loss|lost|gain|warm(ed|ing)|cool(ed|ing)/i.test(intent.text);

  const stations = cands.map((c) => STATION_BY_ID[c.station]).filter(Boolean);
  const routes: Route[] = [];
  const penalty = new Map<string, number>();
  for (const c of cands) {
    const st = STATION_BY_ID[c.station];
    if (!st) continue;
    if (place && outsideCoverage(st, place.bbox)) {
      skipped.push({ station: st.id, reason: `${st.name} covers only ${st.coverage!.name}.` });
      continue;
    }
    const fit = windowsFor(st, intent);
    if (!fit) {
      const later = cands.map((o) => STATION_BY_ID[o.station]).find((o) => o && o.score.startYear < st.score.startYear);
      const ended = st.score.endYear !== null && intent.time.kind !== 'history';
      skipped.push({
        station: st.id,
        reason: ended && /\b(18|19|20)\d\d\b/.test(intent.text) && Number((intent.time.kind === 'compare' || intent.time.kind === 'yearly' ? intent.time.windows[0] : intent.time.window).start.slice(0, 4)) >= st.score.startYear
          ? `${st.name} ends in ${st.score.endYear} here, before the dates asked for.`
          : `${st.name} starts in ${st.score.startYear}, after the dates asked for${later ? `; transfer to ${later.name}` : ''}.`,
      });
      continue;
    }
    // Each dataset previews as much of the place as it can read quickly; export routes take it all.
    const cap = previewCap(st.id);
    const capped = place && st.live ? capBbox(place.bbox, cap) : place ? { bbox: place.bbox, capped: false } : null;
    const aoi = place ? { name: place.name, bbox: capped!.bbox, capped: capped!.capped, shape: place.shape } : { name: 'Pick a place', bbox: [0, 0, 0, 0] as Bbox };
    const methods = methodsFor(st, c.signal, wantsChange && fit.windows.length === 2);
    const output = st.provides === 'scene' ? (c.signal === 'true-color' ? 'image' : 'raster') : st.provides;
    const { views, notes: viewNotes } = chooseViews(st, intent, output, fit.windows.length);
    const route: Route = {
      id: `${st.id}-${c.signal}`,
      title: titleFor(st, c.signal),
      why: st.goodAt[0],
      station: st.id,
      signal: c.signal,
      methods,
      views: st.live ? views : ['layer'],
      windows: fit.windows,
      historyRange: fit.history,
      aoi,
      runs: st.live ? 'live' : 'export',
      tradeoffs: tradeoffs(st, stations),
      warnings: [...fit.notes, ...(st.live ? viewNotes : [`${st.name} isn't readable in the browser yet, so this route ends in an Earth Engine export.`])],
    };
    if (capped?.capped) {
      route.warnings.unshift(`${place!.name} is bigger than ${st.name} can preview quickly, so the live map covers its central ${Math.round(cap).toLocaleString('en-US')} km². The Earth Engine version covers all of it.`);
    }
    const note = THEME_NOTES[intent.theme];
    if (note) route.warnings.unshift(note);
    const check = checkRoute(route);
    if (!check.ok) {
      skipped.push({ station: st.id, reason: check.errors[0] });
      continue;
    }
    route.when = windowsSummary(route.windows, route.historyRange);
    const askedYears = /\b(18|19|20)\d\d\b/.test(intent.text);
    let p = 0;
    if (intent.time.kind === 'history') {
      // How much of the asked-for history the record covers.
      const want = [Number(intent.time.range.start.slice(0, 4)), Number(intent.time.range.end.slice(0, 4))];
      const have = [Math.max(want[0], st.score.startYear), Math.min(want[1], st.score.endYear ?? want[1])];
      const share = Math.max(0, have[1] - have[0] + 1) / Math.max(1, want[1] - want[0] + 1);
      if (share < 0.8) p += 1;
    } else if (fit.notes.some((n) => /starts in/.test(n) || /ends in/.test(n) || (askedYears && /closest years/.test(n)))) p += 1;
    // A dataset that can only show a sliver of a big place ranks below one that shows all of it.
    const ratio = place && st.live ? placeArea / cap : 0;
    // Asking about fields, farms or streets says detail matters more than seeing the whole place.
    const wantsDetail = /\b(fields?|farms?|parcels?|plots?|orchards?|neighbou?rhoods?|streets?|blocks?|detail(ed)?|zoom(ed)? in)\b/i.test(intent.text);
    if (!c.specific && ratio > (wantsDetail ? 50 : 4)) p += ratio > 50 && !wantsDetail ? 2 : 1;
    // One fixed map can't answer a question about particular dates (a flood, a drought year).
    if (st.temporal === 'static' && (intent.time.kind !== 'snapshot' || intent.theme === 'flood')) p += 2;
    // A stand-in ranks below the real thing when the person named the real thing.
    if (c.proxy && /soil moisture/i.test(intent.text)) p += 4;
    penalty.set(route.id, p);
    routes.push(route);
  }
  // Live first, then the best fit for the dates and the size of the place, keeping theme order otherwise.
  const rank = (r: Route) => (r.runs === 'live' ? 0 : 3) + (penalty.get(r.id) ?? 0);
  const sliver = (r: Route) => (place && r.runs === 'live' ? Math.max(1, placeArea / previewCap(r.station)) : 1);
  // Among equals, a dataset that shows far more of a big place (MODIS over Landsat for a state) leads.
  const detail = /\b(fields?|farms?|parcels?|plots?|orchards?|neighbou?rhoods?|streets?|blocks?|detail(ed)?|zoom(ed)? in)\b/i.test(intent.text);
  const specific = new Set(cands.filter((c) => c.specific).map((c) => `${c.station}-${c.signal}`));
  const farMore = (a: Route, b: Route) => {
    if (detail || specific.has(a.id) || specific.has(b.id)) return 0;
    const [x, y] = [sliver(a), sliver(b)];
    return (x > 4 || y > 4) && Math.max(x, y) / Math.min(x, y) > 3 ? x - y : 0;
  };
  routes.sort((a, b) => rank(a) - rank(b) || farMore(a, b));
  return { intent, place, routes: routes.slice(0, 3), skipped, warnings };
}
