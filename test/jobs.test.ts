import { describe, expect, it } from 'vitest';
import { parseGoal } from '../src/planner/intent';
import { planRoutes } from '../src/planner/plan';
import { compileRoute } from '../src/compiler/spec';

// The home page's ready-made journeys must each compile to a live app.
const STOPS: [string, [number, number, number, number], string][] = [
  ['Map flooding in Houston before and after Hurricane Harvey', [-95.79, 29.52, -95.01, 30.11], 'sentinel-1'],
  ['How much did it rain in Houston during Hurricane Harvey', [-95.79, 29.52, -95.01, 30.11], 'nclimgrid'],
  ['Snow cover in the Sierra Nevada, winter 2021 vs winter 2023', [-121.5, 35.4, -117.8, 40.3], 'modis-snow'],
  ['Lake Oroville water, summer 2021 vs summer 2023', [-121.55, 39.5, -121.3, 39.85], 'sentinel-2'],
  ['Compare greenness of fields in Fresno County, California in summer 2019 vs summer 2025', [-120.92, 35.9, -118.36, 37.59], 'sentinel-2'],
  ['What crops grew in Fresno County, California in 2021', [-120.92, 35.9, -118.36, 37.59], 'usda-cdl'],
  ['Land surface temperature in Fresno County, California, summer 2025', [-120.92, 35.9, -118.36, 37.59], 'modis-lst'],
];

describe('Home page journeys', () => {
  for (const [q, bbox, station] of STOPS)
    it(q, () => {
      const plan = planRoutes(parseGoal(q), { name: 'x', bbox });
      const r = plan.routes.find((x) => x.runs === 'live');
      expect(r?.station).toBe(station);
      expect(compileRoute(r!, q).spec).toBeTruthy();
    });
});
