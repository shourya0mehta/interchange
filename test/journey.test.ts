import { describe, expect, it } from 'vitest';
import { decodeJourney, encodeJourney, type Journey } from '../src/compiler/journey';
import { compileRoute } from '../src/compiler/spec';
import { parseGoal } from '../src/planner/intent';
import { planRoutes } from '../src/planner/plan';
import { NOW } from './helpers/promptHarness';

const spec = (q: string, bbox: [number, number, number, number]) => {
  const plan = planRoutes(parseGoal(q, NOW), { name: 'Somewhere', bbox });
  return compileRoute(plan.routes.find((r) => r.runs === 'live')!, q, NOW).spec!;
};

describe('Journeys', () => {
  it('round-trips through a link that stays a reasonable length', () => {
    const j: Journey = {
      v: 1,
      title: 'Three summers in the Central Valley',
      stops: [
        { spec: spec('greenness summer 2019 vs summer 2025', [-120.2, 36.4, -119.5, 37]), caption: 'Fields that went fallow.' },
        { spec: spec('land surface temperature summer 2025', [-120.2, 36.4, -119.5, 37]), caption: 'Where it ran hottest.' },
        { spec: spec('what crops grew in 2021', [-120.2, 36.4, -119.5, 37]), caption: 'What was planted.' },
      ],
      createdAt: '2026-10-20',
    };
    const token = encodeJourney(j);
    expect(token.length).toBeLessThan(3000);
    expect(decodeJourney(token)).toEqual(j);
  });
  it('refuses a damaged link', () => {
    expect(decodeJourney('not-a-journey')).toBeNull();
  });
});
