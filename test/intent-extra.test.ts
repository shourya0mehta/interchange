import { expect, it } from 'vitest';
import { parseGoal } from '../src/planner/intent';
const NOW = new Date('2026-10-18T12:00:00Z');
it('reads the cover crop example as a yearly slider plus history', () => {
  const i = parseGoal('Show which fields in Tompkins County, NY had a cover crop each spring since 2018, and click a field for its history', NOW);
  expect(i.place).toBe('Tompkins County, NY');
  expect(i.views).toEqual(expect.arrayContaining(['time-slider', 'click-chart']));
  expect(i.time.kind).toBe('yearly');
});
