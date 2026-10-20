import { describe, it } from 'vitest';
import { runCase, type Case } from './helpers/promptHarness';

/** The same questions, asked many ways. Each family must land on the same place and route. */
const FAMILIES: Record<string, Case[]> = {
  'Fresno greenness, two summers': [
    { q: 'fresno county ndvi 2019 vs 2025', place: 'fresno county', theme: 'vegetation', time: 'compare', top: 'modis-vi' },
    { q: 'How did greenness in Fresno County, CA change between 2019 and 2025?', place: 'fresno county, ca', theme: 'vegetation', time: 'compare' },
    { q: 'show me vegetation in fresno county california, 2019 and 2025 side by side', place: 'fresno county california', theme: 'vegetation', time: 'compare', view: 'swipe' },
    { q: "Fresno County field greenness: summer '19 vs summer '25", place: 'fresno county', theme: 'vegetation', time: 'compare', top: 'sentinel-2' },
    { q: 'compare ndvi fresno ca 2019 2025', place: 'fresno ca', theme: 'vegetation', time: 'compare' },
  ],
  'Atlantic sea temperature since 1999': [
    { q: 'atlantic ocean sea surface temperatures since 1999', place: 'atlantic ocean', theme: 'ocean', top: 'oisst', time: 'history' },
    { q: 'SST north atlantic 1999 to present', place: 'north atlantic ocean', theme: 'ocean', top: 'oisst', time: 'history' },
    { q: 'how warm has the atlantic gotten since 1999', place: 'atlantic ocean', theme: 'ocean', top: 'oisst', time: 'history' },
    { q: 'ocean temps atlantic 1999-2026', place: 'atlantic ocean', theme: 'ocean', top: 'oisst' },
    { q: 'Show me the temperature of the Atlantic Ocean from 1999 until now', place: 'atlantic ocean', theme: 'ocean', top: 'oisst', time: 'history' },
    { q: 'atlantic sst', place: 'atlantic ocean', theme: 'ocean', top: 'oisst' },
  ],
  'Houston flooding after Harvey': [
    { q: 'houston flooding hurricane harvey', place: 'houston', theme: 'flood', top: 'sentinel-1', time: 'compare' },
    { q: 'Was Houston underwater after Harvey?', place: 'houston', theme: 'flood', top: 'sentinel-1', time: 'compare' },
    { q: 'flood extent houston tx august 2017', place: 'houston tx', theme: 'flood', top: 'sentinel-1' },
    { q: 'show flooded areas in Houston, Texas before/after Aug 2017', place: 'houston, texas', theme: 'flood', top: 'sentinel-1', time: 'compare' },
  ],
  'Crops around Ames': [
    { q: 'corn vs soybeans around ames iowa', place: 'ames iowa', theme: 'crop-type', top: 'usda-cdl' },
    { q: "what's grown near Ames, IA", place: 'ames, ia', theme: 'crop-type', top: 'usda-cdl' },
    { q: 'crop map of story county iowa 2020', place: 'story county iowa', theme: 'crop-type', top: 'usda-cdl' },
    { q: 'where is cotton grown in texas', place: 'texas', theme: 'crop-type', top: 'usda-cdl' },
    { q: 'almond orchards in tulare county 2021', place: 'tulare county', theme: 'crop-type', top: 'usda-cdl' },
    { q: 'rice fields in yolo county', place: 'yolo county', theme: 'crop-type', top: 'usda-cdl' },
  ],
  'Sierra snow': [
    { q: 'how much snow was in the sierras this winter', place: 'sierra nevada', theme: 'snow', top: 'modis-snow' },
    { q: 'snowpack sierra nevada 2023 compared to 2021', place: 'sierra nevada', theme: 'snow', top: 'modis-snow', time: 'compare' },
    { q: 'Sierra Nevada snow cover each winter 2018-2024', place: 'sierra nevada', theme: 'snow', top: 'modis-snow', time: 'yearly' },
  ],
  'Phoenix heat': [
    { q: 'phoenix heat island summer 2025', place: 'phoenix', theme: 'heat', top: 'modis-lst' },
    { q: 'Where is it hottest in Phoenix?', place: 'phoenix', theme: 'heat', top: 'modis-lst' },
    { q: 'surface temps in phoenix az july 2025', place: 'phoenix az', theme: 'heat', top: 'modis-lst' },
  ],
  'Iowa rain': [
    { q: 'how much did it rain in iowa in spring 2019', place: 'iowa', theme: 'rain', top: 'nclimgrid' },
    { q: 'iowa rainfall 2012 vs 2019', place: 'iowa', theme: 'rain', top: 'nclimgrid', time: 'compare' },
    { q: 'Total precipitation in Kansas last year', place: 'kansas', theme: 'rain', top: 'nclimgrid' },
  ],
  'California fires': [
    { q: 'california wildfires 2020', place: 'california', theme: 'fire', top: 'active-fire' },
    { q: 'fires burning in california september 2020', place: 'california', theme: 'fire', top: 'active-fire' },
    { q: 'burn scar from the camp fire', place: 'paradise, california', theme: 'fire', top: 'sentinel-2', time: 'compare' },
  ],
  'Rondônia land cover': [
    { q: 'land cover change in rondonia 1995 vs 2020', place: 'rondonia', theme: 'landcover', top: 'esa-cci-lc', time: 'compare' },
    { q: 'deforestation rondônia brazil 1995-2020', place: 'rondônia brazil', theme: 'forest-loss', top: 'esa-cci-lc' },
  ],
  'Coordinates, written every way': [
    { q: 'ndvi at 42.44 -76.50', place: '42.44000, -76.50000', theme: 'vegetation', top: 'sentinel-2' },
    { q: 'greenness 42.4440°N, 76.5019°W 2024', place: '42.44400, -76.50190', theme: 'vegetation', top: 'sentinel-2' },
    { q: 'show me 36.77,-119.42', place: '36.77000, -119.42000', top: 'sentinel-2' },
    { q: 'snow at 39.1N 120.2W last winter', place: '39.10000, -120.20000', theme: 'snow' },
  ],
  'City nicknames': [
    { q: 'NYC heat island', place: 'new york city', theme: 'heat', top: 'modis-lst' },
    { q: 'LA wildfires january 2025', place: 'los angeles, california', theme: 'fire' },
    { q: 'DC flooding', place: 'washington, dc', theme: 'flood', top: 'sentinel-1' },
    { q: 'sf bay water temperature', place: 'san francisco bay', theme: 'ocean', top: 'oisst' },
  ],
  'Asked as a request': [
    { q: 'Can you show me how green Iowa was last summer?', place: 'iowa', theme: 'vegetation', top: 'modis-vi' },
    { q: "I'd like to see snow in Colorado", place: 'colorado', theme: 'snow', top: 'modis-snow' },
    { q: 'please map land cover for kenya', place: 'kenya', theme: 'landcover', top: 'esa-cci-lc' },
    { q: 'make me an app showing water in lake okeechobee each year since 2016', place: 'lake okeechobee', theme: 'water', time: 'yearly' },
    { q: 'quick map of the everglades', place: 'everglades', top: 'modis-vi' },
  ],
};

describe('the same question, asked many ways', () => {
  for (const [family, cases] of Object.entries(FAMILIES)) {
    describe(family, () => {
      for (const c of cases) it(c.q, () => runCase(c));
    });
  }
});
