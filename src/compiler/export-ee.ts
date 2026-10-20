import { RAMPS } from '../runtime/colormap';
import { INDICES } from '../runtime/indices';
import type { TimeWindow } from '../runtime/layers';
import { SIGNAL_NAMES, STATION_BY_ID } from '../network/network';
import type { Route } from '../network/types';

/** Band, reducer and display range for datasets the browser can't read yet. */
const EE_HINTS: Record<string, { band: string; reducer: 'mean' | 'median' | 'max' | 'sum' | 'mode'; min: number; max: number; palette: string[]; image?: boolean; mosaic?: boolean }> = {
  s5p: { band: 'tropospheric_NO2_column_number_density', reducer: 'mean', min: 0, max: 0.0002, palette: ['f7f7f7', 'fdae61', 'd7191c', '5e0b1f'] },
  chirps: { band: 'precipitation', reducer: 'sum', min: 0, max: 400, palette: ['f7fbff', '6baed6', '08306b'] },
  era5: { band: 'temperature_2m', reducer: 'mean', min: 255, max: 305, palette: ['313695', 'ffffbf', 'a50026'] },
  smap: { band: 'sm_surface', reducer: 'mean', min: 0, max: 0.5, palette: ['8c510a', 'f6e8c3', '01665e'] },
  grace: { band: 'lwe_thickness', reducer: 'mean', min: -25, max: 25, palette: ['b2182b', 'f7f7f7', '2166ac'] },
  'viirs-night': { band: 'avg_rad', reducer: 'median', min: 0, max: 60, palette: ['000000', 'f1c40f', 'ffffff'] },
  gedi: { band: 'rh98', reducer: 'median', min: 0, max: 40, palette: ['f7fcb9', '41ab5d', '004529'] },
  hansen: { band: 'lossyear', reducer: 'max', min: 1, max: 25, palette: ['ffff00', 'ff0000'], image: true },
  'dynamic-world': { band: 'label', reducer: 'mode', min: 0, max: 8, palette: ['419bdf', '397d49', '88b053', '7a87c6', 'e49635', 'dfc35a', 'c4281b', 'a59b8f', 'b39fe1'] },
  alphaearth: { band: 'A01', reducer: 'mean', min: -0.3, max: 0.3, palette: ['440154', '21918c', 'fde725'], mosaic: true },
};

const LIVE_EE: Record<string, { min: number; max: number; band: string; palette?: string[]; image?: boolean; mosaic?: boolean; scale?: number; toValue?: string; classPalette?: boolean; bands?: Record<string, string> }> = {
  'modis-lst': { band: 'LST_Day_1km', min: 13657, max: 16157 },
  'modis-snow': { band: 'Maximum_Snow_Extent', min: 0, max: 1, toValue: 'v.eq(200).updateMask(v.eq(200).or(v.eq(25)))' },
  'active-fire': { band: 'FireMask', min: 0, max: 0.5, toValue: 'v.gte(7).updateMask(v.eq(5).or(v.gte(7)))' },
  oisst: { band: 'sst', min: -200, max: 3200, bands: { 'sst-anomaly': 'anom' } },
  'usda-cdl': { band: 'cropland', min: 0, max: 255, classPalette: true },
  'modis-vi': { band: 'NDVI', min: -1000, max: 9000, scale: 0.0001 },
  'esa-worldcover': { band: 'Map', min: 10, max: 100, image: false },
  'io-lulc': { band: 'b1', min: 1, max: 11, mosaic: true },
  'jrc-water': { band: 'occurrence', min: 0, max: 100, image: true },
  'cop-dem': { band: 'DEM', min: 0, max: 1500, mosaic: true },
  'sentinel-1': { band: 'VV', min: -25, max: 0 },
};

function palette(signal: string): string[] {
  const r = (RAMPS as Record<string, { stops: { color: string }[] }>)[signal];
  return r ? r.stops.map((s) => s.color.replace('#', '')) : ['000000', 'ffffff'];
}

function js(v: unknown): string {
  return JSON.stringify(v);
}

const S2_BANDS = "['B2', 'B3', 'B4', 'B8', 'B11', 'B12']";
const COMMON = "['blue', 'green', 'red', 'nir', 'swir16', 'swir22']";

/**
 * Turns a route into an Earth Engine Code Editor script that builds the same app with the
 * `ui` API: paste it, press Run, then Apps > New App to publish. This is the export for heavy
 * or export-only routes.
 */
export function earthEngineScript(route: Route): string {
  const st = STATION_BY_ID[route.station];
  const [w, s, e, n] = route.aoi.bbox;
  const sig = SIGNAL_NAMES[route.signal]?.short ?? route.signal;
  const lines: string[] = [];
  const add = (...l: string[]) => lines.push(...l);
  const windows = route.windows;
  add(
    `// ${route.title}`,
    '// Built with Interchange. Paste into code.earthengine.google.com, press Run,',
    '// then Apps > New App to publish it with your own Earth Engine project.',
    `var aoi = ee.Geometry.Rectangle([${[w, s, e, n].map((v) => v.toFixed(5)).join(', ')}]);`,
    `var windows = ${js(windows.map((x: TimeWindow) => ({ label: x.label, start: x.start, end: x.end, ...(x.prefer ? { prefer: x.prefer } : {}) })))};`,
    '',
  );

  let visBlock = '';
  let makeLayer = '';
  let seriesFn = '';
  let chartScale = 30;

  if (st.provides === 'scene' && route.signal !== 'radar-vv') {
    const idx = INDICES[route.signal];
    const ndBands = route.signal === 'true-color' ? null : idx!.bands;
    const isS2 = st.id === 'sentinel-2';
    chartScale = isS2 ? 20 : 30;
    if (isS2) {
      add(
        'function prep(img) {',
        "  var scl = img.select('SCL');",
        '  var clear = scl.eq(2).or(scl.eq(4)).or(scl.eq(5)).or(scl.eq(6)).or(scl.eq(7)).or(scl.eq(11));',
        `  return ee.Image(img.select(${S2_BANDS}, ${COMMON}).divide(10000).updateMask(clear)`,
        "    .copyProperties(img, ['system:time_start']));",
        '}',
        'function scenes(start, end) {',
        "  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(aoi).filterDate(start, end)",
        "    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 60)).map(prep);",
        '}',
      );
    } else {
      add(
        'function prepL(bands) {',
        '  return function (img) {',
        "    var qa = img.select('QA_PIXEL');",
        '    var clear = qa.bitwiseAnd(31).eq(0);',
        `    return ee.Image(img.select(bands, ${COMMON}).multiply(0.0000275).add(-0.2).updateMask(clear)`,
        "      .copyProperties(img, ['system:time_start']));",
        '  };',
        '}',
        'function scenes(start, end) {',
        "  var l89 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'))",
        "    .map(prepL(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7']));",
        "  var l5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2').map(prepL(['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7']));",
        '  return l89.merge(l5).filterBounds(aoi).filterDate(start, end);',
        '}',
      );
    }
    if (ndBands) {
      add(
        `function toValue(img) { return ee.Image(img.normalizedDifference(${js(ndBands)}).rename('value').copyProperties(img, ['system:time_start'])); }`,
      );
      const r = RAMPS[route.signal as keyof typeof RAMPS];
      visBlock = `var vis = { min: ${r.domain[0]}, max: ${r.domain[1]}, palette: ${js(palette(route.signal))} };`;
      makeLayer = 'function layerFor(w) { return scenes(w.start, w.end).map(toValue).median().clip(aoi); }';
      seriesFn = "function series(start, end) { return scenes(start, end).map(toValue); }";
    } else {
      visBlock = "var vis = { bands: ['red', 'green', 'blue'], min: 0, max: 0.28 };";
      makeLayer = 'function layerFor(w) { return scenes(w.start, w.end).median().clip(aoi); }';
    }
  } else if (route.signal === 'radar-vv') {
    chartScale = 20;
    add(
      'function scenes(start, end) {',
      "  return ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(aoi).filterDate(start, end)",
      "    .filter(ee.Filter.eq('instrumentMode', 'IW')).filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))",
      "    .select('VV');",
      '}',
    );
    visBlock = `var vis = { min: -25, max: 0, palette: ${js(palette('radar-vv'))} };`;
    // "After" a flood is the first day of passes in the window, before the water drains.
    makeLayer = [
      'function layerFor(w) {',
      '  var c = scenes(w.start, w.end);',
      "  if (w.prefer === 'earliest') {",
      "    var first = ee.Date(c.sort('system:time_start').first().get('system:time_start'));",
      "    c = c.filterDate(first, first.advance(1, 'day'));",
      '  }',
      '  return c.median().clip(aoi);',
      '}',
    ].join('\n');
    seriesFn = 'function series(start, end) { return scenes(start, end); }';
  } else {
    const live = LIVE_EE[st.id];
    const hint = EE_HINTS[st.id];
    const id = st.access.earthEngine;
    if (!id) {
      return [
        `// ${route.title}`,
        `// ${st.name} isn't in the Earth Engine catalog. It's open on ${st.access.stac ? `STAC (${st.access.stac})` : st.access.other ?? 'the web'};`,
        '// these open-source tools read it in Python:',
        ...st.tools.map((t) => `//   ${t.name}: ${t.url}`),
        '',
      ].join('\n');
    }
    const band = live?.bands?.[route.signal] ?? live?.band ?? hint!.band;
    const anomaly = route.signal === 'sst-anomaly';
    const min = anomaly ? -300 : (live?.min ?? hint!.min);
    const max = anomaly ? 300 : (live?.max ?? hint!.max);
    const pal = live ? (route.signal === 'landcover' ? null : palette(route.signal)) : hint!.palette;
    const isImage = (live?.image ?? hint?.image) === true;
    const reducer = hint?.reducer ?? (route.signal === 'landcover' ? 'mode' : 'mean');
    chartScale = Math.max(30, st.score.resolutionM);
    if (isImage) {
      makeLayer = `function layerFor(w) { return ee.Image(${js(id)}).select(${js(band)}).clip(aoi); }`;
    } else {
      const coll = `ee.ImageCollection(${js(id)}).filterBounds(aoi)`;
      const timed = st.temporal === 'static' ? coll : `${coll}.filterDate(w.start, w.end)`;
      // Counts (snow, fire) turn each map into 1 where it was present and 0 where it was seen clear.
      const pick = live?.toValue
        ? `.map(function (img) { var v = img.select(${js(band)}); return ee.Image(${live.toValue}.rename('value').copyProperties(img, ['system:time_start'])); })`
        : `.select(${js(band)})`;
      if (live?.toValue) add(`// Share of looks in each window where it was present (1) rather than clear (0).`);
      makeLayer = `function layerFor(w) { return ${timed}${pick}.${reducer}().clip(aoi); }`;
      if (st.temporal === 'dense' || st.temporal === 'composite') {
        seriesFn = `function series(start, end) { return ${coll}.filterDate(start, end)${pick}; }`;
      }
    }
    visBlock = live?.classPalette
      ? '// The dataset carries its own class colors.\nvar vis = {};'
      : pal
        ? `var vis = { min: ${min}, max: ${max}, palette: ${js(pal)} };`
        : `var vis = { min: ${min}, max: ${max} };`;
  }

  add(visBlock, makeLayer);
  if (seriesFn) add(seriesFn);
  add('');

  const label = (i: number) => `windows[${i}].label`;
  const wantsSwipe = route.views.includes('swipe') && windows.length === 2;
  const wantsSlider = route.views.includes('time-slider') && windows.length > 1;
  const wantsChart = route.views.includes('click-chart') && !!seriesFn;
  const wantsStats = route.views.includes('region-stats');
  const historyStart = route.historyRange?.start ?? windows[0].start;
  const historyEnd = route.historyRange?.end ?? windows[windows.length - 1].end;

  add(
    "var panel = ui.Panel({ style: { width: '340px', padding: '8px' } });",
    `panel.add(ui.Label(${js(route.aoi.name + ': ' + sig)}, { fontWeight: 'bold', fontSize: '18px' }));`,
    `panel.add(ui.Label(${js(st.name + '. ' + st.measures)}));`,
  );
  if (wantsSwipe) {
    add(
      'var left = ui.Map(); var right = ui.Map();',
      'ui.Map.Linker([left, right]);',
      `left.addLayer(layerFor(windows[0]), vis, ${label(0)});`,
      `right.addLayer(layerFor(windows[1]), vis, ${label(1)});`,
      `left.add(ui.Label(${label(0)}, { position: 'top-left' }));`,
      `right.add(ui.Label(${label(1)}, { position: 'top-right' }));`,
      "var split = ui.SplitPanel({ firstPanel: left, secondPanel: right, wipe: true, style: { stretch: 'both' } });",
      'ui.root.widgets().reset([panel, split]);',
      'left.centerObject(aoi, 11);',
      'var clickMap = left;',
    );
  } else {
    add(
      'var map = ui.Map();',
      'ui.root.widgets().reset([panel, map]);',
      'map.centerObject(aoi, 11);',
      `map.addLayer(layerFor(windows[${windows.length - 1}]), vis, ${label(windows.length - 1)});`,
      'var clickMap = map;',
    );
    if (wantsSlider) {
      add(
        'var picker = ui.Select({',
        '  items: windows.map(function (w) { return w.label; }),',
        `  value: ${label(windows.length - 1)},`,
        '  onChange: function (value) {',
        '    var w = windows.filter(function (x) { return x.label === value; })[0];',
        '    map.layers().reset([ui.Map.Layer(layerFor(w), vis, w.label)]);',
        '  }',
        '});',
        "panel.add(ui.Label('Period')); panel.add(picker);",
      );
    }
  }
  if (wantsStats) {
    add(
      `var stats = layerFor(windows[${windows.length - 1}]).reduceRegion({ reducer: ee.Reducer.median(), geometry: aoi, scale: ${Math.max(chartScale, 60)}, maxPixels: 1e9, bestEffort: true });`,
      "panel.add(ui.Label('Median over the area:'));",
      'stats.evaluate(function (d) { panel.add(ui.Label(JSON.stringify(d))); });',
    );
  }
  if (wantsChart) {
    add(
      "panel.add(ui.Label('Click the map for history.'));",
      'var chartSlot = ui.Panel(); panel.add(chartSlot);',
      'clickMap.onClick(function (c) {',
      '  var pt = ee.Geometry.Point([c.lon, c.lat]);',
      `  var chart = ui.Chart.image.series(series(${js(historyStart)}, ${js(historyEnd)}), pt, ee.Reducer.mean(), ${chartScale})`,
      `    .setOptions({ title: ${js(sig + ' at the clicked point')}, lineWidth: 1, pointSize: 3, legend: { position: 'none' } });`,
      '  chartSlot.widgets().reset([chart]);',
      '});',
    );
  }
  add('');
  return lines.join('\n');
}
