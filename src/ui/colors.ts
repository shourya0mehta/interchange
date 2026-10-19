import { LINE_BY_ID } from '../network/network';
import type { Station } from '../network/types';

/** A station's own color: its first (primary) line. */
export function stationColor(s: Station): string {
  return LINE_BY_ID[s.lines[0]].color;
}
