import { describe, expect, it } from 'vitest';
import { parseGoal } from '../src/planner/intent';
import { refine } from '../src/planner/refine';
import { NOW } from './helpers/promptHarness';

const base = () => parseGoal('Compare greenness of fields in Fresno County, California in summer 2019 vs summer 2025', NOW);

describe('follow-up requests', () => {
  it('"compare with 2010" keeps the end year and season', () => {
    const r = refine(base(), 'compare with 2010 instead', NOW);
    expect(r.intent.time.kind).toBe('compare');
    if (r.intent.time.kind === 'compare') expect(r.intent.time.windows.map((w) => w.label)).toEqual(['Summer 2010', 'Summer 2025']);
    expect(r.intent.place).toBe(base().place);
    expect(r.newPlace).toBe(false);
  });
  it('"make it a slider by year" turns the two dates into a range', () => {
    const r = refine(base(), 'make it a slider by year', NOW);
    expect(r.intent.views).toContain('time-slider');
    expect(r.intent.views).not.toContain('swipe');
    expect(r.intent.time.kind).toBe('yearly');
  });
  it('"use landsat" pins the dataset and nothing else', () => {
    const r = refine(base(), 'use landsat', NOW);
    expect(r.intent.station).toBe('landsat');
    expect(r.intent.theme).toBe('vegetation');
    expect(r.intent.time).toEqual(base().time);
    expect(r.newPlace).toBe(false);
  });
  it('"now do Ames, Iowa" moves the place only', () => {
    const r = refine(base(), 'now do Ames, Iowa', NOW);
    expect(r.newPlace).toBe(true);
    expect(r.intent.place?.toLowerCase()).toContain('ames');
    expect(r.intent.time).toEqual(base().time);
  });
  it('"now do clovis" moves the place even in lowercase', () => {
    const r = refine(base(), 'now do clovis', NOW);
    expect(r.newPlace).toBe(true);
    expect(r.intent.place?.toLowerCase()).toBe('clovis');
  });
  it('"make it prettier" is not a place', () => {
    const r = refine(base(), 'make it prettier', NOW);
    expect(r.newPlace).toBe(false);
    expect(r.changes).toEqual([]);
  });
  it('"rain in houston during harvey" becomes that month\'s rain, not a before and after', () => {
    const flood = parseGoal('Map flooding in Houston before and after Hurricane Harvey', NOW);
    const r = refine(flood, 'rain in houston during harvey', NOW);
    expect(r.intent.theme).toBe('rain');
    expect(r.intent.time.kind).toBe('snapshot');
    expect(r.intent.views).not.toContain('swipe');
  });
  it('"zoom out" widens the area without a lookup', () => {
    const r = refine(base(), 'zoom out', NOW);
    expect(r.scale).toBe(3);
    expect(r.newPlace).toBe(false);
  });
  it('"add a chart when I click" adds history and keeps the swipe', () => {
    const r = refine(base(), 'add a chart when I click', NOW);
    expect(r.intent.views).toEqual(expect.arrayContaining(['swipe', 'click-chart']));
  });
  it('"show snow instead" changes the topic and frees the dataset', () => {
    const r = refine({ ...base(), station: 'sentinel-2' }, 'show snow instead', NOW);
    expect(r.intent.theme).toBe('snow');
    expect(r.intent.station).toBeNull();
  });
  it('"what about last summer" moves a snapshot', () => {
    const snap = parseGoal('greenness in iowa summer 2020', NOW);
    const r = refine(snap, 'what about last summer', NOW);
    expect(r.intent.time.kind).toBe('snapshot');
    if (r.intent.time.kind === 'snapshot') expect(r.intent.time.window.label).toBe('Summer 2026');
  });
});
