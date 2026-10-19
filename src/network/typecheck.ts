import { COMPONENT_BY_ID, METHOD_BY_ID, SIGNAL_NAMES, STATION_BY_ID } from './network';
import type { PortType, Route, Station } from './types';

export interface CheckResult {
  ok: boolean;
  errors: string[];
  /** The type that reaches the views. */
  output: PortType | null;
}

function stationKind(s: Station): 'optical' | 'radar' | 'composite' | 'annual' | 'static' {
  if (s.signals.includes('radar-vv')) return 'radar';
  if (s.temporal === 'composite') return 'composite';
  if (s.temporal === 'annual') return 'annual';
  if (s.temporal === 'static') return 'static';
  return 'optical';
}

/**
 * Checks a route the way a compiler checks a program: every stop must accept what the
 * previous stop produces, and every view must be satisfiable by the station and windows.
 */
export function checkRoute(route: Route): CheckResult {
  const errors: string[] = [];
  const station = STATION_BY_ID[route.station];
  if (!station) return { ok: false, errors: [`Unknown station "${route.station}"`], output: null };

  if (station.signals.length && !station.signals.includes(route.signal)) {
    const name = SIGNAL_NAMES[route.signal]?.long ?? route.signal;
    errors.push(`${station.name} can't produce ${name}`);
  }

  const kind = stationKind(station);
  let current: PortType = station.provides;
  for (const id of route.methods) {
    const m = METHOD_BY_ID[id];
    if (!m) {
      errors.push(`Unknown stop "${id}"`);
      continue;
    }
    if (m.for && m.for !== kind) {
      errors.push(`"${m.name}" only works on ${m.for} data, and ${station.name} is ${kind}`);
      continue;
    }
    if (m.input !== 'any' && m.input !== current) {
      errors.push(`"${m.name}" needs ${m.input} input but gets ${current}`);
      continue;
    }
    if (m.output !== 'same') current = m.output;
  }
  if (route.methods.includes('difference') && route.windows.length !== 2) {
    errors.push('"After minus before" needs exactly two time windows');
  }

  const temporal = station.temporal === 'dense' || station.temporal === 'composite' || station.temporal === 'annual';
  for (const v of route.views) {
    const c = COMPONENT_BY_ID[v];
    if (!c) {
      errors.push(`Unknown view "${v}"`);
      continue;
    }
    if (!c.accepts.includes(current)) {
      errors.push(`${c.name} can't show ${current === 'image' ? 'a true-color image' : current}`);
    }
    if (c.temporal && !temporal) {
      errors.push(`${c.name} needs data that changes over time, and ${station.name} is a single map`);
    }
    if (v === 'click-chart' && station.temporal === 'annual') {
      errors.push(`Click for history needs frequent observations; ${station.name} is yearly`);
    }
    if (c.windows) {
      const n = route.windows.length;
      if (n < c.windows.min || (c.windows.max !== undefined && n > c.windows.max)) {
        const want = c.windows.max === c.windows.min ? `${c.windows.min}` : `at least ${c.windows.min}`;
        errors.push(`${c.name} needs ${want} time windows, got ${n}`);
      }
    }
  }

  for (const w of route.windows) {
    const y0 = Number(w.start.slice(0, 4));
    const y1 = Number(w.end.slice(0, 4));
    if (station.temporal === 'static') continue;
    if (y1 < station.score.startYear) {
      errors.push(`${station.name} starts in ${station.score.startYear}, before "${w.label}"`);
    } else if (station.score.endYear !== null && y0 > station.score.endYear) {
      errors.push(`${station.name} ends in ${station.score.endYear}, before "${w.label}"`);
    }
  }

  return { ok: errors.length === 0, errors, output: current };
}
