import type { AppSpec } from './spec';
import { STATION_BY_ID } from '../network/network';

/**
 * The credit line a newsroom or teacher can paste under the map, in each provider's own wording
 * where it asks for one, plus a short methods note.
 */
const CREDIT: Record<string, (years: string) => string> = {
  'sentinel-2': (y) => `Contains modified Copernicus Sentinel data ${y}`,
  'sentinel-1': (y) => `Contains modified Copernicus Sentinel data ${y}`,
  landsat: () => 'Landsat imagery courtesy of the U.S. Geological Survey',
  'modis-vi': () => 'NASA MODIS vegetation indices (MOD13Q1), LP DAAC',
  'modis-lst': () => 'NASA MODIS land surface temperature (MOD11A2), LP DAAC',
  'modis-snow': () => 'NASA MODIS snow cover (MOD10A2), NSIDC',
  'active-fire': () => 'NASA MODIS thermal anomalies and fire (MOD14A2), LP DAAC',
  oisst: () => 'NOAA Optimum Interpolation Sea Surface Temperature v2.1, NOAA NCEI',
  nclimgrid: () => 'NOAA NClimGrid monthly, NOAA NCEI',
  'usda-cdl': () => 'USDA NASS Cropland Data Layer',
  'esa-cci-lc': () => 'ESA Climate Change Initiative Land Cover',
  'io-lulc': () => 'Impact Observatory and Esri 10 m annual land cover',
  'esa-worldcover': (y) => `ESA WorldCover ${y}, CC BY 4.0`,
  'jrc-water': () => 'EC JRC Global Surface Water (Pekel et al. 2016)',
  'cop-dem': () => 'Copernicus DEM GLO-30, produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018',
};

export const BASEMAP_CREDIT = 'Basemap © OpenFreeMap, OpenMapTiles, OpenStreetMap contributors';

export function yearsOf(spec: AppSpec): string {
  const ys = Array.from(new Set(spec.windows.flatMap((w) => [w.start.slice(0, 4), w.end.slice(0, 4)]))).sort();
  return ys.length > 1 ? `${ys[0]}-${ys[ys.length - 1]}` : ys[0];
}

/** "Contains modified Copernicus Sentinel data 2019-2025. Map: Interchange." */
export function creditLine(spec: AppSpec): string {
  const f = CREDIT[spec.station];
  const data = f ? f(yearsOf(spec)) : STATION_BY_ID[spec.station]?.name ?? spec.station;
  return `${data}. Map made with Interchange.`;
}

export function methodsNote(spec: AppSpec): string {
  const st = STATION_BY_ID[spec.station];
  const when = spec.windows.map((w) => `${w.label} (${w.start} to ${w.end})`).join(' and ');
  return `${st.name}, ${st.specs.resolution}. Data for ${when}, read from ${st.access.stac ? `the ${st.access.stac} STAC collection` : 'open catalogs'}, cloud-masked with each scene's own classification where it has one, blended from the clearest days, and drawn at preview resolution. ${creditLine(spec)} ${BASEMAP_CREDIT}.`;
}
