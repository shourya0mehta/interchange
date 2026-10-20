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
