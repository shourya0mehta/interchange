import { useEffect, useMemo, useRef, useState } from 'react';
import { LINE_BY_ID, STATION_BY_ID } from '../network/network';
import type { LineId } from '../network/types';
import { THEME_WORDS, parseGoal, type Intent } from '../planner/intent';
import { geocodeFirst, previewGeocoder } from '../planner/places';
import { planRoutes, type Place } from '../planner/plan';
import { shortName } from './NetworkMap';

/** What Interchange heard, in the person's words, before anything runs. */
export interface ReadBack {
  what: string;
  where: string | null;
  when: string;
  via: { id: string; name: string; line: LineId; color: string; live: boolean } | null;
  shows: string;
  /** Stations the planner would ride, best first. */
  stations: string[];
}

const SHOWS: Record<string, string> = {
  swipe: 'Before and after swipe',
  'time-slider': 'A map for each year',
  'click-chart': 'Click for history',
  'region-stats': 'Area totals',
};

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function whenWords(intent: Intent): string {
  const t = intent.time;
  if (t.kind === 'compare') {
    const ev = /^Before \((.+)\)$/.exec(t.windows[0].label);
    return ev ? `Before and after ${ev[1]}` : `${t.windows[0].label} vs ${t.windows[1].label}`;
  }
  if (t.kind === 'yearly') return `${t.windows[0].label} to ${t.windows[t.windows.length - 1].label}`;
  if (t.kind === 'history') {
    const a = t.range.start.slice(0, 4);
    const b = t.range.end.slice(0, 4);
    return b >= String(new Date().getUTCFullYear()) ? `${a} to now` : `${a} to ${b}`;
  }
  return t.window.label;
}

export function readBack(intent: Intent, place: Place | null): ReadBack {
  // A stand-in place keeps the planner's area rules honest before the real one is found.
  const plan = planRoutes(intent, place);
  const top = plan.routes[0];
  const st = top ? STATION_BY_ID[top.station] : null;
  const line = st ? st.lines[0] : null;
  const shows = top
    ? (top.views.map((v) => SHOWS[v]).find(Boolean) ?? (top.runs === 'export' ? 'Earth Engine export' : 'Map and legend'))
    : 'Map and legend';
  return {
    what: cap(THEME_WORDS[intent.theme]),
    where: place?.name ?? intent.place,
    when: whenWords(intent),
    via: st && line ? { id: st.id, name: shortName(st), line, color: LINE_BY_ID[line].color, live: st.live } : null,
    shows,
    stations: plan.routes.map((r) => r.station),
  };
}

export type PlaceStatus =
  | { state: 'none' }
  | { state: 'looking'; phrase: string }
  | { state: 'found'; place: Place; phrase: string }
  /** Not certain from the quick lookup; the full lookup runs when the route is planned. */
  | { state: 'unsure'; phrase: string }
  | { state: 'missing'; phrase: string };

/**
 * Parses as the person types and, after a pause, looks the place up so the read-back can say
 * whether it was found. Lookups are cached, so pressing Plan afterwards is instant.
 */
export function useLiveIntent(goal: string, pinnedPlace: Place | null, delayMs = 700) {
  const text = goal.trim();
  const intent = useMemo(() => (text ? parseGoal(text) : null), [text]);
  const [status, setStatus] = useState<PlaceStatus>({ state: 'none' });
  const seq = useRef(0);
  const phrases = intent ? [intent.place, ...intent.places].filter((p): p is string => !!p) : [];
  const key = phrases.join('|');

  useEffect(() => {
    if (pinnedPlace) {
      setStatus({ state: 'found', place: pinnedPlace, phrase: pinnedPlace.name });
      return;
    }
    if (!phrases.length) {
      setStatus({ state: 'none' });
      return;
    }
    const my = ++seq.current;
    setStatus({ state: 'looking', phrase: phrases[0] });
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      geocodeFirst(previewGeocoder, phrases, ctrl.signal)
        .then((hit) => {
          if (my !== seq.current) return;
          setStatus(hit ? { state: 'found', place: hit.place, phrase: hit.phrase } : { state: 'unsure', phrase: phrases[0] });
        })
        .catch(() => my === seq.current && setStatus({ state: 'unsure', phrase: phrases[0] }));
    }, delayMs);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pinnedPlace]);

  const place = status.state === 'found' ? status.place : null;
  const back = useMemo(() => (intent ? readBack(intent, place) : null), [intent, place]);
  return { intent, status, place, back };
}


