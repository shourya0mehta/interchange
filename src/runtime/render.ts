import { CLASS_TITLES, LANDCOVER_CLASSES, RAMPS, changeRampFor, classesToRgba, rampToRgba, trueColorToRgba, type ClassEntry, type Ramp } from './colormap';
import { gridPixelMeters, mercToLonLat, type Grid } from './geo';
import type { LayerResult } from './layers';
import type { Signal } from './sources';

export type Legend =
  | { kind: 'ramp'; ramp: Ramp; title: string }
  | { kind: 'classes'; classes: ClassEntry[]; title: string }
  | { kind: 'none' };

export function rampFor(signal: Signal, domain?: [number, number]): Ramp | null {
  if (signal === 'true-color' || signal === 'landcover' || signal === 'native') return null;
  const r = RAMPS[signal];
  return domain ? { ...r, domain } : r;
}

/** The ramp for after-minus-before maps of a layer. */
export function changeRamp(result: LayerResult): Ramp {
  const r = rampFor(result.recipe.signal, result.domain);
  return changeRampFor(r?.format, r ? r.domain[1] - r.domain[0] : 1);
}

/** Class entries present in a layer, most common first. Long tables (crop maps) list only these. */
export function presentClasses(result: LayerResult, max = 12): { shown: ClassEntry[]; more: number } {
  const all = LANDCOVER_CLASSES[result.recipe.station] ?? [];
  if (all.length <= max) return { shown: all, more: 0 };
  const counts = new Map<number, number>();
  for (let k = 0; k < result.values.length; k += 3) {
    const v = result.values[k];
    if (!Number.isNaN(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const present = all.filter((c) => counts.has(c.value)).sort((a, b) => counts.get(b.value)! - counts.get(a.value)!);
  return { shown: present.slice(0, max), more: Math.max(0, present.length - max) };
}

export function legendFor(result: LayerResult, change = false, domain?: [number, number]): Legend {
  const { signal, station } = result.recipe;
  if (change) {
    const ramp = changeRamp(result);
    return { kind: 'ramp', ramp, title: ramp.units };
  }
  if (signal === 'landcover') return { kind: 'classes', classes: presentClasses(result).shown, title: CLASS_TITLES[station] ?? 'Land cover' };
  const ramp = rampFor(signal, domain ?? result.domain);
  return ramp ? { kind: 'ramp', ramp, title: ramp.units } : { kind: 'none' };
}

/** Pixels for a layer, ready for a canvas. */
/**
 * One color range for every window of an app, so a swipe or a slider compares like with like.
 * Adaptive ramps stretch over what the loaded maps hold; others keep their fixed range.
 */
export function sharedDomain(results: LayerResult[]): [number, number] | undefined {
  if (!results.length) return undefined;
  const r = rampFor(results[0].recipe.signal, results[0].domain);
  // Rain runs from zero to the wettest the maps hold, so a month like Harvey's (a meter of rain)
  // isn't one flat color against a range made for ordinary months.
  if (results[0].recipe.signal === 'precip') {
    let hi = 0;
    for (const res of results) {
      const sample: number[] = [];
      const stride = Math.max(1, Math.floor(res.values.length / 20000));
      for (let k = 0; k < res.values.length; k += stride) if (!Number.isNaN(res.values[k])) sample.push(res.values[k]);
      if (!sample.length) continue;
      sample.sort((a, b) => a - b);
      hi = Math.max(hi, sample[Math.floor(sample.length * 0.98)]);
    }
    return hi > 0 ? [0, Math.max(50, Math.ceil(hi / 10) * 10)] : results[0].domain;
  }
  if (!r?.adaptive) return results[0].domain;
  let lo = Infinity;
  let hi = -Infinity;
  for (const res of results) {
    const sample: number[] = [];
    const stride = Math.max(1, Math.floor(res.values.length / 20000));
    for (let k = 0; k < res.values.length; k += stride) if (!Number.isNaN(res.values[k])) sample.push(res.values[k]);
    if (!sample.length) continue;
    sample.sort((a, b) => a - b);
    lo = Math.min(lo, sample[Math.floor(sample.length * 0.02)]);
    hi = Math.max(hi, sample[Math.floor(sample.length * 0.98)]);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return undefined;
  const mid = (lo + hi) / 2;
  const half = Math.max(r.adaptive, hi - lo) / 2;
  // Round outward to whole degrees so the legend reads cleanly.
  return [Math.floor(mid - half), Math.ceil(mid + half)];
}

export function layerRgba(result: LayerResult, changeValues?: Float32Array, domain?: [number, number]): Uint8ClampedArray {
  if (changeValues) return rampToRgba(changeValues, changeRamp(result));
  if (result.kind === 'rgb' && result.rgb) return trueColorToRgba(...result.rgb);
  if (result.kind === 'categorical') return classesToRgba(result.values, LANDCOVER_CLASSES[result.recipe.station] ?? []);
  const ramp = rampFor(result.recipe.signal, domain ?? result.domain);
  return ramp ? rampToRgba(result.values, ramp) : new Uint8ClampedArray(result.values.length * 4);
}

/** PNG data URL for a MapLibre image source. Browser only. */
export function toDataUrl(rgba: Uint8ClampedArray, grid: Grid): string {
  const canvas = document.createElement('canvas');
  canvas.width = grid.width;
  canvas.height = grid.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), grid.width, grid.height), 0, 0);
  return canvas.toDataURL('image/png');
}

/** Corner coordinates for a MapLibre image source: TL, TR, BR, BL. */
export function gridCorners(grid: Grid): [[number, number], [number, number], [number, number], [number, number]] {
  const [x0, y0, x1, y1] = grid.merc;
  return [mercToLonLat(x0, y1), mercToLonLat(x1, y1), mercToLonLat(x1, y0), mercToLonLat(x0, y0)];
}

export interface ContinuousStats {
  kind: 'continuous';
  mean: number;
  p10: number;
  median: number;
  p90: number;
  coverage: number;
}

export interface ClassStats {
  kind: 'classes';
  rows: { entry: ClassEntry; km2: number; share: number }[];
  coverage: number;
}

/** Whole-map summary. Areas account for Mercator's stretch by row latitude. */
export function regionStats(result: LayerResult): ContinuousStats | ClassStats | null {
  const { grid, values } = result;
  if (result.kind === 'rgb') return null;
  if (result.kind === 'categorical') {
    const classes = LANDCOVER_CLASSES[result.recipe.station] ?? [];
    const area = new Map<number, number>();
    let total = 0;
    const dyMerc = (grid.merc[3] - grid.merc[1]) / grid.height;
    const dxMerc = (grid.merc[2] - grid.merc[0]) / grid.width;
    for (let j = 0; j < grid.height; j++) {
      const lat = mercToLonLat(0, grid.merc[3] - (j + 0.5) * dyMerc)[1];
      const k = Math.cos((lat * Math.PI) / 180);
      const px = (dxMerc * k * dyMerc * k) / 1e6;
      for (let i = 0; i < grid.width; i++) {
        const v = values[j * grid.width + i];
        if (Number.isNaN(v)) continue;
        area.set(v, (area.get(v) ?? 0) + px);
        total += px;
      }
    }
    const rows = classes
      .map((entry) => ({ entry, km2: area.get(entry.value) ?? 0, share: total ? (area.get(entry.value) ?? 0) / total : 0 }))
      .filter((r) => r.km2 > 0)
      .sort((a, b) => b.km2 - a.km2);
    return { kind: 'classes', rows, coverage: result.coverage };
  }
  const sample: number[] = [];
  let sum = 0;
  for (let k = 0; k < values.length; k++) {
    const v = values[k];
    if (Number.isNaN(v)) continue;
    sum += v;
    sample.push(v);
  }
  if (!sample.length) return null;
  sample.sort((a, b) => a - b);
  const q = (p: number) => sample[Math.min(sample.length - 1, Math.round(p * (sample.length - 1)))];
  return { kind: 'continuous', mean: sum / sample.length, p10: q(0.1), median: q(0.5), p90: q(0.9), coverage: result.coverage };
}

export function pixelSizeLabel(grid: Grid): string {
  const m = gridPixelMeters(grid);
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
