import { describe, expect, it } from 'vitest';
import { parseGoal, type Theme } from '../src/planner/intent';
import { regionByName } from '../src/planner/gazetteer';
import { planRoutes, type Place } from '../src/planner/plan';
import type { Bbox } from '../src/runtime/geo';
import { compileRoute } from '../src/compiler/spec';
import { checkRoute } from '../src/network/typecheck';

/**
 * The prompt bank: sentences people actually type, each with what Interchange should hear and
 * which route it should lead with. Places resolve through a fixed table (the live geocoder is
 * exercised by the browser walkthrough).
 */

const NOW = new Date('2026-10-19T12:00:00Z');

const TABLE: Record<string, Bbox> = {
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
};

function tableGeo(phrase: string): Place | null {
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

function resolve(intent: ReturnType<typeof parseGoal>): { place: Place | null; phrase: string | null } {
  for (const p of [intent.place, ...intent.places].filter((x): x is string => !!x)) {
    const hit = tableGeo(p);
    if (hit) return { place: hit, phrase: p };
  }
  return { place: null, phrase: null };
}

interface Case {
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

const CASES: Case[] = [
  // ---- Greenness ------------------------------------------------------------------------
  { q: 'Compare greenness in Fresno County, California in summer 2019 vs summer 2025', place: 'fresno county, california', theme: 'vegetation', top: 'modis-vi', time: 'compare', view: 'swipe' },
  { q: 'compare greenness in fresno in summer 2019 vs summer 2025', place: 'fresno', theme: 'vegetation', top: 'sentinel-2', time: 'compare' },
  { q: 'ndvi near ithaca ny 2024', place: 'ithaca ny', theme: 'vegetation', top: 'sentinel-2', time: 'snapshot' },
  { q: 'how green was central park this summer', place: 'central park', theme: 'vegetation', top: 'sentinel-2' },
  { q: 'vegetation health in iowa since 2015', place: 'iowa', theme: 'vegetation', top: 'modis-vi', time: 'history', view: 'click-chart' },
  { q: 'greenness of the amazon rainforest 2001 vs 2024', place: 'amazon rainforest', theme: 'vegetation', top: 'modis-vi', time: 'compare' },
  { q: 'crop health in the corn belt last summer', place: 'corn belt', theme: 'vegetation', top: 'modis-vi' },
  { q: 'greenness at 42.44, -76.50 in 2023', place: '42.44000, -76.50000', theme: 'vegetation', top: 'sentinel-2' },
  { q: 'Show me NDVI for my farm at 40.10, -88.20 every summer since 2018', place: '40.10000, -88.20000', theme: 'vegetation', top: 'sentinel-2', time: 'yearly', view: 'time-slider' },
  { q: 'greeness in fresno', place: 'fresno', theme: 'vegetation', top: 'sentinel-2' },
  { q: 'NDVI ITHACA 2023', place: 'ithaca', theme: 'vegetation', top: 'sentinel-2' },
  { q: 'how has vegetation changed in kenya over the past 20 years', place: 'kenya', theme: 'vegetation', top: 'modis-vi', time: 'compare' },
  { q: 'Greenness in the 1990s around Las Vegas', place: 'las vegas', theme: 'vegetation', top: 'landsat', time: 'history' },
  { q: 'vineyard greenness in napa valley july 2024', place: 'napa valley', theme: 'vegetation', top: 'sentinel-2' },
  { q: 'Click any field in Story County Iowa for its NDVI history since 2019', place: 'story county iowa', theme: 'vegetation', top: 'sentinel-2', view: 'click-chart' },

  // ---- Cover crops and crop types -------------------------------------------------------
  { q: 'Show which fields in Tompkins County, NY had a cover crop each spring since 2018, and click a field for its history', place: 'tompkins county, ny', theme: 'cover-crop', top: 'sentinel-2', time: 'yearly' },
  { q: 'which fields in story county iowa had cover crops in spring 2022', place: 'story county iowa', theme: 'cover-crop', top: 'sentinel-2' },
  { q: 'what crops are grown in fresno county', place: 'fresno county', theme: 'crop-type', top: 'usda-cdl' },
  { q: 'how much of kern county is almonds', place: 'kern county', theme: 'crop-type', top: 'usda-cdl', view: 'region-stats' },
  { q: 'crop rotation in champaign county since 2010', place: 'champaign county', theme: 'crop-type', top: 'usda-cdl' },
  { q: "what's planted around ames iowa", place: 'ames iowa', theme: 'crop-type', top: 'usda-cdl' },
  { q: 'corn and soybeans in mclean county illinois 2021', place: 'mclean county illinois', theme: 'crop-type', top: 'usda-cdl' },
  { q: 'what crops grow in punjab india', place: 'punjab india', theme: 'crop-type', top: 'esa-cci-lc' },
  { q: 'Map crop types in the Salinas Valley in 2020', place: 'salinas valley', theme: 'crop-type', top: 'usda-cdl' },
  { q: 'alfalfa fields in the imperial valley', place: 'imperial valley', theme: 'crop-type', top: 'usda-cdl' },

  // ---- Water and floods -----------------------------------------------------------------
  { q: 'Lake Mead water each year from 2015 to 2024', place: 'lake mead', theme: 'water', top: 'landsat', time: 'yearly' },
  { q: 'how has lake powell changed since 2000', place: 'lake powell', theme: 'water', top: 'landsat', time: 'compare' },
  { q: 'show me the great salt lake shrinking 1990 vs 2024', place: 'great salt lake', theme: 'water', top: 'landsat', time: 'compare' },
  { q: 'water in cayuga lake', place: 'cayuga lake', theme: 'water', top: 'sentinel-2' },
  { q: 'Map flooding in Houston before and after August 2017', place: 'houston', theme: 'flood', top: 'sentinel-1', time: 'compare' },
  { q: 'flooding from hurricane harvey', place: 'houston, texas', theme: 'flood', top: 'sentinel-1', time: 'compare' },
  { q: 'pakistan floods 2022', place: 'pakistan', theme: 'flood', top: 'sentinel-1' },
  { q: 'flooded areas in new orleans after hurricane katrina', place: 'new orleans', theme: 'flood', top: 'landsat', time: 'compare' },
  { q: 'mississippi river flooding in 2019', place: 'mississippi river', theme: 'flood', top: 'sentinel-1' },
  { q: 'flood in bangladesh june 2024', place: 'bangladesh', theme: 'flood', top: 'sentinel-1' },

  // ---- Fire -----------------------------------------------------------------------------
  { q: 'Burn severity in Paradise, California before and after November 2018', place: 'paradise, california', theme: 'fire', top: 'sentinel-2', time: 'compare' },
  { q: 'camp fire burn scar', place: 'paradise, california', theme: 'fire', top: 'sentinel-2', time: 'compare' },
  { q: 'where did fires burn in california in 2020', place: 'california', theme: 'fire', top: 'active-fire', signal: 'fire-frequency' },
  { q: 'active fires in australia december 2019', place: 'australia', theme: 'fire', top: 'active-fire' },
  { q: 'wildfire hotspots near los angeles january 2025', place: 'los angeles', theme: 'fire', top: 'active-fire' },
  { q: 'lahaina fire damage', place: 'lahaina, hawaii', theme: 'fire', top: 'sentinel-2', time: 'compare' },
  { q: 'fire season in colorado 2020', place: 'colorado', theme: 'fire', top: 'active-fire' },

  // ---- Snow -----------------------------------------------------------------------------
  { q: 'snow cover in the sierra nevada this winter', place: 'sierra nevada', theme: 'snow', top: 'modis-snow', signal: 'snow-frequency' },
  { q: 'how long did snow last in yellowstone in 2023', place: 'yellowstone', theme: 'snow', top: 'modis-snow' },
  { q: 'snow in boulder colorado last winter', place: 'boulder colorado', theme: 'snow', top: 'sentinel-2' },
  { q: 'snowpack in the rockies 2015 vs 2023', place: 'rocky mountains', theme: 'snow', top: 'modis-snow', time: 'compare' },
  { q: 'snow around lake tahoe each winter since 2018', place: 'lake tahoe', theme: 'snow', top: 'sentinel-2', time: 'yearly' },

  // ---- Heat and temperature -------------------------------------------------------------
  { q: 'urban heat island in phoenix summer 2025', place: 'phoenix', theme: 'heat', top: 'modis-lst', signal: 'lst' },
  { q: 'hottest neighborhoods in miami', place: 'miami', theme: 'heat', top: 'modis-lst' },
  { q: 'temperature in ithaca since 1950', place: 'ithaca', theme: 'heat', top: 'nclimgrid', signal: 'air-temp', time: 'history' },
  { q: 'average summer air temperature in texas 1950 vs 2020', place: 'texas', theme: 'heat', top: 'nclimgrid', time: 'compare' },
  { q: 'heat wave in europe july 2022', place: 'europe', theme: 'heat', top: 'modis-lst' },
  { q: "what's the temprature like in denver", place: 'denver', theme: 'heat', top: 'modis-lst' },
  { q: 'land surface temperature of dubai', place: 'dubai', theme: 'heat', top: 'modis-lst' },
  { q: 'how much has portland oregon warmed since 1900', place: 'portland oregon', theme: 'heat', top: 'nclimgrid', time: 'history' },

  // ---- Rain -----------------------------------------------------------------------------
  { q: 'rainfall in iowa 2019 vs 2012', place: 'iowa', theme: 'rain', top: 'nclimgrid', signal: 'precip', time: 'compare' },
  { q: 'monsoon rain in india 2023', place: 'india', theme: 'rain', top: 'chirps', runs: 'export' },
  { q: 'how much rain fell in kansas each year since 2010', place: 'kansas', theme: 'rain', top: 'nclimgrid', time: 'yearly' },
  { q: 'precipitation in washington state over the last decade', place: 'washington state', theme: 'rain', top: 'nclimgrid', time: 'history' },
  { q: 'wettest spring in minnesota 2019', place: 'minnesota', theme: 'rain', top: 'nclimgrid' },

  // ---- Ocean ----------------------------------------------------------------------------
  { q: 'i want sea surface temeprature, 1999-now, atlantic ocean', place: 'atlantic ocean', theme: 'ocean', top: 'oisst', signal: 'sst', time: 'history' },
  { q: 'sst in the gulf of mexico last summer', place: 'gulf of mexico', theme: 'ocean', top: 'oisst' },
  { q: 'marine heatwave off the coast of california 2015', place: 'california', theme: 'ocean', top: 'oisst', signal: 'sst-anomaly' },
  { q: 'el nino pacific ocean temperature anomaly 2023', place: 'eastern pacific ocean', theme: 'ocean', top: 'oisst', signal: 'sst-anomaly' },
  { q: 'coral bleaching risk on the great barrier reef 2024', place: 'great barrier reef', theme: 'ocean', top: 'oisst', signal: 'sst-anomaly' },
  { q: 'ocean temperature in monterey bay', place: 'monterey bay', theme: 'ocean', top: 'oisst' },
  { q: 'Sea surface temperature of the Mediterranean, 2003 vs 2023', place: 'mediterranean sea', theme: 'ocean', top: 'oisst', time: 'compare' },
  { q: 'ocean heat content below the surface in the north atlantic', place: 'north atlantic ocean', theme: 'ocean', top: 'argo', runs: 'export' },
  { q: 'water temp of the ocean near cape cod since 2010', place: 'cape cod', theme: 'ocean', top: 'oisst', time: 'history' },
  { q: 'gulf stream temperature', place: 'gulf stream', theme: 'ocean', top: 'oisst' },
  { q: 'arctic sea surface temperature 1990 vs 2025', place: 'arctic ocean', theme: 'ocean', top: 'oisst' },

  // ---- Land cover and change ------------------------------------------------------------
  { q: 'How much of Austin, Texas is built up?', place: 'austin, texas', theme: 'built', top: 'io-lulc', view: 'region-stats' },
  { q: 'land cover of kenya', place: 'kenya', theme: 'landcover', top: 'esa-cci-lc' },
  { q: 'deforestation in rondonia brazil since 1995', place: 'rondonia brazil', theme: 'forest-loss', top: 'esa-cci-lc' },
  { q: 'urban growth of las vegas 1995 vs 2020', place: 'las vegas', theme: 'built', top: 'esa-cci-lc' },
  { q: 'what covers the netherlands', place: 'netherlands', theme: 'landcover', top: 'esa-cci-lc' },
  { q: 'land use around sacramento in 2021', place: 'sacramento', theme: 'landcover', top: 'io-lulc' },
  { q: 'how much of minnesota is forest', place: 'minnesota', theme: 'landcover', top: 'esa-cci-lc', view: 'region-stats' },

  // ---- Terrain and imagery --------------------------------------------------------------
  { q: 'elevation of mount rainier', place: 'mount rainier', theme: 'terrain', top: 'cop-dem' },
  { q: 'what does the salton sea look like now', place: 'salton sea', theme: 'imagery', top: 'sentinel-2', signal: 'true-color' },
  { q: 'true color image of manhattan', place: 'manhattan', theme: 'imagery', top: 'sentinel-2' },
  { q: 'satellite picture of kauai', place: 'kauai', theme: 'imagery', top: 'sentinel-2' },
  { q: 'crop water stress in the central valley 2021', place: 'central valley, california', theme: 'moisture', top: 'landsat' },

  // ---- Export-only themes ---------------------------------------------------------------
  { q: 'air quality in delhi 2024', place: 'delhi', theme: 'air', top: 's5p', runs: 'export' },
  { q: 'night lights in puerto rico before and after hurricane maria', place: 'puerto rico', theme: 'night-lights', top: 'viirs-night', runs: 'export' },
  { q: 'soil moisture in kansas', place: 'kansas', theme: 'soil-moisture', top: 'smap', runs: 'export' },
  { q: 'groundwater loss in the central valley', place: 'central valley, california', theme: 'groundwater', top: 'grace', runs: 'export' },
  { q: 'canopy height in redwood national park', place: 'redwood national park', theme: 'canopy-height', top: 'gedi', runs: 'export' },

  // ---- Big regions, named in many ways ---------------------------------------------------
  { q: 'greenness across the united states this summer', place: 'lower 48 us states', theme: 'vegetation', top: 'modis-vi' },
  { q: 'snow in the alps january 2024', place: 'alps', theme: 'snow', top: 'modis-snow' },
  { q: 'Fires in the Amazon in 2019', place: 'amazon rainforest', theme: 'fire', top: 'active-fire' },
  { q: 'drought stress in the sahel', place: 'sahel', theme: 'soil-moisture', top: 'modis-vi' },
  { q: 'Gulf of Maine water temperature each summer since 2015', place: 'gulf of maine', theme: 'ocean', top: 'oisst', time: 'yearly' },
  { q: 'ocean temps in the caribbean', place: 'caribbean sea', theme: 'ocean', top: 'oisst' },
  { q: 'rainfall in the midwest 2012 vs 2019', place: 'us midwest', theme: 'rain', top: 'nclimgrid' },
  { q: 'land surface temperature across the western us summer 2021', place: 'western us', theme: 'heat', top: 'modis-lst' },
];

describe('prompt bank', () => {
  for (const c of CASES) {
    it(c.q, () => {
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
    });
  }
});
