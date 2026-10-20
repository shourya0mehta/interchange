import type { TimeWindow } from '../runtime/layers';
import { getFetcher } from '../runtime/stac';
import { STATIONS } from '../network/network';
import type { ComponentId } from '../network/types';
import { THEMES, parseGoal, type Intent, type Theme } from './intent';

/** Haiku is plenty for turning one sentence into structured intent, and the cheapest. */
export const DEFAULT_MODEL = 'claude-haiku-5-5';

const VIEWS: ComponentId[] = ['swipe', 'time-slider', 'click-chart', 'region-stats', 'download'];

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['place', 'theme', 'station', 'views', 'time_kind', 'windows', 'history_start', 'history_end'],
  properties: {
    place: { type: ['string', 'null'], description: 'The place to map, as a geocoder query (e.g. "Tompkins County, New York"). null if none.' },
    theme: { type: 'string', enum: THEMES },
    station: { type: ['string', 'null'], enum: [...STATIONS.map((s) => s.id), null], description: 'Only if the user named a dataset or sensor.' },
    views: { type: 'array', items: { type: 'string', enum: VIEWS } },
    time_kind: { type: 'string', enum: ['snapshot', 'compare', 'yearly', 'history'] },
    windows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'start', 'end'],
        properties: { label: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' } },
      },
    },
    history_start: { type: ['string', 'null'] },
    history_end: { type: ['string', 'null'] },
  },
} as const;

function systemPrompt(today: string): string {
  return [
    'You turn one sentence about the planet into structured intent for a satellite map app builder.',
    `Today is ${today}. Dates are YYYY-MM-DD and never later than today.`,
    'Pick the single theme that best matches what the person wants to see.',
    'time_kind: snapshot = one map; compare = exactly 2 windows (before/after, A vs B); yearly = 2 to 8 windows, one per year, same season each year; history = one window for the map plus history_start/history_end for a click-for-history chart.',
    'Seasons (northern hemisphere unless the place is southern): summer Jun 15 to Aug 31; growing season May 1 to Sep 30; spring Mar 20 to May 31; fall Sep 15 to Nov 15; winter Dec 1 to end of Feb.',
    'For cover crops use early spring (Mar 25 to May 5), because snow reads as bare soil in winter.',
    'For a named event (fire, flood, storm) with a date, compare a window ending the day before against a window starting that day.',
    'Labels are short and human ("Summer 2019", "Before the fire").',
    'views: add swipe for comparisons, time-slider for year-by-year, click-chart when they want history or trends at a spot, region-stats for how much/how many, download when they ask to export.',
  ].join('\n');
}

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

interface ModelIntent {
  place: string | null;
  theme: Theme;
  station: string | null;
  views: ComponentId[];
  time_kind: 'snapshot' | 'compare' | 'yearly' | 'history';
  windows: TimeWindow[];
  history_start: string | null;
  history_end: string | null;
}

/** Validates model output against the network; anything off falls back to the rule parser. */
export function intentFromModel(text: string, raw: ModelIntent, now: Date): Intent {
  const rules = parseGoal(text, now);
  const today = now.toISOString().slice(0, 10);
  const windows = (raw.windows ?? [])
    .filter((w) => isDate(w.start) && isDate(w.end) && w.start <= w.end)
    .map((w) => ({ label: String(w.label || `${w.start} to ${w.end}`).slice(0, 40), start: w.start, end: w.end > today ? today : w.end }))
    .slice(0, 8);
  let time: Intent['time'] = rules.time;
  if (raw.time_kind === 'compare' && windows.length === 2) time = { kind: 'compare', windows: [windows[0], windows[1]] };
  else if (raw.time_kind === 'yearly' && windows.length >= 2) time = { kind: 'yearly', windows };
  else if (raw.time_kind === 'history' && windows.length >= 1 && isDate(raw.history_start)) {
    const end = isDate(raw.history_end) && raw.history_end <= today ? raw.history_end : today;
    time = { kind: 'history', window: windows[0], range: { start: raw.history_start, end } };
  } else if (raw.time_kind === 'snapshot' && windows.length >= 1) time = { kind: 'snapshot', window: windows[0] };
  return {
    text,
    place: typeof raw.place === 'string' && raw.place.trim() ? raw.place.trim() : rules.place,
    places: [rules.place, ...rules.places].filter((p): p is string => !!p && p !== raw.place),
    theme: THEMES.includes(raw.theme) ? raw.theme : rules.theme,
    station: raw.station && STATIONS.some((s) => s.id === raw.station) ? raw.station : rules.station,
    views: [...new Set((raw.views ?? []).filter((v) => VIEWS.includes(v)))],
    time,
    season: rules.season,
    matched: ['read by Claude'],
  };
}

/**
 * One Messages API call with the person's own key, straight from the browser. The key never
 * leaves their machine except to api.anthropic.com.
 */
export async function parseGoalWithClaude(
  text: string,
  apiKey: string,
  opts: { model?: string; now?: Date; signal?: AbortSignal } = {},
): Promise<Intent> {
  const now = opts.now ?? new Date();
  const res = await getFetcher()('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: opts.signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: 1024,
      system: systemPrompt(now.toISOString().slice(0, 10)),
      messages: [{ role: 'user', content: text }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(res.status === 401 ? 'That API key was rejected.' : `Claude request failed (${res.status}) ${body.slice(0, 160)}`);
  }
  const json = (await res.json()) as { content: { type: string; text?: string }[] };
  const block = json.content.find((c) => c.type === 'text');
  if (!block?.text) throw new Error('Claude returned no text');
  return intentFromModel(text, JSON.parse(block.text) as ModelIntent, now);
}
