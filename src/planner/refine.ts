import { THEME_CUES, STATION_CUES, VIEW_CUES, parseGoal, parseTime, placeCandidates, type Intent } from './intent';
import { eventIn } from './gazetteer';
import type { ComponentId } from '../network/types';

/**
 * Follow-up requests in the studio: "compare with 2010", "use Landsat", "make it a slider",
 * "zoom out", "now do Clovis". Only what the follow-up mentions changes; everything else carries
 * over from the app on screen.
 */
export interface Refinement {
  intent: Intent;
  /** Plain-language list of what changed, for the build log. */
  changes: string[];
  /** Multiply the current area's size (zoom out > 1, zoom in < 1). */
  scale: number | null;
  /** The follow-up named a new place to look up. */
  newPlace: boolean;
}

const MAIN_VIEWS: ComponentId[] = ['swipe', 'time-slider', 'click-chart'];
const SEASON_WORD: Record<string, string> = {
  summer: 'summer',
  winter: 'winter',
  spring: 'spring',
  fall: 'fall',
  growing: 'growing season',
  'early-spring': 'spring',
  'post-harvest': 'after harvest',
};

const TIME_RE = /\b(1[89]\d\d|20\d\d)\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (1[89]|20)\d\d\b|\b(summer|winter|spring|fall|autumn|growing season)\b|\b(this|last) (year|summer|winter|spring|fall|season)\b|\bright now\b|\bcurrently\b|\btoday\b|\bpast \w+ (years|decades?)\b|\b(19|20)\d0s\b|['’]\d\d\b/i;
const ZOOM_OUT = /\bzoom(ed)? out\b|\bwider\b|\bbigger (area|region|view)\b|\bmore area\b|\bwhole (region|state|county)\b/i;
const ZOOM_IN = /\bzoom(ed)? in\b|\bcloser\b|\bsmaller (area|region)\b|\bnarrower\b/i;
const ADD = /\b(add|also|plus|and a|with a)\b/i;

function years(intent: Intent): [number, number] {
  const t = intent.time;
  const y = (s: string) => Number(s.slice(0, 4));
  if (t.kind === 'snapshot') return [y(t.window.start), y(t.window.start)];
  if (t.kind === 'history') return [y(t.range.start), y(t.range.end)];
  const ws = t.windows;
  return [y(ws[0].start), y(ws[ws.length - 1].start)];
}

export function refine(prev: Intent, text: string, now: Date = new Date()): Refinement {
  const said = text.trim();
  const parsed = parseGoal(said, now);
  const changes: string[] = [];

  // Theme and dataset.
  const themeSaid = THEME_CUES.some(([, re]) => re.test(said));
  const theme = themeSaid ? parsed.theme : prev.theme;
  if (themeSaid && theme !== prev.theme) changes.push(`Topic: ${theme.replace('-', ' ')}`);
  const stationSaid = STATION_CUES.some(([, re]) => re.test(said));
  const station = stationSaid ? parsed.station : themeSaid ? null : prev.station;

  // Views: add to what's there, or swap the main one.
  const viewsSaid = VIEW_CUES.filter(([, re]) => re.test(said)).map(([v]) => v);
  let views = prev.views.slice();
  if (viewsSaid.length) {
    const main = viewsSaid.find((v) => MAIN_VIEWS.includes(v));
    if (ADD.test(said)) views = Array.from(new Set([...views, ...viewsSaid]));
    else views = Array.from(new Set([...views.filter((v) => !MAIN_VIEWS.includes(v) || !main), ...viewsSaid]));
  }

  // Time: re-read with the old season and, when only one year is named, the old end year.
  // A named storm or fire brings its own dates ("during harvey").
  const event = eventIn(said);
  const timeSaid = TIME_RE.test(said) || !!event;
  const mainChanged = viewsSaid.some((v) => MAIN_VIEWS.includes(v) && !prev.views.includes(v));
  let time = prev.time;
  let season = prev.season;
  if (timeSaid || mainChanged) {
    const [a, b] = years(prev);
    const namedYears = said.match(/\b(1[89]\d\d|20\d\d)\b/g) ?? [];
    let timeText = said;
    const seasonSaid = /\b(summer|winter|spring|fall|autumn|growing season|after harvest)\b/i.test(said);
    if (!seasonSaid && prev.season) timeText += ` ${SEASON_WORD[prev.season]}`;
    if (!timeSaid) timeText += ` from ${a} to ${b}`;
    else if (namedYears.length === 1 && prev.time.kind !== 'snapshot' && !/\b(since|from|after|until|to)\b/i.test(said)) timeText += ` ${Number(namedYears[0]) < b ? b : a}`;
    let tv = views;
    // "compare with 2010" on a snapshot becomes a before and after.
    if (namedYears.length >= 1 && /\b(compare|vs|versus|against|with)\b/i.test(said) && !tv.some((v) => MAIN_VIEWS.includes(v))) {
      tv = [...tv, 'swipe'];
      if (prev.time.kind === 'snapshot') timeText += ` ${b}`;
    }
    if (event) {
      // The event's own reading wins: a before and after, or that month for rain.
      time = parsed.time;
      season = parsed.season;
      const main = parsed.time.kind === 'compare' ? 'swipe' : null;
      views = [...views.filter((x) => !MAIN_VIEWS.includes(x)), ...(main ? [main as ComponentId] : [])];
    } else {
      const pt = parseTime(timeText, theme, tv, now);
      time = pt.time;
      season = pt.season ?? prev.season;
      views = tv;
    }
    changes.push(`Dates: ${describeTime(time)}`);
  }
  const sameViews = views.length === prev.views.length && views.every((x) => prev.views.includes(x));
  if (viewsSaid.length && !sameViews) changes.push(`Shows: ${views.filter((v) => v !== 'download').join(', ').replace('time-slider', 'a map for each year').replace('click-chart', 'click for history').replace('swipe', 'before and after swipe').replace('region-stats', 'area totals')}`);

  // Place.
  const scale = ZOOM_OUT.test(said) ? 3 : ZOOM_IN.test(said) ? 1 / 3 : null;
  // A follow-up names a new place only with some sign of it: a capital, a preposition, a place
  // noun, or a "now do", "what about", "try" in front. "Make it prettier" is not a place.
  const candidates = placeCandidates(said);
  const lead = /^(now\s+|and\s+)?(do|try|show( me)?|switch to|move to|go to|what about|how about|same (thing )?for|again for)\b/i.test(said);
  const newPlace = !scale && candidates.some((c) => c.score >= 3 || lead);
  if (newPlace) changes.push(`Place: ${parsed.place}`);
  if (scale) changes.push(scale > 1 ? 'Area: three times wider' : 'Area: three times closer');
  if (stationSaid && parsed.station) changes.push(`Dataset: ${parsed.station}`);

  const intent: Intent = {
    ...prev,
    text: `${prev.text} / ${said}`,
    theme,
    station,
    views,
    time,
    season,
    place: newPlace ? parsed.place : prev.place,
    places: newPlace ? parsed.places : prev.places,
    matched: [...prev.matched, ...parsed.matched],
  };
  return { intent, changes, scale, newPlace };
}

export function describeTime(t: Intent['time']): string {
  if (t.kind === 'compare') return `${t.windows[0].label} vs ${t.windows[1].label}`;
  if (t.kind === 'yearly') return `${t.windows[0].label} to ${t.windows[t.windows.length - 1].label}, one map each`;
  if (t.kind === 'history') return `${t.range.start.slice(0, 4)} to ${t.range.end.slice(0, 4)}`;
  return t.window.label;
}
