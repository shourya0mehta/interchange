import { capBbox, type Bbox } from '../runtime/geo';
import type { TimeWindow } from '../runtime/layers';
import type { Signal } from '../runtime/sources';
import { COMPONENT_BY_ID, SIGNAL_NAMES, STATION_BY_ID } from '../network/network';
import { checkRoute } from '../network/typecheck';
import type { ComponentId, MethodId, Route, Station, Tradeoff } from '../network/types';
import type { Intent, Theme } from './intent';

/** Live previews are capped to keep reads small; bigger areas export. */
export const PREVIEW_MAX_KM2 = 3000;

export interface Place {
  name: string;
  bbox: Bbox;
}

export type Geocoder = (query: string, signal?: AbortSignal) => Promise<Place | null>;

interface Candidate {
  station: string;
  signal: Signal;
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
  water: [
    { station: 'sentinel-2', signal: 'mndwi' },
    { station: 'jrc-water', signal: 'water-occurrence' },
    { station: 'landsat', signal: 'mndwi' },
    { station: 'sentinel-1', signal: 'radar-vv' },
  ],
  flood: [
    { station: 'sentinel-1', signal: 'radar-vv' },
    { station: 'sentinel-2', signal: 'mndwi' },
    { station: 'jrc-water', signal: 'water-occurrence' },
  ],
  fire: [
    { station: 'sentinel-2', signal: 'nbr' },
    { station: 'landsat', signal: 'nbr' },
    { station: 'firms', signal: 'native' },
  ],
  snow: [
    { station: 'sentinel-2', signal: 'ndsi' },
    { station: 'landsat', signal: 'ndsi' },
    { station: 'modis-snow', signal: 'native' },
  ],
  built: [
    { station: 'io-lulc', signal: 'landcover' },
    { station: 'sentinel-2', signal: 'ndbi' },
    { station: 'viirs-night', signal: 'native' },
  ],
  landcover: [
    { station: 'io-lulc', signal: 'landcover' },
    { station: 'esa-worldcover', signal: 'landcover' },
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
    { station: 'hansen', signal: 'native' },
  ],
  air: [{ station: 's5p', signal: 'native' }],
  heat: [{ station: 'modis-lst', signal: 'native' }],
  rain: [
    { station: 'chirps', signal: 'native' },
    { station: 'era5', signal: 'native' },
  ],
  'night-lights': [{ station: 'viirs-night', signal: 'native' }],
  'soil-moisture': [
    { station: 'smap', signal: 'native' },
    { station: 'era5', signal: 'native' },
  ],
  groundwater: [{ station: 'grace', signal: 'native' }],
  'canopy-height': [{ station: 'gedi', signal: 'native' }],
  ocean: [{ station: 'argo', signal: 'native' }],
};

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
  } else if (st.temporal === 'composite') m.push('composite-mean');
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
  for (const w of base) {
    const wy = Number(w.end.slice(0, 4));
    if (wy < start) return null;
    if (end !== null && Number(w.start.slice(0, 4)) > end) return null;
  }
  let history: { start: string; end: string } | undefined;
  if (t.kind === 'history') {
    history = { ...t.range };
    if (Number(history.start.slice(0, 4)) < start) {
      history.start = `${start}-01-01`;
      notes.push(`${st.name} history starts in ${start}.`);
    }
  }
  return { windows: base, history, notes };
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

/** Turns a parsed goal and a place into ranked, type-checked candidate routes. */
export function planRoutes(intent: Intent, place: Place | null): PlanResult {
  const warnings: string[] = [];
  const skipped: PlanResult['skipped'] = [];
  if (!place) warnings.push('Name a place (a county, city, park or watershed) so the map knows where to look.');
  const capped = place ? capBbox(place.bbox, PREVIEW_MAX_KM2) : null;
  if (capped?.capped) {
    warnings.push(`${place!.name} is large, so the live preview covers its central ${PREVIEW_MAX_KM2.toLocaleString('en-US')} km². Export the route for the full area.`);
  }
  const aoi = place ? { name: place.name, bbox: capped!.bbox, capped: capped!.capped } : { name: 'Pick a place', bbox: [0, 0, 0, 0] as Bbox };

  let cands = [...THEME_CANDIDATES[intent.theme]];
  if (intent.station) {
    const named = STATION_BY_ID[intent.station];
    const already = cands.find((c) => c.station === intent.station);
    if (already) cands = [already, ...cands.filter((c) => c !== already)];
    else if (named?.live) {
      const sig = named.signals.includes(cands[0]?.signal) ? cands[0].signal : named.signals[0];
      if (sig) cands = [{ station: named.id, signal: sig }, ...cands];
    }
  }
  const wantsChange = intent.theme === 'forest-loss' || intent.theme === 'fire' || /\bchange|loss|lost|gain/i.test(intent.text);

  const stations = cands.map((c) => STATION_BY_ID[c.station]).filter(Boolean);
  const routes: Route[] = [];
  const partial = new Set<string>();
  for (const c of cands) {
    const st = STATION_BY_ID[c.station];
    if (!st) continue;
    const fit = windowsFor(st, intent);
    if (!fit) {
      const later = cands.map((o) => STATION_BY_ID[o.station]).find((o) => o && o.score.startYear < st.score.startYear);
      skipped.push({
        station: st.id,
        reason: `${st.name} starts in ${st.score.startYear}, after the dates asked for${later ? `; transfer to ${later.name}` : ''}.`,
      });
      continue;
    }
    const methods = methodsFor(st, c.signal, wantsChange && fit.windows.length === 2);
    const output = st.provides === 'scene' ? (c.signal === 'true-color' ? 'image' : 'raster') : st.provides;
    const { views, notes: viewNotes } = chooseViews(st, intent, output, fit.windows.length);
    const route: Route = {
      id: `${st.id}-${c.signal}`,
      title: `${st.name}, ${SIGNAL_NAMES[c.signal]?.long ?? c.signal}`,
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
    const note = THEME_NOTES[intent.theme];
    if (note) route.warnings.unshift(note);
    const check = checkRoute(route);
    if (!check.ok) {
      skipped.push({ station: st.id, reason: check.errors[0] });
      continue;
    }
    route.when = windowsSummary(route.windows, route.historyRange);
    const askedYears = /\b(19|20)\d\d\b/.test(intent.text);
    if (fit.notes.some((n) => /starts in/.test(n) || (askedYears && /closest years/.test(n)))) partial.add(route.id);
    routes.push(route);
  }
  // Live first, then routes that cover every date asked for, keeping theme order otherwise.
  const rank = (r: Route) => (r.runs === 'live' ? 0 : 2) + (partial.has(r.id) ? 1 : 0);
  routes.sort((a, b) => rank(a) - rank(b));
  return { intent, place, routes: routes.slice(0, 3), skipped, warnings };
}
