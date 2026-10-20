import type { Bbox } from '../runtime/geo';

/**
 * Oceans, seas and big natural or informal regions that a street geocoder answers badly (a point
 * in the middle of the Atlantic, or nothing for "the Corn Belt"). Boxes are hand-set and stay
 * west of the date line, since the grid can't wrap.
 */
export interface Region {
  name: string;
  re: RegExp;
  bbox: Bbox;
  /** Shown under the route when the box is a compromise. */
  note?: string;
  /**
   * A country's mainland. Used when the country itself is the place ("land cover of the
   * Netherlands"), never ahead of a town named with it ("Amsterdam, Netherlands").
   */
  country?: true;
}

export const REGIONS: Region[] = [
  // Oceans and seas. More specific names come first.
  { name: 'North Atlantic Ocean', re: /\bnorth(ern)? atlantic( ocean)?\b/i, bbox: [-82, 0, 0, 66] },
  { name: 'South Atlantic Ocean', re: /\bsouth(ern)? atlantic( ocean)?\b/i, bbox: [-68, -60, 20, 0] },
  { name: 'Mid-Atlantic US', re: /\bmid[- ]atlantic\b/i, bbox: [-80.6, 36.5, -73.5, 42.5] },
  { name: 'Atlantic Ocean', re: /\b(the )?atlantic( ocean)?\b(?! city| beach| county| highlands)/i, bbox: [-82, -55, 18, 66] },
  { name: 'Pacific Northwest', re: /\bpacific north ?west\b|\bthe pnw\b/i, bbox: [-125, 41.9, -116.4, 49.1] },
  { name: 'Western Pacific Ocean', re: /\bwest(ern)? pacific\b/i, bbox: [118, -40, 180, 45], note: 'The west Pacific is shown up to the date line.' },
  { name: 'North Pacific Ocean', re: /\bnorth(ern)? pacific( ocean)?\b/i, bbox: [-180, 0, -110, 62], note: 'The map stops at the date line, so this is the North Pacific east of it.' },
  { name: 'Eastern Pacific Ocean', re: /\b(east(ern)? )?pacific( ocean)?\b(?! grove| palisades| coast highway| crest)/i, bbox: [-180, -55, -77, 60], note: 'The map stops at the date line, so this is the Pacific east of it.' },
  { name: 'Indian Ocean', re: /\bindian ocean\b/i, bbox: [20, -50, 120, 25] },
  { name: 'Southern Ocean', re: /\bsouthern ocean\b/i, bbox: [-180, -75, 180, -45] },
  { name: 'Arctic Ocean', re: /\barctic( ocean| sea ice)?\b/i, bbox: [-180, 66, 180, 85] },
  { name: 'Gulf of Mexico', re: /\bgulf of mexico\b|\bthe gulf coast\b/i, bbox: [-98, 18, -80.5, 31] },
  { name: 'Gulf of Maine', re: /\bgulf of maine\b/i, bbox: [-71, 41, -64.5, 45.2] },
  { name: 'Gulf of California', re: /\bgulf of california\b|\bsea of cortez\b/i, bbox: [-115.5, 22.5, -107, 32] },
  { name: 'Gulf of Alaska', re: /\bgulf of alaska\b/i, bbox: [-156, 52, -132, 61] },
  { name: 'Caribbean Sea', re: /\bcaribbean( sea)?\b/i, bbox: [-89, 9, -59, 23] },
  { name: 'Sargasso Sea', re: /\bsargasso( sea)?\b/i, bbox: [-75, 20, -35, 35] },
  { name: 'Gulf Stream', re: /\bgulf stream\b/i, bbox: [-82, 24, -40, 45] },
  { name: 'Mediterranean Sea', re: /\bmediterranean( sea)?\b/i, bbox: [-6, 30, 36.5, 46] },
  { name: 'North Sea', re: /\bnorth sea\b/i, bbox: [-4, 51, 9, 61.5] },
  { name: 'Baltic Sea', re: /\bbaltic( sea)?\b/i, bbox: [9, 53.5, 30.5, 66] },
  { name: 'Black Sea', re: /\bblack sea\b/i, bbox: [27, 40.5, 42, 47.5] },
  { name: 'Caspian Sea', re: /\bcaspian( sea)?\b/i, bbox: [46.5, 36.5, 55, 47.5] },
  { name: 'Red Sea', re: /\bred sea\b/i, bbox: [32, 12, 44, 30] },
  { name: 'Persian Gulf', re: /\bpersian gulf\b|\barabian gulf\b/i, bbox: [47.5, 23.5, 57, 30.5] },
  { name: 'Arabian Sea', re: /\barabian sea\b/i, bbox: [50, 5, 77, 26] },
  { name: 'Bay of Bengal', re: /\bbay of bengal\b/i, bbox: [78, 5, 95, 23] },
  { name: 'South China Sea', re: /\bsouth china sea\b/i, bbox: [99, 0, 122, 24] },
  { name: 'East China Sea', re: /\beast china sea\b/i, bbox: [117, 23, 131, 34] },
  { name: 'Sea of Japan', re: /\bsea of japan\b|\beast sea\b/i, bbox: [127, 33, 142, 52] },
  { name: 'Bering Sea', re: /\bbering sea\b/i, bbox: [-180, 51, -157, 66] },
  { name: 'Coral Sea', re: /\bcoral sea\b/i, bbox: [142, -30, 165, -9] },
  { name: 'Great Barrier Reef', re: /\bgreat barrier reef\b/i, bbox: [142, -24.5, 154, -10] },
  { name: 'Tasman Sea', re: /\btasman sea\b/i, bbox: [147, -47, 175, -28] },
  { name: 'Hudson Bay', re: /\bhudson bay\b/i, bbox: [-95.5, 51, -76, 64.5] },
  { name: 'Labrador Sea', re: /\blabrador sea\b/i, bbox: [-64, 52, -44, 66] },
  { name: 'Chesapeake Bay', re: /\bchesapeake( bay)?\b/i, bbox: [-77.5, 36.8, -75.8, 39.7] },
  { name: 'San Francisco Bay', re: /\bsan francisco bay\b|\bsf bay\b|\bthe bay area\b|\bbay area\b/i, bbox: [-122.65, 37.2, -121.75, 38.2] },
  { name: 'Puget Sound', re: /\bpuget sound\b/i, bbox: [-123.2, 47, -122.2, 48.4] },
  { name: 'Long Island Sound', re: /\blong island sound\b/i, bbox: [-74, 40.7, -71.8, 41.4] },
  { name: 'Great Lakes', re: /\bgreat lakes\b/i, bbox: [-92.5, 41, -75.5, 49.2] },
  { name: 'Lake Superior', re: /\blake superior\b/i, bbox: [-92.3, 46.4, -84.3, 49.1] },
  { name: 'Lake Michigan', re: /\blake michigan\b/i, bbox: [-88.1, 41.6, -84.7, 46.1] },
  { name: 'Lake Huron', re: /\blake huron\b/i, bbox: [-84.8, 43, -79.6, 46.4] },
  { name: 'Lake Erie', re: /\blake erie\b/i, bbox: [-83.6, 41.3, -78.8, 42.9] },
  { name: 'Lake Ontario', re: /\blake ontario\b/i, bbox: [-79.9, 43.1, -76, 44.3] },
  // Natural and informal regions.
  { name: 'Amazon rainforest', re: /\bamazon( rain ?forest| basin| jungle)?\b(?! river)/i, bbox: [-80, -20, -44, 6] },
  { name: 'Congo Basin', re: /\bcongo (basin|rain ?forest)\b/i, bbox: [12, -10, 32, 6] },
  { name: 'Sahara', re: /\bsahara( desert)?\b/i, bbox: [-17, 15, 38, 33] },
  { name: 'Sahel', re: /\bsahel\b/i, bbox: [-17, 10, 40, 19] },
  { name: 'Cerrado', re: /\bcerrado\b/i, bbox: [-60, -24, -41, -2] },
  { name: 'Pampas', re: /\bpampas\b/i, bbox: [-65, -39, -57, -30] },
  { name: 'Great Plains', re: /\bgreat plains\b/i, bbox: [-106, 31, -95, 49] },
  { name: 'Corn Belt', re: /\bcorn belt\b/i, bbox: [-100, 37, -80, 47] },
  { name: 'Central Valley, California', re: /\bcentral valley\b/i, bbox: [-122.6, 34.9, -118.6, 40.7] },
  { name: 'San Joaquin Valley', re: /\bsan joaquin valley\b/i, bbox: [-121.6, 34.9, -118.6, 38.3] },
  { name: 'Sierra Nevada', re: /\bsierra nevada\b(?!,? spain)|\bthe sierras?\b/i, bbox: [-121.5, 35.4, -117.8, 40.3] },
  { name: 'Rocky Mountains', re: /\brocky mountains\b|\bthe rockies\b|\brockies\b/i, bbox: [-115, 35, -104, 49] },
  { name: 'Cascade Range', re: /\bcascade (range|mountains)\b|\bthe cascades\b/i, bbox: [-123, 40.5, -120, 49] },
  { name: 'Appalachian Mountains', re: /\bappalachian( mountains)?s?\b|\bappalachia\b/i, bbox: [-85, 34, -71, 47] },
  { name: 'Alps', re: /\b(the )?alps\b|\balpine region\b/i, bbox: [5.5, 44, 16.5, 48.3] },
  { name: 'Himalaya', re: /\bhimalaya[sn]?\b/i, bbox: [73, 26.5, 97, 36] },
  { name: 'Tibetan Plateau', re: /\btibetan plateau\b/i, bbox: [78, 27, 104, 39] },
  { name: 'Andes', re: /\b(the )?andes\b/i, bbox: [-80, -40, -63, 11] },
  { name: 'Everglades', re: /\beverglades\b/i, bbox: [-81.6, 25, -80.2, 26.7] },
  { name: 'Mississippi River Delta', re: /\bmississippi (river )?delta\b/i, bbox: [-91.5, 28.9, -88.8, 31] },
  { name: 'Nile Delta', re: /\bnile delta\b/i, bbox: [29.5, 30, 32.6, 31.6] },
  { name: 'Mekong Delta', re: /\bmekong delta\b/i, bbox: [104.4, 8.5, 106.9, 11] },
  { name: 'Sundarbans', re: /\bsundarbans\b|\bganges delta\b/i, bbox: [88, 21.5, 90.5, 22.8] },
  { name: 'Finger Lakes', re: /\bfinger lakes\b/i, bbox: [-77.8, 42.3, -76.3, 43] },
  { name: 'New England', re: /\bnew england\b/i, bbox: [-73.8, 40.9, -66.9, 47.5] },
  { name: 'US Midwest', re: /\b(the )?midwest\b/i, bbox: [-104.1, 36, -80.5, 49.4] },
  { name: 'Western US', re: /\b(the )?(western (us|united states)|american west)\b/i, bbox: [-125, 31, -102, 49] },
  { name: 'South America', re: /\bsouth america\b/i, bbox: [-82, -56, -34, 13] },
  { name: 'Central America', re: /\bcentral america\b/i, bbox: [-92.5, 7, -77, 18.5] },
  { name: 'Southeast Asia', re: /\bsouth ?east asia\b/i, bbox: [92, -11, 141, 28.5] },
  { name: 'East Africa', re: /\beast africa\b|\bhorn of africa\b/i, bbox: [28, -12, 52, 15] },
  { name: 'West Africa', re: /\bwest africa\b/i, bbox: [-18, 4, 16, 25] },
  { name: 'Africa', re: /(?<!south )\bafrica\b/i, bbox: [-18, -35, 52, 37.5] },
  { name: 'Europe', re: /\beurope\b/i, bbox: [-25, 34, 45, 71] },
  { name: 'Middle East', re: /\bmiddle east\b/i, bbox: [34, 12, 63, 42] },
  // Countries whose official extent reaches far-off islands, which would put the box's center in
  // the ocean (the Netherlands reaches the Caribbean, Australia reaches Heard Island).
  { name: 'Netherlands', re: /\b(the )?netherlands\b|\bholland\b(?!,? (mi|michigan))/i, bbox: [3.3, 50.75, 7.23, 53.56], country: true },
  { name: 'France', re: /(?<!new )\bfrance\b/i, bbox: [-5.2, 41.3, 9.6, 51.1], country: true },
  { name: 'Australia', re: /(?<!(western|south) )\baustralia\b/i, bbox: [112.9, -43.7, 153.7, -10.6], country: true },
  { name: 'New Zealand', re: /\bnew zealand\b/i, bbox: [166.3, -47.4, 178.6, -34.3], country: true },
  { name: 'Norway', re: /\bnorway\b/i, bbox: [4.5, 57.9, 31.2, 71.2], country: true },
  { name: 'Denmark', re: /\bdenmark\b/i, bbox: [8, 54.5, 15.3, 57.8], country: true },
  { name: 'Portugal', re: /\bportugal\b/i, bbox: [-9.6, 36.9, -6.1, 42.2], country: true },
  { name: 'Spain', re: /\bspain\b/i, bbox: [-9.4, 35.9, 3.4, 43.8], country: true },
  { name: 'Ecuador', re: /\becuador\b/i, bbox: [-81.1, -5.1, -75.2, 1.5], country: true },
  { name: 'Chile', re: /\bchile\b/i, bbox: [-75.7, -56, -66.4, -17.5], country: true },
  { name: 'United Kingdom', re: /\b(the )?(united kingdom|uk|great britain|britain)\b/i, bbox: [-8.2, 49.9, 1.8, 58.7], country: true },
  // California's coast: the ocean off it, not a street named Coast.
  { name: 'California coast', re: /\b(coast of|off) (southern |northern |central )?california\b|\bcalifornia('s)? coast(line)?\b/i, bbox: [-126, 32.3, -117, 42] },
  { name: 'Lower 48 US states', re: /\blower 48\b|\b(the )?(contiguous|continental|lower 48|lower forty[- ]eight)( us| united states| states)\b|\b(the )?(united states|usa)\b|\bu\.s\.(a\.)?|\b(across|in|of|over|throughout) (the )?us\b|(?<!(south|central|north|latin|of) )\bamerica\b(?! (fork|falls))/i, bbox: [-125, 24.3, -66.9, 49.5] },
];

export function regionIn(text: string): Region | null {
  for (const r of REGIONS) if (r.re.test(text)) return r;
  return null;
}

export function regionByName(name: string): Region | null {
  return REGIONS.find((r) => r.name.toLowerCase() === name.toLowerCase()) ?? null;
}

/** Named disasters people ask about without a date. */
export interface EventRef {
  name: string;
  re: RegExp;
  /** Month the event started, YYYY-MM. */
  month: string;
  /** Where it happened, used when the sentence names no place. */
  place: string;
  /** The day it hit that place, YYYY-MM-DD, when one day matters (a landfall, an ignition). */
  date?: string;
  /** How a map tag names it: "Before Harvey", "After the Camp Fire". */
  short?: string;
}

export const EVENTS: EventRef[] = [
  { name: 'Hurricane Harvey', re: /\b(hurricane )?harvey\b/i, month: '2017-08', place: 'Houston, Texas', date: '2017-08-27', short: 'Harvey' },
  { name: 'Hurricane Katrina', re: /\b(hurricane )?katrina\b/i, month: '2005-08', place: 'New Orleans, Louisiana', date: '2005-08-29', short: 'Katrina' },
  { name: 'Hurricane Sandy', re: /\b(hurricane|superstorm) sandy\b/i, month: '2012-10', place: 'New York City', date: '2012-10-29', short: 'Sandy' },
  { name: 'Hurricane Maria', re: /\bhurricane maria\b/i, month: '2017-09', place: 'Puerto Rico', date: '2017-09-20', short: 'Maria' },
  { name: 'Hurricane Ian', re: /\bhurricane ian\b/i, month: '2022-09', place: 'Fort Myers, Florida', date: '2022-09-28', short: 'Ian' },
  { name: 'Hurricane Helene', re: /\b(hurricane )?helene\b/i, month: '2024-09', place: 'Asheville, North Carolina', date: '2024-09-27', short: 'Helene' },
  { name: 'Hurricane Beryl', re: /\b(hurricane )?beryl\b/i, month: '2024-07', place: 'Houston, Texas', date: '2024-07-08', short: 'Beryl' },
  { name: 'Camp Fire', re: /\bcamp fire\b/i, month: '2018-11', place: 'Paradise, California', date: '2018-11-08', short: 'the Camp Fire' },
  { name: 'Lahaina fire', re: /\b(lahaina|maui) (wild)?fires?\b/i, month: '2023-08', place: 'Lahaina, Hawaii', date: '2023-08-08', short: 'the Lahaina fire' },
  { name: 'Dixie Fire', re: /\bdixie fire\b/i, month: '2021-07', place: 'Plumas County, California', date: '2021-07-13', short: 'the Dixie Fire' },
  { name: 'Marshall Fire', re: /\bmarshall fire\b/i, month: '2021-12', place: 'Louisville, Colorado', date: '2021-12-30', short: 'the Marshall Fire' },
  { name: 'Palisades Fire', re: /\bpalisades fire\b/i, month: '2025-01', place: 'Pacific Palisades, Los Angeles', date: '2025-01-07', short: 'the Palisades Fire' },
  { name: 'Eaton Fire', re: /\beaton fire\b/i, month: '2025-01', place: 'Altadena, California', date: '2025-01-07', short: 'the Eaton Fire' },
  { name: 'Black Summer fires', re: /\bblack summer\b|\baustralian? (bush)?fires\b|\b(bush)?fires? in australia\b/i, month: '2019-12', place: 'New South Wales' },
  { name: 'Pakistan floods', re: /\bpakistan floods?\b|\bfloods? in pakistan\b/i, month: '2022-08', place: 'Sindh, Pakistan', date: '2022-08-25', short: 'the floods' },
  { name: 'Iowa derecho', re: /\bderecho\b/i, month: '2020-08', place: 'Cedar Rapids, Iowa', date: '2020-08-10', short: 'the derecho' },
];

export function eventIn(text: string): EventRef | null {
  for (const e of EVENTS) if (e.re.test(text)) return e;
  return null;
}
