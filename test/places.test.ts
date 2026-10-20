import { describe, expect, it } from 'vitest';
import { photonScore } from '../src/planner/places';

const f = (name: string, type: string, osm_key: string, osm_value: string, state = 'California') => ({
  properties: { name, type, osm_key, osm_value, state, country: 'United States', extent: [0, 1, 1, 0] as [number, number, number, number] },
  geometry: { coordinates: [0.5, 0.5] as [number, number] },
});

describe('Photon ranking', () => {
  it('prefers the county over a cemetery that shares its name', () => {
    const q = 'Fresno County, California';
    expect(photonScore(f('Fresno', 'county', 'place', 'county'), q)).toBeGreaterThanOrEqual(5);
    expect(photonScore(f('Fresno County Cemetery #1', 'other', 'landuse', 'cemetery'), q)).toBeLessThan(3);
    expect(photonScore(f('Fresno County Laton-Kingston Park', 'other', 'leisure', 'park'), q)).toBeLessThan(5);
  });
  it('accepts cities, lakes and parks named in the question', () => {
    expect(photonScore(f('Houston', 'city', 'place', 'city', 'Texas'), 'houston')).toBeGreaterThanOrEqual(5);
    expect(photonScore(f('Lake Mead', 'other', 'water', 'reservoir', 'Nevada'), 'lake mead')).toBeGreaterThanOrEqual(5);
    expect(photonScore(f('Central Park', 'other', 'leisure', 'park', 'NY'), 'central park')).toBeGreaterThanOrEqual(5);
    expect(photonScore(f('Ithaca', 'city', 'place', 'city', 'New York'), 'ithaca ny')).toBeGreaterThanOrEqual(5);
  });
  it('rejects streets and buildings', () => {
    expect(photonScore(f('Central Park West', 'street', 'highway', 'secondary', 'New York'), 'central park')).toBeLessThan(3);
    expect(photonScore(f('Story County Storage', 'house', 'building', 'yes', 'Iowa'), 'story county iowa')).toBeLessThan(3);
  });
});

describe('Place lookup when the services are down', () => {
  it('says so at once instead of retrying', async () => {
    const { nominatim } = await import('../src/planner/places');
    const { setFetcher } = await import('../src/runtime/stac');
    let calls = 0;
    setFetcher((async () => {
      calls++;
      return new Response('busy', { status: 503 });
    }) as typeof fetch);
    const t0 = Date.now();
    await expect(nominatim('Somewhere Unusual County, Iowa')).rejects.toMatchObject({ name: 'LookupDown' });
    expect(Date.now() - t0).toBeLessThan(500);
    expect(calls).toBe(2);
    setFetcher(fetch);
  });
  it('still answers "not found" when the services are up', async () => {
    const { nominatim } = await import('../src/planner/places');
    const { setFetcher } = await import('../src/runtime/stac');
    setFetcher((async (u: string) => new Response(String(u).includes('photon') ? '{"features":[]}' : '[]', { status: 200 })) as unknown as typeof fetch);
    await expect(nominatim('Nowhere At All')).resolves.toBeNull();
    setFetcher(fetch);
  }, 10_000);
});

describe('Photon ranking for countries', () => {
  it('prefers the country over a neighborhood that shares its English name', () => {
    const country = { properties: { name: 'বাংলাদেশ', type: 'country', osm_key: 'place', osm_value: 'country', country: 'Bangladesh', extent: [88, 26.6, 92.7, 20.7] as [number, number, number, number] }, geometry: { coordinates: [90, 24] as [number, number] } };
    const quarter = { properties: { name: 'Bangladesh', type: 'locality', osm_key: 'place', osm_value: 'quarter', country: 'Kenya', state: 'Mombasa' }, geometry: { coordinates: [39.6, -4] as [number, number] } };
    expect(photonScore(country, 'bangladesh')).toBeGreaterThan(photonScore(quarter, 'bangladesh'));
  });
});

describe('Boundary files', () => {
  it('reads the box around a GeoJSON field', async () => {
    const { boundaryBbox } = await import('../src/ui/PlacePicker');
    const gj = JSON.stringify({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-93.70, 42.00], [-93.65, 42.00], [-93.65, 42.04], [-93.70, 42.04], [-93.70, 42.00]]] } });
    expect(boundaryBbox(gj)).toEqual([-93.7, 42, -93.65, 42.04]);
  });
  it('reads KML coordinates', async () => {
    const { boundaryBbox } = await import('../src/ui/PlacePicker');
    const kml = '<kml><Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>-120.1,36.1,0 -119.9,36.1,0 -119.9,36.3,0 -120.1,36.1,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>';
    expect(boundaryBbox(kml)).toEqual([-120.1, 36.1, -119.9, 36.3]);
  });
  it('rejects files with no coordinates', async () => {
    const { boundaryBbox } = await import('../src/ui/PlacePicker');
    expect(boundaryBbox('hello')).toBeNull();
  });
});
