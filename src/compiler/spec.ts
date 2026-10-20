import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Bbox } from '../runtime/geo';
import type { TimeWindow } from '../runtime/layers';
import type { Signal } from '../runtime/sources';
import { METHOD_BY_ID, SIGNAL_NAMES, STATION_BY_ID } from '../network/network';
import { checkRoute } from '../network/typecheck';
import type { ComponentId, MethodId, Route } from '../network/types';

/**
 * Everything a published app needs, small enough to live in a link. The runtime reads it;
 * nothing about an app is stored on a server.
 */
export interface AppSpec {
  v: 1;
  title: string;
  /** The sentence the app was built from. */
  question: string;
  aoi: { name: string; bbox: Bbox };
  station: string;
  signal: Signal;
  methods: MethodId[];
  windows: TimeWindow[];
  history?: { start: string; end: string };
  components: ComponentId[];
  createdAt: string;
  /** What the author wants viewers to notice. */
  notes?: string;
  /** Questions for students or readers to answer from the map. */
  questions?: string[];
}

export interface CompileResult {
  spec: AppSpec | null;
  errors: string[];
}

export function compileRoute(route: Route, question: string, now = new Date()): CompileResult {
  const check = checkRoute(route);
  if (!check.ok) return { spec: null, errors: check.errors };
  if (route.runs !== 'live') {
    return { spec: null, errors: [`${STATION_BY_ID[route.station].name} can't run in the browser yet; export the route instead.`] };
  }
  const [w, s0, e, n] = route.aoi.bbox;
  if (!(e > w && n > s0)) return { spec: null, errors: ['Name a place in the goal first, so the app knows where to look.'] };
  const st = STATION_BY_ID[route.station];
  const sig = SIGNAL_NAMES[route.signal]?.short ?? route.signal;
  return {
    errors: [],
    spec: {
      v: 1,
      title: `${route.aoi.name}: ${sig}`,
      question,
      aoi: { name: route.aoi.name, bbox: route.aoi.bbox.map((n) => Math.round(n * 1e5) / 1e5) as Bbox },
      station: st.id,
      signal: route.signal,
      methods: route.methods,
      windows: route.windows,
      history: route.historyRange,
      components: route.views,
      createdAt: now.toISOString().slice(0, 10),
    },
  };
}

export function encodeSpec(spec: AppSpec): string {
  return compressToEncodedURIComponent(JSON.stringify(spec));
}

export function decodeSpec(token: string): AppSpec | null {
  try {
    const json = decompressFromEncodedURIComponent(token);
    if (!json) return null;
    const spec = JSON.parse(json) as AppSpec;
    if (spec.v !== 1 || !STATION_BY_ID[spec.station] || !Array.isArray(spec.windows)) return null;
    return spec;
  } catch {
    return null;
  }
}

/** Rebuilds the route an app was compiled from, so it can be forked or explained. */
export function routeFromSpec(spec: AppSpec): Route {
  return {
    id: `${spec.station}-${spec.signal}`,
    title: spec.title,
    why: STATION_BY_ID[spec.station].goodAt[0],
    station: spec.station,
    signal: spec.signal,
    methods: spec.methods.filter((m) => METHOD_BY_ID[m]),
    views: spec.components,
    windows: spec.windows,
    historyRange: spec.history,
    aoi: spec.aoi,
    runs: 'live',
    tradeoffs: [],
    warnings: [],
  };
}
