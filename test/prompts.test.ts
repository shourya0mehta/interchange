import { describe, it } from 'vitest';
import { runCase, type Case } from './helpers/promptHarness';

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
  // The country is in the event's name; the map goes where the water was worst.
  { q: 'pakistan floods 2022', place: 'sindh, pakistan', theme: 'flood', top: 'sentinel-1' },
  { q: 'flooded areas in new orleans after hurricane katrina', place: 'new orleans', theme: 'flood', top: 'landsat', time: 'compare' },
  { q: 'mississippi river flooding in 2019', place: 'mississippi river', theme: 'flood', top: 'sentinel-1' },
  { q: 'flood in bangladesh june 2024', place: 'bangladesh', theme: 'flood', top: 'sentinel-1' },

  // ---- Fire -----------------------------------------------------------------------------
  { q: 'Burn severity in Paradise, California before and after November 2018', place: 'paradise, california', theme: 'fire', top: 'sentinel-2', time: 'compare' },
  { q: 'camp fire burn scar', place: 'paradise, california', theme: 'fire', top: 'sentinel-2', time: 'compare' },
  { q: 'where did fires burn in california in 2020', place: 'california', theme: 'fire', top: 'active-fire', signal: 'fire-frequency' },
  // December 2019 in Australia is the Black Summer; the map goes where it burned.
  { q: 'active fires in australia december 2019', place: 'new south wales', theme: 'fire', top: 'active-fire' },
  { q: 'wildfire hotspots near los angeles january 2025', place: 'los angeles', theme: 'fire', top: 'active-fire' },
  { q: 'how hot does phoenix get in july', place: 'phoenix', theme: 'heat', top: 'modis-lst' },
  { q: 'how cold was minnesota in january 2019', place: 'minnesota', theme: 'heat' },
  { q: 'lahaina fire damage', place: 'lahaina, hawaii', theme: 'fire', top: 'sentinel-2', time: 'compare' },
  { q: 'fire season in colorado 2020', place: 'colorado', theme: 'fire', top: 'active-fire' },

  // ---- Snow -----------------------------------------------------------------------------
  { q: 'snow cover in the sierra nevada this winter', place: 'sierra nevada', theme: 'snow', top: 'modis-snow', signal: 'snow-frequency' },
  { q: 'how long did snow last in yellowstone in 2023', place: 'yellowstone', theme: 'snow', top: 'modis-snow' },
  { q: 'snow in boulder colorado last winter', place: 'boulder colorado', theme: 'snow', top: 'sentinel-2' },
  { q: 'snowpack in the rockies 2015 vs 2023', place: 'rocky mountains', theme: 'snow', top: 'modis-snow', time: 'compare' },
  { q: 'snow around lake tahoe each winter since 2018', place: 'lake tahoe', theme: 'snow', top: 'sentinel-2', time: 'yearly' },

  // ---- Heat and temperature -------------------------------------------------------------
  // The heat island is a night-time effect: by day the desert around Phoenix is hotter than the city.
  { q: 'urban heat island in phoenix summer 2025', place: 'phoenix', theme: 'heat', top: 'modis-lst', signal: 'lst-night' },
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
  // Off the coast is the ocean, not the state.
  { q: 'marine heatwave off the coast of california 2015', place: 'california coast', theme: 'ocean', top: 'oisst', signal: 'sst-anomaly' },
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
  // ---- Phrasings found by a second sweep (Oct 19) ---------------------------------------
  { q: 'how hot does death valley get in july', place: 'death valley', theme: 'heat', top: 'modis-lst', time: 'snapshot' },
  { q: 'is the great salt lake shrinking', place: 'great salt lake', theme: 'water', time: 'compare', view: 'swipe' },
  { q: 'where is it snowing in colorado right now', place: 'colorado', theme: 'snow', time: 'snapshot' },
  { q: 'how much forest did brazil lose since 2000', place: 'brazil', theme: 'forest-loss' },
  { q: 'how much did it rain in houston during harvey', place: 'houston', theme: 'rain', top: 'nclimgrid', time: 'snapshot' },
  { q: 'ocean temperature off san diego this year', place: 'san diego', theme: 'ocean', top: 'oisst' },
  { q: 'was 2024 hotter than 2023 in phoenix', place: 'phoenix', theme: 'heat', top: 'modis-lst', time: 'compare' },
  { q: 'how dry was the corn belt in 2012', place: 'corn belt', theme: 'soil-moisture', top: 'nclimgrid' },
  { q: 'snowpack in the rockies 2023 vs 2022', place: 'rocky mountains', theme: 'snow', top: 'modis-snow', time: 'compare' },
  { q: 'lst los angeles summer 2024', place: 'los angeles', theme: 'heat', top: 'modis-lst' },
  { q: 'greenness at lat 36.7 lon -119.8 in 2024', place: '36.70000, -119.80000', theme: 'vegetation', top: 'sentinel-2' },
  { q: 'temperature in el paso texas last summer', place: 'el paso texas', theme: 'heat' },
  { q: 'st louis flooding 2019', place: 'st louis', theme: 'flood', top: 'sentinel-1' },
];

describe('prompt bank', () => {
  for (const c of CASES) it(c.q, () => runCase(c));
});
