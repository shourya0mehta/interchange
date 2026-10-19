import type { TimeWindow } from '../runtime/layers';
import type { ComponentId } from '../network/types';

/** What the person is asking about, independent of which dataset answers it. */
export type Theme =
  | 'vegetation'
  | 'cover-crop'
  | 'water'
  | 'flood'
  | 'fire'
  | 'snow'
  | 'built'
  | 'landcover'
  | 'terrain'
  | 'moisture'
  | 'imagery'
  | 'forest-loss'
  | 'air'
  | 'heat'
  | 'rain'
  | 'night-lights'
  | 'soil-moisture'
  | 'groundwater'
  | 'canopy-height'
  | 'ocean';

export const THEMES: Theme[] = [
  'vegetation', 'cover-crop', 'water', 'flood', 'fire', 'snow', 'built', 'landcover', 'terrain', 'moisture',
  'imagery', 'forest-loss', 'air', 'heat', 'rain', 'night-lights', 'soil-moisture', 'groundwater', 'canopy-height', 'ocean',
];

export type Season = 'summer' | 'winter' | 'spring' | 'fall' | 'growing' | 'early-spring' | 'post-harvest';

export interface Intent {
  text: string;
  place: string | null;
  theme: Theme;
  /** Explicitly named sensor, if any. */
  station: string | null;
  views: ComponentId[];
  /** How time was asked about. */
  time:
    | { kind: 'snapshot'; window: TimeWindow }
    | { kind: 'compare'; windows: [TimeWindow, TimeWindow] }
    | { kind: 'yearly'; windows: TimeWindow[] }
    | { kind: 'history'; window: TimeWindow; range: { start: string; end: string } };
  season: Season | null;
  /** Words the parser used, for the "why this route" note. */
  matched: string[];
}

// ---- Themes --------------------------------------------------------------------------

const THEME_CUES: [Theme, RegExp][] = [
  ['cover-crop', /\bcover[- ]?crops?\b|\bbare (soil|fields?)\b|\bstayed bare\b|\bwinter (cover|rye|wheat)\b/i],
  // "How much of X is crops/forest?" asks for class areas, which land cover answers directly.
  ['landcover', /\b(how much|what share|what percent(age)?|share of|percent(age)? of)\b.*\b(crops?|cropland|farmland|forest(ed)?|trees|tree cover|wetlands?|grassland|rangeland)\b/i],
  ['flood', /\bflood(s|ed|ing)?\b|\binundat\w*|\bstorm surge\b|\bunder water\b/i],
  ['fire', /\b(wild)?fires?\b|\bburn(ed|t|ing| scars?| severity)?\b|\bblaze\b/i],
  ['forest-loss', /\bdeforest\w*|\bforest (loss|cover loss|change)\b|\btree (loss|cover loss)\b|\bclear[- ]?cut\w*|\blogging\b/i],
  ['snow', /\bsnow\w*|\bsnowpack\b|\bglacier\w*|\bice cover\b|\bsea ice\b/i],
  ['night-lights', /\bnight ?lights?\b|\bpower outages?\b|\bblackouts?\b|\blights at night\b/i],
  ['air', /\bair (quality|pollution)\b|\bno2\b|\bnitrogen dioxide\b|\bsmog\b|\bemissions?\b|\bmethane\b/i],
  ['heat', /\bheat( islands?| waves?)?\b|\bsurface temperature\b|\bhottest\b|\bland surface temp\w*/i],
  ['rain', /\brain(fall)?\b|\bprecip\w*|\bmonsoon\b/i],
  ['soil-moisture', /\bsoil moisture\b|\bdrought\b/i],
  ['groundwater', /\bgroundwater\b|\baquifers?\b|\bwater table\b/i],
  ['canopy-height', /\bcanopy height\b|\btree height\b|\bforest height\b|\bhow tall\b/i],
  ['ocean', /\bocean (heat|temperature)\b|\bsea surface\b|\bsalinity\b|\bargo\b/i],
  ['built', /\burban\w*|\bsprawl\b|\bbuilt[- ]?(up|area)?\b|\bdevelopment\b|\bconstruction\b|\bnew (homes|housing|buildings)\b|\bsolar farms?\b|\bdata cent(er|re)s?\b/i],
  ['landcover', /\bland ?cover\b|\bland ?use\b|\bhabitat types?\b|\bwhat covers\b/i],
  ['terrain', /\belevation\b|\bterrain\b|\btopograph\w*|\bslopes?\b|\bhills?\b|\bmountains?\b|\bdem\b/i],
  ['moisture', /\b(plant|crop|leaf|vegetation) (water|moisture|stress)\b|\bwater stress\b|\bndmi\b/i],
  ['water', /\blakes?\b|\breservoirs?\b|\brivers?\b|\bshorelines?\b|\bwetlands?\b|\bsurface water\b|\bponds?\b|\bwater (level|extent)\b|\bndwi\b/i],
  ['imagery', /\btrue colou?r\b|\bsatellite (photo|picture|image|view)s?\b|\bwhat (it|the area) looks? like\b|\bimagery\b/i],
  ['vegetation', /\bgreen(ness|ing|er)?\b|\bvegetation\b|\bndvi\b|\bcrops?\b|\bfarm\w*|\bfields?\b|\bforests?\b|\btrees?\b|\bplants?\b|\bharvest\w*|\bpastures?\b|\bgrass\w*|\bparks?\b/i],
];

const STATION_CUES: [string, RegExp][] = [
  ['sentinel-2', /\bsentinel[- ]?2\b|\bs2\b/i],
  ['sentinel-1', /\bsentinel[- ]?1\b|\bs1\b|\bradar\b|\bsar\b/i],
  ['landsat', /\blandsat\b/i],
  ['modis-vi', /\bmodis\b/i],
  ['esa-worldcover', /\bworld ?cover\b/i],
  ['io-lulc', /\bimpact observatory\b|\besri land cover\b/i],
  ['cop-dem', /\bcopernicus dem\b/i],
  ['jrc-water', /\bjrc\b|\bglobal surface water\b/i],
];

// ---- Views ---------------------------------------------------------------------------

const VIEW_CUES: [ComponentId, RegExp][] = [
  ['swipe', /\bbefore and after\b|\bbefore\/after\b|\bcompare\b|\bcompared\b|\bvs\.?\b|\bversus\b|\bswipe\b|\bside by side\b|\bhow (much )?(has|have|did) .* change/i],
  ['time-slider', /\beach year\b|\bevery year\b|\b(?:each|every) (?:spring|summer|fall|autumn|winter|season|growing season)\b|\byear by year\b|\bmonth by month\b|\bslider\b|\banimat\w*|\bstep through\b|\bper year\b|\byearly\b|\bover the years\b/i],
  ['click-chart', /\bclick\b|\bhistory\b|\bover time\b|\btime ?series\b|\btrends?\b|\bchart\b|\bthrough the (year|season)\b/i],
  ['region-stats', /\bhow (much|many)\b|\bpercent(age)?\b|\bshare of\b|\bacres\b|\bhectares\b|\bstat(istic)?s\b|\baverage\b|\btotal area\b|\bsummar(y|ize)\b/i],
  ['download', /\bdownload\b|\bexport\b|\bgeotiff\b|\bcsv\b|\bsave the (map|data)\b/i],
];

// ---- Time ----------------------------------------------------------------------------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function seasonWindow(season: Season, year: number): TimeWindow {
  switch (season) {
    case 'summer':
      return { label: `Summer ${year}`, start: iso(year, 6, 15), end: iso(year, 8, 31) };
    case 'growing':
      return { label: `Growing season ${year}`, start: iso(year, 5, 1), end: iso(year, 9, 30) };
    case 'spring':
      return { label: `Spring ${year}`, start: iso(year, 3, 20), end: iso(year, 5, 31) };
    case 'early-spring':
      return { label: `Early spring ${year}`, start: iso(year, 3, 25), end: iso(year, 5, 5) };
    case 'fall':
      return { label: `Fall ${year}`, start: iso(year, 9, 15), end: iso(year, 11, 15) };
    case 'post-harvest':
      return { label: `After harvest ${year}`, start: iso(year, 10, 20), end: iso(year, 12, 10) };
    case 'winter':
      return { label: `Winter ${year}-${String(year + 1).slice(2)}`, start: iso(year, 12, 1), end: iso(year + 1, 2, lastDay(year + 1, 2)) };
  }
}

function monthIndex(word: string): number {
  return MONTHS.indexOf(word.slice(0, 3).toLowerCase()) + 1;
}

function monthWindow(m: number, y: number): TimeWindow {
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return { label: `${name} ${y}`, start: iso(y, m, 1), end: iso(y, m, lastDay(y, m)) };
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The most recent season that has fully ended (or is underway, for its data so far). */
function latestSeasonYear(season: Season, now: Date): number {
  const y = now.getUTCFullYear();
  const w = seasonWindow(season, y);
  const today = now.toISOString().slice(0, 10);
  if (season === 'winter') return today >= iso(y, 12, 20) ? y : y - 1;
  return today >= addDays(w.start, 21) ? y : y - 1;
}

function clampEnd(w: TimeWindow, now: Date): TimeWindow {
  const today = now.toISOString().slice(0, 10);
  return w.end > today ? { ...w, end: today } : w;
}

function detectSeason(text: string, theme: Theme): Season | null {
  if (/\bafter (the )?harvest\b|\bpost[- ]harvest\b/i.test(text)) return 'post-harvest';
  if (/\bgrowing season\b/i.test(text)) return 'growing';
  if (/\bwinter\b/i.test(text) && theme !== 'cover-crop') return 'winter';
  if (/\bspring\b/i.test(text)) return 'spring';
  if (/\b(fall|autumn)\b/i.test(text)) return 'fall';
  if (/\bsummer\b/i.test(text)) return 'summer';
  if (theme === 'cover-crop') return 'early-spring';
  if (theme === 'snow') return 'winter';
  return null;
}

function defaultSeason(theme: Theme): Season {
  if (theme === 'snow') return 'winter';
  if (theme === 'cover-crop') return 'early-spring';
  if (theme === 'fire') return 'summer';
  return 'summer';
}

interface ParsedTime {
  years: number[];
  since: number | null;
  range: [number, number] | null;
  months: { m: number; y: number }[];
  relative: 'this' | 'last' | null;
}

function parseYears(text: string, now: Date): ParsedTime {
  const t = text.toLowerCase();
  const out: ParsedTime = { years: [], since: null, range: null, months: [], relative: null };
  const sinceM = /\b(?:since|from|after) (19[89]\d|20\d\d)\b(?! ?(?:to|-|–|and|through|until))/.exec(t);
  if (sinceM) out.since = Number(sinceM[1]);
  const rangeM = /\b(?:from |between )?(19[89]\d|20\d\d) ?(?:to|-|–|and|through|until) ?(19[89]\d|20\d\d)\b/.exec(t);
  if (rangeM) {
    const a = Number(rangeM[1]);
    const b = Number(rangeM[2]);
    out.range = [Math.min(a, b), Math.max(a, b)];
  }
  const monthRe = new RegExp(`\\b${MONTH_RE}\\.? (19[89]\\d|20\\d\\d)\\b`, 'gi');
  for (const m of t.matchAll(monthRe)) out.months.push({ m: monthIndex(m[1]), y: Number(m[2]) });
  for (const m of t.matchAll(/\b(19[89]\d|20\d\d)\b/g)) out.years.push(Number(m[1]));
  if (/\bthis (year|summer|winter|spring|fall|season)\b/.test(t)) out.relative = 'this';
  if (/\blast (year|summer|winter|spring|fall|season)\b/.test(t)) out.relative = 'last';
  const y = now.getUTCFullYear();
  out.years = out.years.filter((v) => v <= y);
  return out;
}

export function parseTime(
  text: string,
  theme: Theme,
  views: ComponentId[],
  now: Date,
): { time: Intent['time']; season: Season | null } {
  const season = detectSeason(text, theme);
  const s = season ?? defaultSeason(theme);
  const p = parseYears(text, now);
  const thisYear = now.getUTCFullYear();
  const latest = latestSeasonYear(s, now);
  const today = now.toISOString().slice(0, 10);

  // A named event month: "before and after the August 2023 flood".
  const eventMonth = p.months.length === 1 && /\b(before|after)\b/i.test(text) ? p.months[0] : null;
  if (eventMonth && (views.includes('swipe') || /before|after/i.test(text))) {
    const eventStart = iso(eventMonth.y, eventMonth.m, 1);
    const before: TimeWindow = { label: `Before (${monthWindow(eventMonth.m, eventMonth.y).label})`, start: addDays(eventStart, -75), end: addDays(eventStart, -1) };
    const afterSpan = theme === 'flood' ? 20 : 60;
    const after = clampEnd({ label: `After (${monthWindow(eventMonth.m, eventMonth.y).label})`, start: eventStart, end: addDays(iso(eventMonth.y, eventMonth.m, lastDay(eventMonth.y, eventMonth.m)), afterSpan - 30) }, now);
    return { time: { kind: 'compare', windows: [before, after] }, season };
  }

  const yearlyAsked = views.includes('time-slider');
  const historyAsked = views.includes('click-chart');
  const compareAsked = views.includes('swipe');

  let first: number | null = p.range?.[0] ?? p.since ?? (p.years.length ? Math.min(...p.years) : null);
  let last: number = p.range?.[1] ?? (p.years.length > 1 && !p.since ? Math.max(...p.years) : latest);
  if (p.relative === 'last') last = Math.min(last, latest - (latest === thisYear ? 1 : 0));
  if (first !== null && first > last) first = last;

  if (yearlyAsked) {
    const startYear = first ?? last - 5;
    const years: number[] = [];
    for (let y = startYear; y <= last; y++) years.push(y);
    const step = Math.ceil(years.length / 8);
    const picked = years.filter((_, i) => i % step === 0 || i === years.length - 1).slice(-8);
    return { time: { kind: 'yearly', windows: picked.map((y) => clampEnd(seasonWindow(s, y), now)) }, season };
  }

  if (compareAsked) {
    const a = first ?? last - 6;
    const b = last;
    if (p.months.length >= 2) {
      const [m1, m2] = p.months;
      return { time: { kind: 'compare', windows: [monthWindow(m1.m, m1.y), clampEnd(monthWindow(m2.m, m2.y), now)] }, season };
    }
    return { time: { kind: 'compare', windows: [seasonWindow(s, a === b ? b - 1 : a), clampEnd(seasonWindow(s, b), now)] }, season };
  }

  if (historyAsked || first !== null) {
    const start = first !== null ? iso(first, 1, 1) : iso(last - 1, 1, 1);
    const end = p.range ? iso(last, 12, 31) : today;
    return {
      time: { kind: 'history', window: clampEnd(seasonWindow(s, last), now), range: { start, end: end > today ? today : end } },
      season,
    };
  }

  if (p.months.length === 1) {
    return { time: { kind: 'snapshot', window: clampEnd(monthWindow(p.months[0].m, p.months[0].y), now) }, season };
  }
  const y = p.years.length === 1 ? p.years[0] : latest;
  return { time: { kind: 'snapshot', window: clampEnd(seasonWindow(s, y), now) }, season };
}

// ---- Place ---------------------------------------------------------------------------

/** Pulls the place phrase out of a goal: "...fields in Tompkins County, NY since 2018" -> "Tompkins County, NY". */
export function parsePlace(text: string): string | null {
  const re = /\b(?:in|for|around|near|across|over|of|at)\s+((?:the\s+)?[A-Z][\w.'-]*(?:(?:,\s*|\s+)(?:[A-Z][\w.'-]*|of|de|la|del|the|and(?=\s+[A-Z])))*)/g;
  const candidates: string[] = [];
  for (const m of text.matchAll(re)) {
    const phrase = m[1].replace(/^the\s+/i, '').replace(/[,\s]+$/, '').trim();
    if (phrase && !/^(January|February|March|April|May|June|July|August|September|October|November|December|Summer|Winter|Spring|Fall|NDVI|Sentinel|Landsat|MODIS)\b/i.test(phrase)) {
      candidates.push(phrase);
    }
  }
  if (!candidates.length) {
    // No preposition: fall back to the longest run of capitalized words that isn't a command.
    const runs = text.match(/\b[A-Z][\w.'-]*(?:\s+(?:[A-Z][\w.'-]*|of|de|la|del))*/g) ?? [];
    for (const r of runs) {
      const cleaned = r.replace(LEADING_COMMAND, '').trim();
      if (cleaned && !NOT_PLACES.test(cleaned)) candidates.push(cleaned);
    }
  }
  if (!candidates.length) return null;
  // Prefer the longest capitalized phrase (most specific).
  return candidates.sort((a, b) => b.length - a.length)[0];
}

const LEADING_COMMAND = /^(?:Show|Map|Compare|How|What|Where|Which|When|Is|Are|Did|Find|Track|Watch|Make|Build|Give|Chart|Plot|See|Monitor|Measure|I|We|Can|Please)\b\s*/;
const NOT_PLACES = /^(?:NDVI|NDWI|NBR|Sentinel(?:-\d)?|Landsat|MODIS|Earth Engine|Click|Summer|Winter|Spring|Fall|January|February|March|April|May|June|July|August|September|October|November|December)$/i;

// ---- Entry point ---------------------------------------------------------------------

export function parseGoal(text: string, now: Date = new Date()): Intent {
  const matched: string[] = [];
  let theme: Theme = 'vegetation';
  for (const [t, re] of THEME_CUES) {
    const m = re.exec(text);
    if (m) {
      theme = t;
      matched.push(m[0]);
      break;
    }
  }
  let station: string | null = null;
  for (const [id, re] of STATION_CUES) {
    if (re.test(text)) {
      station = id;
      break;
    }
  }
  if (station === 'sentinel-1' && theme === 'vegetation') theme = 'flood';
  const views: ComponentId[] = [];
  for (const [v, re] of VIEW_CUES) {
    const m = re.exec(text);
    if (m) {
      views.push(v);
      matched.push(m[0]);
    }
  }
  if (/\bsince (19|20)\d\d\b/i.test(text) && !views.includes('time-slider') && !views.includes('swipe') && !views.includes('click-chart')) {
    views.push('click-chart');
  }
  const { time, season } = parseTime(text, theme, views, now);
  return { text, place: parsePlace(text), theme, station, views, time, season, matched };
}
