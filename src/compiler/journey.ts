import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { STATION_BY_ID } from '../network/network';
import type { AppSpec } from './spec';

/**
 * A journey: several maps in order, each with a caption, published as one scrolling story.
 * Like an app, it lives entirely in its link.
 */
export interface JourneyStop {
  spec: AppSpec;
  caption: string;
}

export interface Journey {
  v: 1;
  title: string;
  intro?: string;
  stops: JourneyStop[];
  createdAt: string;
}

export function encodeJourney(j: Journey): string {
  return compressToEncodedURIComponent(JSON.stringify(j));
}

export function decodeJourney(token: string): Journey | null {
  try {
    const json = decompressFromEncodedURIComponent(token);
    if (!json) return null;
    const j = JSON.parse(json) as Journey;
    if (j.v !== 1 || !Array.isArray(j.stops) || !j.stops.length) return null;
    if (!j.stops.every((s) => s.spec && s.spec.v === 1 && STATION_BY_ID[s.spec.station] && Array.isArray(s.spec.windows))) return null;
    return j;
  } catch {
    return null;
  }
}
