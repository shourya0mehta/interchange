/**
 * The gallery test: ten apps from the public Earth Engine list, each written as one sentence.
 * A sentence passes when the planner picks the right kind of data and app shape and the route
 * compiles into a live app with no hand edits (or, for export-only data, into an export).
 */
import { describe, expect, it } from 'vitest';
import { compileRoute } from '../src/compiler/spec';
import { parseGoal } from '../src/planner/intent';
import { planRoutes } from '../src/planner/plan';
import type { Bbox } from '../src/runtime/geo';
import type { ComponentId } from '../src/network/types';

const NOW = new Date('2026-10-18T12:00:00Z');

const PLACES: Record<string, Bbox> = {
  'peak district': [-2.05, 53.2, -1.6, 53.55],
  'everglades national park': [-81.2, 25.1, -80.6, 25.6],
  kerala: [74.9, 8.2, 77.4, 12.8],
  honduras: [-89.4, 12.98, -83.1, 16.5],
  'miami beach': [-80.15, 25.76, -80.11, 25.87],
  manaus: [-60.2, -3.15, -59.8, -2.9],
  ithaca: [-76.55, 42.41, -76.46, 42.48],
  dakar: [-17.55, 14.6, -17.3, 14.8],
  'tompkins county': [-76.7, 42.26, -76.24, 42.63],
  'paradise, california': [-121.7, 39.7, -121.5, 39.85],
};

interface Case {
  app: string;
  sentence: string;
  station: string[];
  view: ComponentId;
  live: boolean;
}

const CASES: Case[] = [
  { app: 'NCEO UK (click time series)', sentence: 'Click anywhere in the Peak District to chart greenness since 2017', station: ['sentinel-2', 'landsat', 'modis-vi'], view: 'click-chart', live: true },
  { app: 'Hurricane Irma mangroves (swipe)', sentence: 'Compare mangrove greenness in Everglades National Park before and after September 2017', station: ['sentinel-2', 'landsat'], view: 'swipe', live: true },
  { app: 'Sentinel flood damage (swipe)', sentence: 'Map flooding in Kerala before and after August 2018', station: ['sentinel-1'], view: 'swipe', live: true },
  { app: 'HN MODIS viewer 2000-2019 (time slider)', sentence: 'Greenness in Honduras each year from 2000 to 2019', station: ['modis-vi', 'landsat'], view: 'time-slider', live: true },
  { app: 'Sea level rise (static viewer)', sentence: 'Elevation of Miami Beach', station: ['cop-dem'], view: 'layer', live: true },
  { app: 'ForestWatch (land cover)', sentence: 'Land cover around Manaus', station: ['io-lulc', 'esa-worldcover'], view: 'layer', live: true },
  { app: 'Selec_Sentinel2 (download tool)', sentence: 'Download a true color image of Ithaca from August 2025', station: ['sentinel-2'], view: 'download', live: true },
  { app: 'Dakar lights (static viewer)', sentence: 'Night lights in Dakar', station: ['viirs-night'], view: 'layer', live: false },
  { app: 'Stratifi (region stats)', sentence: 'How much of Tompkins County is crops?', station: ['io-lulc', 'esa-worldcover'], view: 'region-stats', live: true },
  { app: 'Smart_Fire (burn monitoring)', sentence: 'Burn severity near Paradise, California before and after November 2018', station: ['sentinel-2', 'landsat'], view: 'swipe', live: true },
];

function lookup(place: string | null): { name: string; bbox: Bbox } | null {
  if (!place) return null;
  const key = Object.keys(PLACES).find((k) => place.toLowerCase().includes(k) || k.includes(place.toLowerCase()));
  return key ? { name: place, bbox: PLACES[key] } : null;
}

describe('gallery test', () => {
  const results = CASES.map((c) => {
    const intent = parseGoal(c.sentence, NOW);
    const plan = planRoutes(intent, lookup(intent.place));
    const top = plan.routes[0];
    const reasons: string[] = [];
    if (!plan.place) reasons.push(`place not found (${intent.place})`);
    if (!top) reasons.push('no route');
    else {
      if (!c.station.includes(top.station)) reasons.push(`picked ${top.station}`);
      if (!top.views.includes(c.view)) reasons.push(`no ${c.view} (has ${top.views.join(', ')})`);
      if (c.live) {
        const { spec, errors } = compileRoute(top, c.sentence, NOW);
        if (!spec) reasons.push(`compile: ${errors[0]}`);
      } else if (top.runs !== 'export') reasons.push('expected an export');
    }
    return { c, pass: reasons.length === 0, reasons };
  });

  it('rebuilds at least 8 of 10 sampled apps with no hand edits', () => {
    const passed = results.filter((r) => r.pass).length;
    for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.c.app}${r.pass ? '' : `: ${r.reasons.join('; ')}`}`);
    console.log(`gallery score: ${passed}/10`);
    expect(passed).toBeGreaterThanOrEqual(8);
  });
});
