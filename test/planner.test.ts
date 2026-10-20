import { describe, expect, it } from 'vitest';
import { parseGoal, parsePlace } from '../src/planner/intent';
import { planRoutes, type Place } from '../src/planner/plan';
import { checkRoute } from '../src/network/typecheck';
import { compileRoute, decodeSpec, encodeSpec } from '../src/compiler/spec';
import type { Route } from '../src/network/types';

const NOW = new Date('2026-10-18T12:00:00Z');
const TOMPKINS: Place = { name: 'Tompkins County', bbox: [-76.7, 42.26, -76.24, 42.63] };

describe('parseGoal', () => {
  it('reads the walkthrough sentence', () => {
    const i = parseGoal('Show which fields in Tompkins County had a winter cover crop each year since 2018. Click a field to see its greenness over time.', NOW);
    expect(i.theme).toBe('cover-crop');
    expect(i.place).toBe('Tompkins County');
    expect(i.views).toEqual(expect.arrayContaining(['time-slider', 'click-chart']));
    expect(i.time.kind).toBe('yearly');
    if (i.time.kind !== 'yearly') return;
    expect(i.time.windows.length).toBeLessThanOrEqual(8);
    expect(i.time.windows[0].label).toBe('Early spring 2018');
    expect(i.time.windows.at(-1)!.label).toBe('Early spring 2026');
  });

  it('compares two named summers', () => {
    const i = parseGoal('Compare greenness in Fresno County, California in summer 2019 vs summer 2025', NOW);
    expect(i.theme).toBe('vegetation');
    expect(i.place).toBe('Fresno County, California');
    expect(i.time.kind).toBe('compare');
    if (i.time.kind !== 'compare') return;
    expect(i.time.windows.map((w) => w.label)).toEqual(['Summer 2019', 'Summer 2025']);
  });

  it('builds before and after windows around an event month', () => {
    const i = parseGoal('Map flooding in Houston before and after August 2017', NOW);
    expect(i.theme).toBe('flood');
    expect(i.place).toBe('Houston');
    expect(i.time.kind).toBe('compare');
    if (i.time.kind !== 'compare') return;
    expect(i.time.windows[0].end).toBe('2017-07-31');
    expect(i.time.windows[1].start).toBe('2017-08-01');
    // Only the month is known: "after" runs to the end of it, and the tags say so plainly.
    expect(i.time.windows[1].end).toBe('2017-08-31');
    expect(i.time.windows.map((w) => w.label)).toEqual(['Before August 2017', 'August 2017']);
  });

  it('puts a named storm\'s windows either side of the day it hit, first look after', () => {
    const i = parseGoal('Map flooding in Houston before and after Hurricane Harvey', NOW);
    if (i.time.kind !== 'compare') throw new Error('expected a before and after');
    const [before, after] = i.time.windows;
    expect(before).toMatchObject({ label: 'Before Harvey', end: '2017-08-26' });
    expect(after).toMatchObject({ label: 'After Harvey', start: '2017-08-27', end: '2017-09-10', prefer: 'earliest' });
  });

  it('gives a named fire a longer after window, clearest first', () => {
    const i = parseGoal('Burn scar from the Camp Fire', NOW);
    if (i.time.kind !== 'compare') throw new Error('expected a before and after');
    const [before, after] = i.time.windows;
    expect(before.label).toBe('Before the Camp Fire');
    expect(after).toMatchObject({ start: '2018-11-08', end: '2019-01-07' });
    expect(after.prefer).toBeUndefined();
  });

  it('defaults to the latest finished season', () => {
    const i = parseGoal('Snow in Rocky Mountain National Park this winter', NOW);
    expect(i.theme).toBe('snow');
    expect(i.place).toBe('Rocky Mountain National Park');
    expect(i.time.kind).toBe('snapshot');
    if (i.time.kind !== 'snapshot') return;
    expect(i.time.window.label).toBe('Winter 2025-26');
  });

  it('finds places without a preposition', () => {
    expect(parsePlace('Lake Mead water level each year from 2015 to 2024')).toBe('Lake Mead');
    expect(parsePlace('How much of Ithaca is built up?')).toBe('Ithaca');
    expect(parsePlace('burn severity of the Dixie Fire in Plumas County, before and after July 2021')).toBe('Plumas County');
  });

  it('turns "since" into a history chart', () => {
    const i = parseGoal('Greenness of Iowa farms since 2000', NOW);
    expect(i.views).toContain('click-chart');
    expect(i.time.kind).toBe('history');
    if (i.time.kind !== 'history') return;
    expect(i.time.range.start).toBe('2000-01-01');
  });
});

describe('planRoutes', () => {
  it('offers Sentinel-2 first for recent fields, with Landsat as the alternative', () => {
    const plan = planRoutes(parseGoal('Compare greenness in Tompkins County in summer 2019 vs summer 2025', NOW), TOMPKINS);
    expect(plan.routes.map((r) => r.station)).toEqual(['sentinel-2', 'landsat', 'modis-vi']);
    const s2 = plan.routes[0];
    expect(s2.views).toEqual(expect.arrayContaining(['layer', 'legend', 'swipe', 'download']));
    expect(s2.methods).toEqual(['find-scenes', 'cloud-mask', 'clear-days', 'index']);
    expect(s2.tradeoffs.find((t) => t.label === 'Detail')!.tone).toBe('good');
    for (const r of plan.routes) expect(checkRoute(r).ok).toBe(true);
  });

  it('transfers to Landsat when the dates predate Sentinel-2', () => {
    const plan = planRoutes(parseGoal('Compare greenness in Tompkins County in summer 2008 vs summer 2024', NOW), TOMPKINS);
    expect(plan.routes[0].station).toBe('landsat');
    expect(plan.skipped.find((s) => s.station === 'sentinel-2')?.reason).toMatch(/starts in 2017/);
  });

  it('puts full-history routes ahead of partial ones', () => {
    const plan = planRoutes(parseGoal('Greenness of Tompkins County since 2005', NOW), TOMPKINS);
    expect(plan.routes[0].station).not.toBe('sentinel-2');
    expect(plan.routes.find((r) => r.station === 'sentinel-2')?.warnings.join(' ')).toMatch(/starts in 2017/);
  });

  it('routes floods to radar and swaps click history for a slider on yearly land cover', () => {
    const flood = planRoutes(parseGoal('Map flooding in Tompkins County before and after July 2025', NOW), TOMPKINS);
    expect(flood.routes[0].station).toBe('sentinel-1');
    expect(flood.routes[0].methods).toContain('radar-db');
    const lc = planRoutes(parseGoal('Land cover in Tompkins County over time', NOW), TOMPKINS);
    expect(lc.routes[0].station).toBe('io-lulc');
    expect(lc.routes[0].views).not.toContain('click-chart');
  });

  it('ends export-only themes in an export', () => {
    const plan = planRoutes(parseGoal('Air quality in Delhi', NOW), { name: 'Delhi', bbox: [76.8, 28.4, 77.4, 28.9] });
    expect(plan.routes[0].station).toBe('s5p');
    expect(plan.routes[0].runs).toBe('export');
  });

  it('caps large areas for the live preview', () => {
    const plan = planRoutes(parseGoal('Greenness in Iowa this summer', NOW), { name: 'Iowa', bbox: [-96.64, 40.38, -90.14, 43.5] });
    // A state is too big for Sentinel-2's quick preview, so MODIS (which can show all of it) leads.
    expect(plan.routes[0].station).toBe('modis-vi');
    const s2 = plan.routes.find((r) => r.station === 'sentinel-2')!;
    expect(s2.aoi.capped).toBe(true);
    expect(s2.warnings.join(' ')).toMatch(/central 3,000 km²/);
  });
});

describe('checkRoute and compile', () => {
  const base = (): Route => planRoutes(parseGoal('Compare greenness in Tompkins County in summer 2019 vs summer 2025', NOW), TOMPKINS).routes[0];

  it('rejects a chart on true color and a swipe on one window', () => {
    const r = { ...base(), signal: 'true-color' as const, methods: ['find-scenes', 'cloud-mask', 'clear-days', 'true-color'] as Route['methods'], views: ['layer', 'click-chart'] as Route['views'] };
    expect(checkRoute(r).errors.join(' ')).toMatch(/Click for history can't show a true-color image/);
    const one = { ...base(), windows: [base().windows[0]] };
    expect(checkRoute(one).errors.join(' ')).toMatch(/needs 2 time windows/);
  });

  it('rejects an index on radar', () => {
    const r = { ...base(), station: 'sentinel-1', signal: 'radar-vv' as const };
    expect(checkRoute(r).errors.join(' ')).toMatch(/only works on optical data/);
  });

  it('round-trips an app through a share link', () => {
    const { spec, errors } = compileRoute(base(), 'Compare greenness', NOW);
    expect(errors).toEqual([]);
    const token = encodeSpec(spec!);
    expect(token.length).toBeLessThan(900);
    expect(decodeSpec(token)).toEqual(spec);
    expect(decodeSpec('garbage')).toBeNull();
  });
});

describe('ranking', () => {
  it('keeps yearly land cover first for built-up questions without a year', () => {
    const plan = planRoutes(parseGoal('How much of Austin, Texas is built up?', NOW), { name: 'Austin', bbox: [-97.94, 30.1, -97.56, 30.52] });
    expect(plan.routes[0].station).toBe('io-lulc');
    expect(plan.routes[0].views).toContain('region-stats');
  });
});

describe('Southern seasons', () => {
  it('summer 2016 on the Great Barrier Reef is December to February', () => {
    const plan = planRoutes(parseGoal('sea surface temperature on the great barrier reef summer 2016', NOW), { name: 'Great Barrier Reef', bbox: [142.5, -24.5, 154, -10.5] });
    const w = plan.routes[0].windows[0];
    expect(w.start).toBe('2015-12-01');
    expect(w.end).toBe('2016-02-29');
    expect(w.label).toBe('Summer 2015-16');
  });
  it('winter 2023 in the Southern Alps is June to August 2023', () => {
    const plan = planRoutes(parseGoal('snow in the southern alps of new zealand winter 2023', NOW), { name: 'Southern Alps', bbox: [168, -45.5, 171.5, -42.5] });
    const w = plan.routes[0].windows[0];
    expect(w.start).toBe('2023-06-01');
    expect(w.label).toBe('Winter 2023');
  });
  it('leaves event dates alone', () => {
    const plan = planRoutes(parseGoal('fires in new south wales before and after january 2020', NOW), { name: 'New South Wales', bbox: [141, -37.5, 153.6, -28.2] });
    expect(plan.routes[0].windows[0].label).toContain('January 2020');
  });
});
