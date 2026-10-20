import { expect } from 'vitest';
import { parseGoal, type Theme } from '../../src/planner/intent';
import { regionByName } from '../../src/planner/gazetteer';
import { planRoutes, type Place } from '../../src/planner/plan';
import type { Bbox } from '../../src/runtime/geo';
import { compileRoute } from '../../src/compiler/spec';
import { checkRoute } from '../../src/network/typecheck';

/**
 * The prompt bank harness: sentences people actually type, each with what Interchange should
 * hear and which route it should lead with. Places resolve through a fixed table (the live
 * geocoder is exercised by the browser walkthrough and scripts/prompts-live.mjs).
 */
export const NOW = new Date('2026-10-19T12:00:00Z');

export const TABLE: Record<string, Bbox> = {
  'fresno county, california': [-120.92, 35.9, -118.36, 37.59],
  'fresno county': [-120.92, 35.9, -118.36, 37.59],
  fresno: [-119.93, 36.65, -119.64, 36.91],
  'ithaca ny': [-76.55, 42.41, -76.47, 42.47],
  ithaca: [-76.55, 42.41, -76.47, 42.47],
  'central park': [-73.982, 40.764, -73.949, 40.8],
  iowa: [-96.64, 40.38, -90.14, 43.5],
  'story county iowa': [-93.7, 41.86, -93.23, 42.21],
  'tompkins county, ny': [-76.7, 42.26, -76.24, 42.63],
  'mclean county illinois': [-89.27, 40.28, -88.46, 40.75],
  'kern county': [-120.19, 34.79, -117.62, 35.8],
  'champaign county': [-88.46, 39.88, -87.93, 40.4],
  'ames iowa': [-93.7, 41.98, -93.57, 42.08],
  'punjab india': [73.87, 29.53, 76.94, 32.58],
  'lake mead': [-114.85, 35.98, -114.0, 36.5],
  'lake powell': [-111.7, 36.9, -110.3, 37.9],
  'great salt lake': [-113.1, 40.68, -111.85, 41.7],
  houston: [-95.79, 29.52, -95.01, 30.11],
  'houston, texas': [-95.79, 29.52, -95.01, 30.11],
  'paradise, california': [-121.66, 39.72, -121.55, 39.82],
  california: [-124.48, 32.53, -114.13, 42.01],
  australia: [112.9, -43.7, 153.7, -10.6],
  'new south wales': [141, -37.5, 153.6, -28.2],
  'los angeles': [-118.67, 33.7, -118.15, 34.34],
  yellowstone: [-111.15, 44.13, -109.83, 45.11],
  'boulder colorado': [-105.3, 39.96, -105.18, 40.09],
  phoenix: [-112.32, 33.29, -111.93, 33.92],
  texas: [-106.65, 25.84, -93.51, 36.5],
  miami: [-80.32, 25.71, -80.14, 25.86],
  denver: [-105.11, 39.61, -104.6, 39.91],
  'new york city': [-74.26, 40.48, -73.7, 40.92],
  kenya: [33.9, -4.7, 41.9, 5.0],
  'rondonia brazil': [-66.8, -13.7, -59.8, -7.97],
  'las vegas': [-115.4, 36.0, -115.0, 36.35],
  'mount rainier': [-121.9, 46.75, -121.6, 46.95],
  'salton sea': [-116.1, 33.1, -115.6, 33.55],
  manhattan: [-74.05, 40.68, -73.9, 40.88],
  delhi: [76.84, 28.4, 77.35, 28.88],
  'puerto rico': [-67.3, 17.9, -65.2, 18.6],
  kansas: [-102.05, 36.99, -94.59, 40.0],
  'redwood national park': [-124.2, 41.0, -123.9, 41.8],
  'new orleans': [-90.14, 29.87, -89.62, 30.2],
  'cedar rapids, iowa': [-91.77, 41.9, -91.57, 42.07],
  'austin, texas': [-97.94, 30.1, -97.56, 30.52],
  'fort myers, florida': [-81.9, 26.55, -81.75, 26.7],
  'sindh, pakistan': [66.6, 23.6, 71.1, 28.6],
  pakistan: [60.9, 23.6, 77.8, 37.1],
  'lahaina, hawaii': [-156.7, 20.84, -156.64, 20.92],
  'louisville, colorado': [-105.16, 39.95, -105.1, 40.0],
  'napa valley': [-122.5, 38.2, -122.2, 38.6],
  'lake tahoe': [-120.2, 38.9, -119.9, 39.3],
  'mississippi river': [-91.3, 29.0, -89.0, 33.0],
  'sacramento': [-121.56, 38.44, -121.36, 38.69],
  'colorado': [-109.06, 36.99, -102.04, 41.0],
  'san diego': [-117.28, 32.53, -116.9, 33.11],
  'nairobi': [36.66, -1.44, 37.1, -1.16],
  'dubai': [55.0, 24.8, 55.6, 25.4],
  'portland oregon': [-122.84, 45.43, -122.47, 45.65],
  'cayuga lake': [-76.75, 42.43, -76.5, 42.95],
  'bangladesh': [88.0, 20.7, 92.7, 26.6],
  'india': [68.1, 6.7, 97.4, 35.5],
  'washington state': [-124.8, 45.5, -116.9, 49.0],
  'gulf coast of florida': [-83, 26, -82, 30],
  'outer banks': [-76.0, 35.1, -75.4, 36.5],
  'monterey bay': [-122.1, 36.5, -121.8, 37.0],
  'cape cod': [-70.7, 41.5, -69.9, 42.1],
  'minnesota': [-97.24, 43.5, -89.49, 49.38],
  'the netherlands': [3.3, 50.75, 7.2, 53.55],
  netherlands: [3.3, 50.75, 7.2, 53.55],
  'salinas valley': [-121.8, 36.2, -121.0, 36.8],
  'imperial valley': [-115.8, 32.6, -115.2, 33.3],
  'kauai': [-159.8, 21.86, -159.29, 22.24],
  'fresno county, ca': [-120.92, 35.9, -118.36, 37.59],
  'fresno county california': [-120.92, 35.9, -118.36, 37.59],
  'fresno ca': [-119.93, 36.65, -119.64, 36.91],
  'houston tx': [-95.79, 29.52, -95.01, 30.11],
  'ames, ia': [-93.7, 41.98, -93.57, 42.08],
  'phoenix az': [-112.32, 33.29, -111.93, 33.92],
  'rondônia brazil': [-66.8, -13.7, -59.8, -7.97],
  'rondonia': [-66.8, -13.7, -59.8, -7.97],
  'los angeles, california': [-118.67, 33.7, -118.15, 34.34],
  'washington, dc': [-77.12, 38.79, -76.91, 38.99],
  'champaign county illinois': [-88.46, 39.88, -87.93, 40.4],
  'tulare county': [-119.57, 35.79, -117.98, 36.74],
  'yolo county': [-122.42, 38.31, -121.5, 38.93],
  'the everglades': [-81.6, 25, -80.2, 26.7],
  'lake okeechobee': [-81.13, 26.68, -80.6, 27.21],
};

export function tableGeo(phrase: string): Place | null {
  const r = regionByName(phrase);
  if (r) return { name: r.name, bbox: r.bbox };
  const m = /^(-?\d+\.\d+), (-?\d+\.\d+)$/.exec(phrase);
  if (m) {
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    return { name: phrase, bbox: [lon - 0.05, lat - 0.05, lon + 0.05, lat + 0.05] };
  }
  const k = phrase.toLowerCase().replace(/\s+/g, ' ').trim();
  return TABLE[k] ? { name: phrase, bbox: TABLE[k] } : null;
}

export function resolve(intent: ReturnType<typeof parseGoal>): { place: Place | null; phrase: string | null } {
  for (const p of [intent.place, ...intent.places].filter((x): x is string => !!x)) {
    const hit = tableGeo(p);
    if (hit) return { place: hit, phrase: p };
  }
  return { place: null, phrase: null };
}

export interface Case {
  q: string;
  /** Lowercase place phrase (or region name) that should be found; null when none is given. */
  place: string | null;
  theme?: Theme;
  /** Station of the leading route. */
  top?: string;
  /** Signal of the leading route. */
  signal?: string;
  time?: 'snapshot' | 'compare' | 'yearly' | 'history';
  /** A view the leading route must include. */
  view?: string;
  /** The leading route runs live (default) or is an export. */
  runs?: 'live' | 'export';
}


export function runCase(c: Case) {
  const intent = parseGoal(c.q, NOW);
  const { place, phrase } = resolve(intent);
  if (c.place === null) {
    expect(place).toBeNull();
  } else {
    expect({ heard: [intent.place, ...intent.places], found: phrase?.toLowerCase() ?? null }).toMatchObject({ found: c.place });
  }
  if (c.theme) expect(intent.theme).toBe(c.theme);
  if (c.time) expect(intent.time.kind).toBe(c.time);
  const plan = planRoutes(intent, place);
  const top = plan.routes[0];
  expect(top, `no route for "${c.q}"; skipped: ${plan.skipped.map((s) => s.reason).join(' | ')}`).toBeTruthy();
  if (c.top) expect({ top: top.station, all: plan.routes.map((r) => r.station) }).toMatchObject({ top: c.top });
  if (c.signal) expect(top.signal).toBe(c.signal);
  if (c.view) expect(top.views).toContain(c.view);
  expect(top.runs).toBe(c.runs ?? 'live');
  // Every live route type-checks and compiles into an app.
  for (const r of plan.routes) {
    expect(checkRoute(r).ok).toBe(true);
    if (r.runs === 'live' && place) expect(compileRoute(r, c.q).spec).toBeTruthy();
  }
}
