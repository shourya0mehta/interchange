import { describe, expect, it } from 'vitest';
import { earthEngineScript } from '../src/compiler/export-ee';
import { parseGoal } from '../src/planner/intent';
import { intentFromModel, parseGoalWithClaude } from '../src/planner/llm';
import { planRoutes } from '../src/planner/plan';
import { setFetcher } from '../src/runtime/stac';

const NOW = new Date('2026-10-18T12:00:00Z');
const PLACE = { name: 'Tompkins County', bbox: [-76.7, 42.26, -76.24, 42.63] as [number, number, number, number] };

const goals = [
  'Compare greenness in Tompkins County in summer 2019 vs summer 2025',
  'Greenness of Tompkins County since 2005',
  'Map flooding in Tompkins County before and after July 2025',
  'Land cover in Tompkins County each year',
  'Elevation of Tompkins County',
  'Air quality in Tompkins County',
  'Snow in Tompkins County this winter',
];

describe('Earth Engine export', () => {
  for (const g of goals) {
    it(`writes valid JavaScript for "${g}"`, () => {
      const plan = planRoutes(parseGoal(g, NOW), PLACE);
      for (const r of plan.routes) {
        const code = earthEngineScript(r);
        expect(() => new Function('ee', 'ui', 'Map', code)).not.toThrow();
        const st = r.station;
        if (st === 'sentinel-2') expect(code).toContain('COPERNICUS/S2_SR_HARMONIZED');
        if (st === 'landsat') expect(code).toContain('LANDSAT/LC09/C02/T1_L2');
        if (r.views.includes('swipe')) expect(code).toContain('ui.SplitPanel');
        if (r.views.includes('click-chart') && st !== 'io-lulc') expect(code).toContain('ui.Chart.image.series');
      }
    });
  }
});

describe('Claude reader', () => {
  it('keeps valid model output and repairs the rest from the rule parser', () => {
    const text = 'show me crops near Ithaca, NY over the last few summers';
    const intent = intentFromModel(
      text,
      {
        place: 'Ithaca, New York',
        theme: 'vegetation',
        station: 'not-a-station',
        views: ['time-slider', 'nonsense' as never],
        time_kind: 'yearly',
        windows: [
          { label: 'Summer 2024', start: '2024-06-15', end: '2024-08-31' },
          { label: 'Summer 2025', start: '2025-06-15', end: '2025-08-31' },
          { label: 'Bad', start: '2025-13-01', end: '2025-08-31' },
          { label: 'Future', start: '2026-06-15', end: '2027-08-31' },
        ],
        history_start: null,
        history_end: null,
      },
      NOW,
    );
    expect(intent.place).toBe('Ithaca, New York');
    expect(intent.station).toBeNull();
    expect(intent.views).toEqual(['time-slider']);
    expect(intent.time.kind).toBe('yearly');
    if (intent.time.kind !== 'yearly') return;
    expect(intent.time.windows.map((w) => w.label)).toEqual(['Summer 2024', 'Summer 2025', 'Future']);
    expect(intent.time.windows[2].end).toBe('2026-10-18');
  });

  it('sends one structured-output request with the browser header', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    setFetcher(async (url, init) => {
      seen = { url, init: init! };
      const body = { place: 'Fresno County, California', theme: 'vegetation', station: null, views: ['swipe'], time_kind: 'compare', windows: [{ label: 'Summer 2019', start: '2019-06-15', end: '2019-08-31' }, { label: 'Summer 2025', start: '2025-06-15', end: '2025-08-31' }], history_start: null, history_end: null };
      return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(body) }] }), { status: 200 });
    });
    const intent = await parseGoalWithClaude('fresno greenness 2019 vs 2025', 'sk-test', { now: NOW });
    expect(intent.time.kind).toBe('compare');
    expect(seen!.url).toBe('https://api.anthropic.com/v1/messages');
    const headers = seen!.init.headers as Record<string, string>;
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    const body = JSON.parse(String(seen!.init.body));
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.output_config.format.type).toBe('json_schema');
    setFetcher((u, i) => fetch(u, i));
  });
});
