import type { TimeWindow } from '../runtime/layers';
import type { ComponentId } from '../network/types';
import { EVENTS, eventIn, regionIn } from './gazetteer';

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
  | 'crop-type'
  | 'ocean';

export const THEMES: Theme[] = [
  'vegetation', 'cover-crop', 'water', 'flood', 'fire', 'snow', 'built', 'landcover', 'terrain', 'moisture',
  'imagery', 'forest-loss', 'air', 'heat', 'rain', 'night-lights', 'soil-moisture', 'groundwater', 'canopy-height', 'crop-type', 'ocean',
];

/** How each theme reads back to the person, in their words. */
export const THEME_WORDS: Record<Theme, string> = {
  vegetation: 'greenness',
  'cover-crop': 'winter cover on fields',
  water: 'surface water',
  flood: 'flooding',
  fire: 'fire',
  snow: 'snow',
  built: 'built-up land',
  landcover: 'land cover',
  terrain: 'terrain',
  moisture: 'plant moisture',
  imagery: 'what the ground looks like',
  'forest-loss': 'forest loss',
  air: 'air quality',
  heat: 'heat',
  rain: 'rain',
  'night-lights': 'night lights',
  'soil-moisture': 'soil moisture',
  groundwater: 'groundwater',
  'canopy-height': 'canopy height',
  'crop-type': 'which crops grow',
  ocean: 'ocean temperature',
};

export type Season = 'summer' | 'winter' | 'spring' | 'fall' | 'growing' | 'early-spring' | 'post-harvest' | 'year';

export interface Intent {
  text: string;
  place: string | null;
  /** Other place phrases, best first, tried when the first can't be found. */
  places: string[];
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

/** Temperature, including the usual misspellings (temprature, temeprature, tempreture). */
const TEMP = String.raw`(?:temp(?:s|erature?s?)?|tem\w{0,4}ture?s?|tmp)`;
const CROPS = String.raw`(?:corn|maize|soy(?:beans?)?|wheat|cotton|rice|sorghum|alfalfa|almonds?|pistachios?|walnuts?|orchards?|vineyards?|grapes|potatoes|sugar ?beets|peanuts|canola|barley|oats|citrus|cranberr(?:y|ies)|blueberr(?:y|ies)|hay)`;

export const THEME_CUES: [Theme, RegExp][] = [
  ['cover-crop', /\bcover[- ]?crops?\b|\bbare (soil|fields?)\b|\bstayed bare\b|\bwinter (cover|rye)\b/i],
  ['crop-type', new RegExp(String.raw`\b(what|which) (kinds? of |types? of )?crops?\b|\bcrop (types?|maps?|mix|rotations?|classes)\b|\btypes? of crops?\b|\bwhat(?: is|'s| was| gets?| got| are) (grown|planted|farmed)\b|\b(grown|planted|farmed) (in|around|near|across)\b|\bwhere .*\b(grown|planted)\b|\b${CROPS}\b(?! belt)`, 'i')],
  // "How much forest did Brazil lose": loss, not a share.
  ['forest-loss', /\b(forests?|trees?|rain ?forests?|jungle)\b.*\b(lose|lost|loss|losing|cut down|cleared|disappear\w*)\b|\b(lose|lost|loss of|losing)\b.*\b(forests?|trees|rain ?forests?)\b/i],
  // "How much of X is forest?" asks for class areas, which land cover answers directly.
  ['landcover', /\b(how much|what share|what percent(age)?|share of|percent(age)? of)\b.*\b(cropland|farmland|forest(ed)?|trees|tree cover|wetlands?|grassland|rangeland|shrubland|bare)\b/i],
  ['ocean', new RegExp(String.raw`\bsea[- ]surface\b|\bsst\b|\b(ocean|sea|marine|gulf|bay|water) ${TEMP}|\b${TEMP} of the (ocean|sea|gulf)\b|\bocean (heat|warming)\b|\bmarine heat ?waves?\b|\bcoral bleaching\b|\bsalinity\b|\bargo\b|\bel ni[nñ]o\b|\bla ni[nñ]a\b`, 'i')],
  ['flood', /\bflood(s|ed|ing)?\b|\binundat\w*|\bstorm surge\b|\bunder water\b|\bunderwater\b/i],
  ['fire', /\b(wild)?fires?\b|\bburn(ed|t|ing| scars?| severity)?\b|\bblaze\b|\bhot ?spots?\b/i],
  ['forest-loss', /\bdeforest\w*|\bforest (loss|cover loss|change)\b|\btree (loss|cover loss)\b|\bclear[- ]?cut\w*|\blogging\b/i],
  ['snow', /\bsnow\w*|\bglacier\w*|\bice cover\b|\bsea ice\b|\bski season\b/i],
  ['night-lights', /\bnight ?lights?\b|\bpower outages?\b|\bblackouts?\b|\blights at night\b/i],
  ['air', /\bair (quality|pollution)\b|\bno2\b|\bnitrogen dioxide\b|\bsmog\b|\bemissions?\b|\bmethane\b/i],
  ['heat', new RegExp(String.raw`\bheat( islands?| waves?| stress)?\b|\blst\b|\bland surface temp\w*|\b${TEMP}\b|\bhot(ter|test)?\b|\bcold(er|est)?\b|\bcoolest\b|\bfreezing\b|\bwarm(ed|ing|er|est|th)?\b`, 'i')],
  ['rain', /\brain(fall|y)?\b|\bprecip\w*|\bmonsoon\b|\bwettest\b|\bdriest\b/i],
  ['soil-moisture', /\bsoil moisture\b|\bdrought\b|\bhow dry\b|\bdry (spell|conditions|year|summer|season)\b|\bdryness\b|\baridity\b/i],
  ['groundwater', /\bgroundwater\b|\baquifers?\b|\bwater table\b/i],
  ['canopy-height', /\bcanopy height\b|\btree height\b|\bforest height\b|\bhow tall\b/i],
  ['built', /\burban\w*|\bsprawl\b|\bbuilt[- ]?(up|area)?\b|\bdevelopment\b|\bconstruction\b|\bnew (homes|housing|buildings)\b|\bsolar farms?\b|\bdata cent(er|re)s?\b|\bimpervious\b/i],
  ['landcover', /\bland ?cover\b|\bland ?use\b|\bhabitat types?\b|\bwhat covers\b/i],
  ['terrain', /\belevation\b|\bterrain\b|\btopograph\w*|\bslopes?\b|\bhills?\b|\bmountains?\b|\bdem\b|\bhow high\b/i],
  ['moisture', /\b(plant|crop|leaf|vegetation) (water|moisture|stress)\b|\bwater stress\b|\bndmi\b/i],
  ['water', /\blakes?\b|\breservoirs?\b|\brivers?\b|\bshorelines?\b|\bwetlands?\b|\bsurface water\b|\bponds?\b|\bwater (level|extent)s?\b|\bndwi\b|\bdried up\b/i],
  ['imagery', /\btrue colou?r\b|\bsatellite (photo|picture|image|view)s?\b|\blooks? like\b|\bimagery\b|\bphotos?\b|\bpictures?\b/i],
  ['vegetation', /\bgree\w*n\w*|\bgreen\w*|\bvegetation\b|\bndvi\b|\bcrops?\b|\bfarm\w*|\bfields?\b|\bforests?\b|\btrees?\b|\bplants?\b|\bharvest\w*|\bpastures?\b|\bgrass\w*|\bparks?\b/i],
];

export const STATION_CUES: [string, RegExp][] = [
  ['sentinel-2', /\bsentinel[- ]?2\b|\bs2\b/i],
  ['sentinel-1', /\bsentinel[- ]?1\b|\bs1\b|\bradar\b|\bsar\b/i],
  ['landsat', /\blandsat\b/i],
  ['modis-vi', /\bmodis\b/i],
  ['esa-worldcover', /\bworld ?cover\b/i],
  ['io-lulc', /\bimpact observatory\b|\besri land cover\b/i],
  ['cop-dem', /\bcopernicus dem\b/i],
  ['jrc-water', /\bjrc\b|\bglobal surface water\b/i],
  ['oisst', /\boisst\b|\breynolds\b/i],
  ['usda-cdl', /\bcdl\b|\bcropland data layer\b/i],
  ['esa-cci-lc', /\besa cci\b|\bcci land ?cover\b/i],
  ['nclimgrid', /\bnclimgrid\b/i],
  ['modis-lst', /\bmod11\b/i],
];

// ---- Views ---------------------------------------------------------------------------

export const VIEW_CUES: [ComponentId, RegExp][] = [
  ['swipe', /\bbefore and after\b|\bbefore\/after\b|\bcompare\b|\bcompared\b|\bvs\.?\b|\bversus\b|\bswipe\b|\bside by side\b|\bhow (much )?(has|have|did) .* change|\b(shrink(s|ing)?|shrunk(en)?|shrank|retreat(s|ing|ed)?|disappear(s|ing|ed)?|dr(ying|ied) up|recover(ed|ing|y)?|regrow\w*|expand(s|ing|ed)?)\b|\bgrowing\b(?! season)|\b(hotter|colder|warmer|cooler|wetter|drier|greener|browner|bigger|smaller|worse|better) than\b/i],
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
    case 'year':
      return { label: String(year), start: iso(year, 1, 1), end: iso(year, 12, 31) };
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
  // A whole year is the last one that has ended.
  if (season === 'year') return y - 1;
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

function defaultSeason(theme: Theme, text = ''): Season {
  if (theme === 'snow') return 'winter';
  if (theme === 'cover-crop') return 'early-spring';
  // Rain in a year means the year's total; fires burn into the fall, so a year of fires is the
  // whole year. Burn scars still read best in a summer window.
  if (theme === 'rain') return 'year';
  if (theme === 'fire' && !/\b(burn(ed)? (scars?|severity|area)|nbr|before and after)\b/i.test(text)) return 'year';
  return 'summer';
}

interface ParsedTime {
  years: number[];
  since: number | null;
  range: [number, number] | null;
  months: { m: number; y: number }[];
  relative: 'this' | 'last' | null;
  /** "right now", "currently": the latest few weeks rather than a season. */
  now: boolean;
}

function parseYears(text: string, now: Date): ParsedTime {
  // "summer '19" and "'05 to '09": two-digit years with an apostrophe become full years.
  const t = text.toLowerCase().replace(/[‘’'](\d\d)\b/g, (_, yy: string) => {
    const n = Number(yy);
    return String(n <= now.getUTCFullYear() % 100 ? 2000 + n : 1900 + n);
  });
  const out: ParsedTime = { years: [], since: null, range: null, months: [], relative: null, now: false };
  const sinceM =
    /\b(?:since|from|after) (1[89]\d\d|20\d\d)\b(?! ?(?:to|-|–|and|through|until) ?(?:1[89]|20)\d\d)/.exec(t) ??
    /\b(1[89]\d\d|20\d\d) ?(?:-|–|to|until|through|till) ?(?:now|present|today|current|this year)\b/.exec(t) ??
    /\b(1[89]\d\d|20\d\d) (?:on(?:ward)?s?|and (?:on|after|later))\b/.exec(t);
  if (sinceM) out.since = Number(sinceM[1]);
  const rangeM = /\b(?:from |between )?(1[89]\d\d|20\d\d) ?(?:to|-|–|and|through|until) ?(1[89]\d\d|20\d\d)\b/.exec(t);
  if (rangeM) {
    const a = Number(rangeM[1]);
    const b = Number(rangeM[2]);
    out.range = [Math.min(a, b), Math.max(a, b)];
  }
  // "Since the 1990s" starts there; "in the 1990s" is those ten years.
  const decade = /\b(since |from |after )?(?:the )?(1[89]\d0|20[0-2]0)'?s\b/.exec(t);
  if (decade && !out.range && !out.since) {
    const d = Number(decade[2]);
    if (decade[1]) out.since = d;
    else out.range = [d, Math.min(d + 9, now.getUTCFullYear())];
  }
  const WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50 };
  const past = /\b(?:past|last|previous) (\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|fifty) years\b/.exec(t);
  if (past && !out.range && !out.since) out.since = now.getUTCFullYear() - (Number(past[1]) || WORDS[past[1]]);
  if (/\b(?:past|last) decade\b/.test(t) && !out.range && !out.since) out.since = now.getUTCFullYear() - 10;
  const monthRe = new RegExp(`\\b${MONTH_RE}\\.? (1[89]\\d\\d|20\\d\\d)\\b`, 'gi');
  for (const m of t.matchAll(monthRe)) out.months.push({ m: monthIndex(m[1]), y: Number(m[2]) });
  // "in July" with no year: the most recent July that has ended (or this one, once it's half over).
  const bareMonth = new RegExp(`\\b(?:in|during|of|early|late|mid|last|this) ${MONTH_RE}\\b(?!\\.? ?(?:1[89]|20)\\d\\d)`, 'i').exec(t);
  if (bareMonth && !out.months.length && !/\b(1[89]\d\d|20\d\d)\b/.test(t)) {
    const m = monthIndex(bareMonth[1]);
    const y = now.getUTCFullYear();
    out.months.push({ m, y: m < now.getUTCMonth() + 1 || (m === now.getUTCMonth() + 1 && now.getUTCDate() >= 15) ? y : y - 1 });
  }
  for (const m of t.matchAll(/\b(1[89]\d\d|20\d\d)\b/g)) out.years.push(Number(m[1]));
  if (/\bthis (year|summer|winter|spring|fall|season)\b/.test(t)) out.relative = 'this';
  if (/\blast (year|summer|winter|spring|fall|season)\b/.test(t)) out.relative = 'last';
  out.now = /\b(right now|currently|at the moment|these days|this week|this month|today|latest|most recent|now)\b/.test(t);
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
  const s = season ?? defaultSeason(theme, text);
  const p = parseYears(text, now);
  // "Snowpack in 2023" is the winter that ended in 2023, unless the text names both years ("2022-23").
  if (s === 'winter' && !/\b(1[89]|20)\d\d ?[-–/] ?\d\d\b(?!\d)/.test(text)) {
    p.years = p.years.map((v) => v - 1);
    if (p.range) p.range = [p.range[0] - 1, p.range[1] - 1];
  }
  const thisYear = now.getUTCFullYear();
  const latest = latestSeasonYear(s, now);
  const today = now.toISOString().slice(0, 10);

  // A named event month: "before and after the August 2023 flood".
  const eventMonth = p.months.length === 1 && /\b(before|after)\b/i.test(text) ? p.months[0] : null;
  if (eventMonth && (views.includes('swipe') || /before|after/i.test(text))) {
    const eventStart = iso(eventMonth.y, eventMonth.m, 1);
    // Only the month is known, so "after" is that whole month (newest first), plus a month more
    // for scars that stay, like burns.
    const month = monthWindow(eventMonth.m, eventMonth.y).label;
    const before: TimeWindow = { label: `Before ${month}`, start: addDays(eventStart, -75), end: addDays(eventStart, -1) };
    const monthEnd = iso(eventMonth.y, eventMonth.m, lastDay(eventMonth.y, eventMonth.m));
    const after = clampEnd({ label: month, start: eventStart, end: theme === 'flood' ? monthEnd : addDays(monthEnd, 30) }, now);
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
    // At most eight maps (twelve when every year is asked for), always including the first and
    // last years asked for.
    const most = /\b(each|every|per|by) year\b|\byear by year\b/i.test(text) ? 12 : 8;
    const step = Math.max(1, Math.ceil((years.length - 1) / (most - 1)));
    const picked = years.filter((_, i) => i % step === 0);
    if (picked[picked.length - 1] !== years[years.length - 1]) picked.push(years[years.length - 1]);
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

  // Land cover, built area, forest loss and crops change between maps, not along a chart: a span
  // of years is its first year against its last.
  if (!historyAsked && (p.since !== null || p.range !== null) && (theme === 'landcover' || theme === 'built' || theme === 'forest-loss' || theme === 'crop-type')) {
    const a = first ?? last - 6;
    return { time: { kind: 'compare', windows: [seasonWindow(s, a === last ? last - 1 : a), clampEnd(seasonWindow(s, last), now)] }, season };
  }

  if (historyAsked || p.since !== null || p.range !== null) {
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
  if (p.now && !p.years.length && !p.relative && !/\b(winter|spring|summer|fall|autumn|growing season)\b/i.test(text)) {
    return { time: { kind: 'snapshot', window: { label: 'The last 45 days', start: addDays(today, -45), end: today } }, season };
  }
  const y = p.years.length === 1 ? p.years[0] : latest;
  return { time: { kind: 'snapshot', window: clampEnd(seasonWindow(s, y), now) }, season };
}

// ---- Place ---------------------------------------------------------------------------

/**
 * Words that describe what or when, never where. Whatever is left after removing them, plus
 * place nouns that sit next to it ("Lake", "County"), is a place candidate. This is what lets
 * "sea surface temperature, 1999-now, atlantic ocean" or "corn in story county iowa" work in
 * any case.
 */
const NOT_PLACE = new Set(
  `a an the i me my mine we us our you your it its they them their this that these those there here
  want wants wanted need needs like would could should can will please let help show shows showing see seeing look looks looking active
  map maps mapping compare compared comparing comparison find track tracking watch monitor monitoring measure measuring
  make build give get tell chart charting plot plotting display visualize view viewing explore analyze analyse study
  is are was were be been being has have had did do does done happen happened happening going go
  how what where which when why who whose much many more most less least all each every any some much
  and or but then than vs versus between from to until till through thru since during before after over across
  around near within inside throughout along off in on at of for by with without into onto about
  now today present current currently recent recently lately latest ago past last next this
  year years yearly annual annually month months monthly week weeks weekly day days daily decade decades season seasons seasonal
  summer summers winter winters spring springs fall autumn
  january february march april may june july august september october november december
  jan feb mar apr jun jul aug sep sept oct nov dec
  early late mid middle start end beginning
  time times history historical trend trends timeline timelapse time-lapse series over-time per
  swipe slider click clicking chart stats statistics average averages mean median total totals percent percentage share download export app
  data dataset datasets satellite satellites image images imagery picture pictures photo photos sensor
  change changes changed changing loss lost gain gained growth grow grew growing grown expand expanded expansion shrink shrank shrinking decline declined
  level levels extent amount amounts index value values pattern patterns health healthy stress stressed condition conditions
  greenness green greener greening vegetation vegetated ndvi ndwi ndmi nbr ndsi evi plants plant crops crop cover cropland farmland
  farm farms farming fields field agriculture agricultural harvest harvested planted planting
  forest forests forested trees tree canopy woods deforestation logging
  water wet wetness flood floods flooded flooding inundation drought dry dryness moisture
  fire fires wildfire wildfires burn burned burnt burning burns scar scars severity hotspots hotspot smoke
  snow snowpack snowy ice icy glacier glaciers melt melting frozen
  urban urbanization sprawl built built-up buildings construction development developed city-wide impervious
  heat hot hotter hottest cool cooler cold warm warmer warming warmest temperature temperatures temp temps degrees celsius fahrenheit
  sea surface sst ocean oceans marine anomaly anomalies normal heatwave heatwaves wave waves bleaching
  rain rainfall rainy precipitation precip monsoon storm storms wetter drier
  land landcover land-cover use usage type types class classes kind kinds
  elevation terrain topography slope slopes dem height tall
  lights night air quality pollution no2 emissions methane
  corn maize soy soybean soybeans wheat cotton rice sorghum alfalfa almonds almond pistachios walnuts orchards orchard vineyards grapes potatoes beets canola barley oats hay
  sentinel sentinel-1 sentinel-2 landsat modis radar sar esa cci cdl usda noaa oisst nclimgrid
  true color colour natural rgb
  live interactive simple quick nice good best real actual exactly roughly approximately
  up down out so too very just also only still yet even ever again really maybe probably something anything everything
  effect effects impact impacts affect affected cause caused due because result results across-the
  difference differences different same similar compare-to whole entire overall full part parts half
  hi hey hello thanks thank cool okay ok yeah yes no not don't dont doesn't didn't isn't wasn't
  right moment lose loses losing gets getting got become became snowing raining pouring freezing
  zoom zoomed switch swap instead use using try add adding remove drop keep move pan center centre focus turn put set rather plus
  wider narrower bigger smaller closer further farther older newer earlier later back forward edit tweak redo
  lst lat lon lng long latitude longitude coordinates coords
  underwater flooded-out submerged
  warmed cooled dried dry rose risen fell fallen dropped spread spreading covers covered covering affected moved
  hit struck destroyed damaged damage recovered recovery hurricane storm tornado earthquake event events
  i'd i'm let's what's how's`
    .split(/\s+/)
    .filter(Boolean),
);

/** Nouns that belong to a place name when they sit next to one ("Lake Tahoe", "Story County"). */
const PLACE_NOUNS = new Set(
  `lake lakes river rivers creek bay bays sound gulf sea ocean coast coastal shore island islands peninsula delta estuary harbor harbour
  county counties parish borough city town village township district province state states region valley valleys basin watershed
  mountain mountains mount mt range ranges hills plateau canyon desert forest forests park national preserve reserve refuge wilderness
  reservoir dam wetlands marsh swamp glacier glaciers falls springs beach plains prairie metro area neighborhood campus`
    .split(/\s+/)
    .filter(Boolean),
);

/** Words that join parts of one place name. */
const JOINERS = new Set(['of', 'de', 'del', 'la', 'le', 'du', 'des', 'da', 'do', 'dos', 'el', 'san', 'santa', 'st', 'st.', 'the', 'and', 'on', 'upon']);

const PREPOSITIONS = new Set(['in', 'for', 'around', 'near', 'across', 'over', 'at', 'of', 'off', 'along', 'within', 'inside', 'throughout', 'outside', 'by']);

/** "42.44, -76.50" or "42.44N 76.50W" -> "42.44000, -76.50000". */
export function parseCoords(text: string): string | null {
  const named = /\blat(?:itude)?\.?\s*:?\s*(-?\d{1,2}(?:\.\d+)?)\s*,?\s*(?:lon|lng|long)(?:gitude)?\.?\s*:?\s*(-?\d{1,3}(?:\.\d+)?)/i.exec(text);
  if (named) {
    const lat = Number(named[1]);
    const lon = Number(named[2]);
    return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : null;
  }
  const dec =
    /(-?\d{1,2}\.\d+)\s*°?\s*([ns])?\s*,?\s+(-?\d{1,3}\.\d+)\s*°?\s*([ew])?/i.exec(text) ??
    /(-?\d{1,2}\.\d+)\s*°?\s*([ns])?\s*,\s*(-?\d{1,3}\.\d+)\s*°?\s*([ew])?/i.exec(text) ??
    /\b(\d{1,2}(?:\.\d+)?)\s*°?\s*([ns])\b\s*,?\s*(\d{1,3}(?:\.\d+)?)\s*°?\s*([ew])\b/i.exec(text);
  if (!dec) return null;
  let lat = Number(dec[1]);
  let lon = Number(dec[3]);
  if (dec[2]?.toLowerCase() === 's') lat = -Math.abs(lat);
  if (dec[4]?.toLowerCase() === 'w') lon = -Math.abs(lon);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

interface Token {
  raw: string;
  word: string;
  /** A comma (or similar) follows this token. */
  comma: boolean;
  index: number;
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const re = /[A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9.'’-]*/g;
  for (const m of text.matchAll(re)) {
    const raw = m[0].replace(/[.'’-]+$/, '');
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 2);
    out.push({ raw, word: raw.toLowerCase().replace(/’/g, "'"), comma: /^\s*[,;:]/.test(after), index: m.index! });
  }
  return out;
}

const isTimeish = (w: string) => /^(18|19|20)\d\d(s|-\d{2,4}|-now|-present|-today)?$/.test(w) || /^\d{1,2}(st|nd|rd|th)?$/.test(w) || /^q[1-4]$/.test(w);

export interface PlaceCandidate {
  text: string;
  score: number;
}

/** Ranked place phrases in a goal, best first. */
export function placeCandidates(text: string): PlaceCandidate[] {
  const coords = parseCoords(text);
  if (coords) return [{ text: coords, score: 100 }];
  const region = regionIn(text);
  const toks = tokenize(text);
  const known = (t: Token) => NOT_PLACE.has(t.word) || isTimeish(t.word) || /^\d+(\.\d+)?$/.test(t.word);
  const runs: { from: number; to: number }[] = [];
  let i = 0;
  while (i < toks.length) {
    if (known(toks[i]) && !PLACE_NOUNS.has(toks[i].word)) {
      i++;
      continue;
    }
    let j = i;
    // Grow the run over unknown words, place nouns and joiners that sit between unknown words.
    while (j + 1 < toks.length) {
      const next = toks[j + 1];
      const unknownNext = !known(next) || PLACE_NOUNS.has(next.word);
      const joinerBridge = JOINERS.has(next.word) && !['the', 'and', 'on', 'upon'].includes(next.word) && j + 2 < toks.length && (!known(toks[j + 2]) || PLACE_NOUNS.has(toks[j + 2].word));
      if (unknownNext || joinerBridge) j++;
      else break;
      // "Fresno County, California" stays one run; "temperature, atlantic" was already split by known words.
    }
    runs.push({ from: i, to: j });
    i = j + 1;
  }
  const out: PlaceCandidate[] = [];
  for (const r of runs) {
    let words = toks.slice(r.from, r.to + 1);
    // "LA", "NYC": a known short name stands as a place even when it looks like a joiner.
    const whole = words.map((t) => t.word).join(' ');
    if (ALIASES[whole] && (words.length > 1 || /^[A-Z]{2,4}$/.test(words[0].raw) || whole.length > 3)) {
      out.push({ text: words.map((t) => t.raw).join(' '), score: 6 });
      continue;
    }
    // A run that is only place nouns ("lakes", "forest") is a theme word, not a place.
    if (words.every((t) => PLACE_NOUNS.has(t.word) || JOINERS.has(t.word))) continue;
    // "San Diego", "St Louis", "El Paso": name particles can lead a place; "of" and "the" can't.
    while (words.length && ['of', 'the', 'and', 'on', 'upon'].includes(words[0].word)) words = words.slice(1);
    while (words.length > 1 && JOINERS.has(words[0].word) && JOINERS.has(words[1].word)) words = words.slice(1);
    while (words.length && JOINERS.has(words[words.length - 1].word)) words = words.slice(0, -1);
    if (!words.length) continue;
    const phrase = words.map((t, k) => t.raw + (t.comma && k < words.length - 1 ? ',' : '')).join(' ');
    const prev = toks[r.from - 1];
    let score = 0;
    if (prev && PREPOSITIONS.has(prev.word)) score += 3;
    if (words.some((t, k) => /^[A-Z]/.test(t.raw) && (r.from + k > 0))) score += 2;
    if (words.some((t) => PLACE_NOUNS.has(t.word))) score += 2;
    if (words.length > 1 && words.some((t) => t.comma)) score += 1;
    score += Math.min(words.length, 4) * 0.5;
    if (words.every((t) => t.word.length < 3)) score -= 4;
    if (words.some((t) => /^[A-Z]{2}$/.test(t.raw))) score += 1;
    out.push({ text: phrase, score });
    // "coast of California", "outskirts of Denver": the part after "of" is a fallback.
    const ofAt = words.map((t) => t.word).lastIndexOf('of');
    if (ofAt > 0 && ofAt < words.length - 1) {
      const tail = words.slice(ofAt + 1);
      out.push({ text: tail.map((t, k) => t.raw + (t.comma && k < tail.length - 1 ? ',' : '')).join(' '), score: score - 0.5 });
    }
  }
  out.sort((a, b) => b.score - a.score);
  if (region && !region.country) out.unshift({ text: region.name, score: 50 });
  // Distinct, best first.
  const seen = new Set<string>();
  return out.filter((c) => {
    const k = c.text.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Short names people use for big cities; "LA" alone means Los Angeles, not Louisiana. */
const ALIASES: Record<string, string> = {
  nyc: 'New York City',
  'new york': 'New York City',
  la: 'Los Angeles, California',
  sf: 'San Francisco, California',
  dc: 'Washington, DC',
  'washington dc': 'Washington, DC',
  'washington d.c': 'Washington, DC',
  philly: 'Philadelphia, Pennsylvania',
  nola: 'New Orleans, Louisiana',
  vegas: 'Las Vegas, Nevada',
  chi: 'Chicago, Illinois',
  'the bay': 'San Francisco Bay',
};

export function expandAlias(phrase: string): string {
  return ALIASES[phrase.trim().toLowerCase().replace(/\.$/, '')] ?? phrase;
}

/** The best place phrase in a goal, or null. */
export function parsePlace(text: string): string | null {
  return placeCandidates(text)[0]?.text ?? null;
}

// ---- Entry point ---------------------------------------------------------------------

export function parseGoal(text: string, now: Date = new Date()): Intent {
  const matched: string[] = [];
  // "Flooding from Hurricane Harvey": a named event with no date gets its month, before and after.
  const ev = eventIn(text);
  const original = text;
  const evYear = ev ? ev.month.slice(0, 4) : '';
  let rewrote = false;
  const namesMonth = new RegExp(`\\b${MONTH_RE}\\b`, 'i').test(text);
  if (ev && !namesMonth && (!/\b(18|19|20)\d\d\b/.test(text) || new RegExp(`\\b${evYear}\\b`).test(text))) {
    const [y, m] = ev.month.split('-').map(Number);
    const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
    // Rain during a storm is that month's total; everything else is a before and after.
    rewrote = true;
    text = /\b(rain\w*|precip\w*)\b/i.test(text) ? `${text} in ${month} ${y}` : `${text} before and after ${month} ${y}`;
  }
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
  // "Gulf Stream temperature": heat over a body of water is the sea surface.
  const waterRegion = regionIn(text);
  if (theme === 'heat' && waterRegion && /ocean|sea\b|gulf|bay|sound|stream|reef/i.test(waterRegion.name)) theme = 'ocean';
  // "Greenness of corn fields" is about plant health, not which crop is planted.
  if (theme === 'crop-type' && /\bgreen(ness|ing|er)?\b|\bndvi\b|\bhealth(y)?\b|\bvigou?r\b|\bstress(ed)?\b|\bcover[- ]?crops?\b/i.test(text)) theme = /cover[- ]?crop/i.test(text) ? 'cover-crop' : 'vegetation';
  // A crop named with a harvest/fire/flood question belongs to that question.
  if (theme === 'crop-type') {
    for (const [t, re] of THEME_CUES) {
      if ((t === 'flood' || t === 'fire' || t === 'snow' || t === 'rain' || t === 'heat') && re.test(text)) {
        theme = t;
        break;
      }
    }
  }
  const views: ComponentId[] = [];
  for (const [v, re] of VIEW_CUES) {
    const m = re.exec(text);
    if (m) {
      views.push(v);
      matched.push(m[0]);
    }
  }
  const mapsChange = theme === 'landcover' || theme === 'built' || theme === 'forest-loss' || theme === 'crop-type';
  if (/\bsince (19|20)\d\d\b/i.test(text) && !mapsChange && !views.includes('time-slider') && !views.includes('swipe') && !views.includes('click-chart')) {
    views.push('click-chart');
  }
  const parsedTime = parseTime(text, theme, views, now);
  const season = parsedTime.season;
  let time = parsedTime.time;
  // A named event with a known day gets windows on either side of that day: the first look
  // after a flood, a longer one after a fire. "Houston before and after August 2017" is Harvey
  // too: a month and a place that match a known event get its day.
  const lower = original.toLowerCase();
  const known =
    ev?.date && ev.short && rewrote
      ? ev
      : !ev && time.kind === 'compare' && /^Before /.test(time.windows[0].label)
        ? EVENTS.find((e) => e.date && e.short && time.kind === 'compare' && e.month === time.windows[1].start.slice(0, 7) && lower.includes(e.place.split(',')[0].toLowerCase()))
        : undefined;
  if (known?.date && known.short && time.kind === 'compare') {
    const before: TimeWindow = { label: `Before ${known.short}`, start: addDays(known.date, -75), end: addDays(known.date, -1) };
    const after: TimeWindow =
      theme === 'flood'
        ? { label: `After ${known.short}`, start: known.date, end: addDays(known.date, 14), prefer: 'earliest' }
        : { label: `After ${known.short}`, start: known.date, end: addDays(known.date, 60) };
    time = { kind: 'compare', windows: [before, clampEnd(after, now)] };
  }
  // Words inside the event's own name aren't the place: "eaton fire" isn't Eaton County, and
  // "pakistan floods" means where they hit hardest, not the whole country.
  const evName = ev ? (original.match(ev.re)?.[0] ?? '').toLowerCase() : '';
  const places = placeCandidates(original)
    .map((c) => expandAlias(c.text))
    .filter((p) => !ev || (!ev.re.test(p) && !evName.includes(p.toLowerCase())));
  if (ev) places.push(ev.place);
  return { text: original, place: places[0] ?? null, places: places.slice(1), theme, station, views, time, season, matched };
}
