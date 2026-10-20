import type { AppSpec } from '../compiler/spec';
import { BASEMAP_CREDIT, creditLine } from '../compiler/credit';
import { formatValue, rampColorAt, type Ramp } from '../runtime/colormap';

export type ExportFormat = 'wide' | 'square';

export type ExportLegend =
  | { kind: 'ramp'; title: string; ramp: Ramp }
  | { kind: 'classes'; title: string; classes: { label: string; color: string }[] }
  | { kind: 'none' };

const C = { fog: '#E7EAEC', paper: '#F7F8F8', ink: '#121518', graphite: '#5E656C', cobalt: '#1D3FD6' };
const FONT = '"IBM Plex Sans Condensed", "IBM Plex Sans", system-ui, sans-serif';

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws a source canvas into a box, cropped to fill it (like object-fit: cover). */
function cover(g: CanvasRenderingContext2D, src: HTMLCanvasElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / src.width, h / src.height);
  const sw = w / s;
  const sh = h / s;
  g.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, x, y, w, h);
}

/**
 * A slide- and story-ready image of the app: title, dates, the map (both dates side by side for a
 * swipe), legend, and the credit line each provider asks for.
 */
export async function composeImage(spec: AppSpec, maps: HTMLCanvasElement[], legend: ExportLegend, labels: string[], format: ExportFormat): Promise<Blob> {
  await document.fonts?.ready;
  const W = format === 'wide' ? 1600 : 1200;
  const H = format === 'wide' ? 900 : 1200;
  const pad = 48;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = C.paper;
  g.fillRect(0, 0, W, H);

  // Title and dates.
  g.fillStyle = C.ink;
  g.font = `700 44px ${FONT}`;
  g.textBaseline = 'top';
  const titleLines = wrap(g, spec.title, W - pad * 2).slice(0, 2);
  titleLines.forEach((l, i) => g.fillText(l, pad, pad + i * 50));
  let y = pad + titleLines.length * 50 + 6;
  g.font = `500 24px ${FONT}`;
  g.fillStyle = C.graphite;
  g.fillText(`${spec.aoi.name}. ${labels.join(' vs ')}`, pad, y);
  y += 44;

  // Map panels.
  const footer = 150;
  const mapH = H - y - footer;
  const gap = 12;
  const n = maps.length;
  const pw = (W - pad * 2 - gap * (n - 1)) / n;
  maps.forEach((m, i) => {
    const x = pad + i * (pw + gap);
    cover(g, m, x, y, pw, mapH);
    g.strokeStyle = C.ink;
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, pw - 2, mapH - 2);
    if (n > 1) {
      g.font = `700 22px ${FONT}`;
      const tw = g.measureText(labels[i] ?? '').width;
      g.fillStyle = C.ink;
      g.fillRect(x + 12, y + 12, tw + 24, 38);
      g.fillStyle = C.paper;
      g.fillText(labels[i] ?? '', x + 24, y + 20);
    }
  });
  y += mapH + 24;

  // Legend.
  g.textBaseline = 'top';
  if (legend.kind === 'ramp') {
    g.font = `600 20px ${FONT}`;
    g.fillStyle = C.ink;
    g.fillText(legend.title, pad, y);
    const lw = Math.min(520, W / 2 - pad);
    const grad = g.createLinearGradient(pad, 0, pad + lw, 0);
    for (let i = 0; i <= 10; i++) grad.addColorStop(i / 10, rampColorAt(legend.ramp, i / 10));
    g.fillStyle = grad;
    g.fillRect(pad, y + 30, lw, 18);
    g.font = `500 18px ${FONT}`;
    g.fillStyle = C.graphite;
    g.fillText(`${formatValue(legend.ramp, legend.ramp.domain[0])} ${legend.ramp.low}`, pad, y + 54);
    const hi = `${legend.ramp.high} ${formatValue(legend.ramp, legend.ramp.domain[1])}`;
    g.fillText(hi, pad + lw - g.measureText(hi).width, y + 54);
  } else if (legend.kind === 'classes') {
    g.font = `600 20px ${FONT}`;
    g.fillStyle = C.ink;
    g.fillText(legend.title, pad, y);
    g.font = `500 17px ${FONT}`;
    let x = pad;
    let ly = y + 32;
    for (const c of legend.classes.slice(0, 8)) {
      const w = g.measureText(c.label).width + 40;
      if (x + w > W / 2 + 120) {
        x = pad;
        ly += 26;
      }
      g.fillStyle = c.color;
      g.fillRect(x, ly + 2, 16, 16);
      g.fillStyle = C.ink;
      g.fillText(c.label, x + 22, ly);
      x += w;
    }
  }

  // Credit, right-aligned, wrapped.
  g.font = `400 16px ${FONT}`;
  g.fillStyle = C.graphite;
  const credit = `${creditLine(spec)} ${BASEMAP_CREDIT}.`;
  const cw = W / 2 - pad;
  wrap(g, credit, cw)
    .slice(0, 4)
    .forEach((l, i) => g.fillText(l, W - pad - cw, y + i * 22));

  // A thin cobalt rule along the bottom: the scan line, signed.
  g.fillStyle = C.cobalt;
  g.fillRect(0, H - 6, W, 6);

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the image'))), 'image/png'));
}

/**
 * An animated GIF that steps through the app's dates: the basemap once, each date's pixels drawn
 * over it, with the title, the date in large type, the legend and the credit line on every frame.
 */
export async function composeGif(
  spec: AppSpec,
  base: { canvas: HTMLCanvasElement; rect: { x: number; y: number; w: number; h: number } },
  layers: { rgba: Uint8ClampedArray; width: number; height: number }[],
  labels: string[],
  legend: ExportLegend,
  onFrame?: (i: number) => void,
): Promise<Blob> {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  await document.fonts?.ready;
  const maxW = 820;
  const scale = Math.min(1, maxW / base.canvas.width);
  const mapW = Math.round(base.canvas.width * scale);
  const mapH = Math.round(base.canvas.height * scale);
  const head = 64;
  const foot = 54;
  const W = mapW;
  const H = head + mapH + foot;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  const tile = document.createElement('canvas');
  const gif = GIFEncoder();
  for (let i = 0; i < layers.length; i++) {
    const L = layers[i];
    g.fillStyle = C.paper;
    g.fillRect(0, 0, W, H);
    g.drawImage(base.canvas, 0, head, mapW, mapH);
    tile.width = L.width;
    tile.height = L.height;
    tile.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(L.rgba), L.width, L.height), 0, 0);
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 0.95;
    g.drawImage(tile, base.rect.x * scale, head + base.rect.y * scale, base.rect.w * scale, base.rect.h * scale);
    g.globalAlpha = 1;
    g.imageSmoothingEnabled = true;
    g.strokeStyle = C.ink;
    g.setLineDash([6, 4]);
    g.lineWidth = 1.5;
    g.strokeRect(base.rect.x * scale, head + base.rect.y * scale, base.rect.w * scale, base.rect.h * scale);
    g.setLineDash([]);
    // Header: title, and the date large in cobalt.
    g.fillStyle = C.paper;
    g.fillRect(0, 0, W, head);
    g.textBaseline = 'middle';
    g.fillStyle = C.ink;
    g.font = `700 22px ${FONT}`;
    const date = labels[i] ?? '';
    g.font = `700 30px ${FONT}`;
    const dw = g.measureText(date).width;
    g.fillStyle = C.cobalt;
    g.fillText(date, W - dw - 16, head / 2);
    g.fillStyle = C.ink;
    g.font = `700 20px ${FONT}`;
    const title = wrap(g, spec.title, W - dw - 48)[0] ?? '';
    g.fillText(title, 16, head / 2);
    // Progress ticks under the header, one per date.
    const tw = (W - 32) / layers.length;
    for (let k = 0; k < layers.length; k++) {
      g.fillStyle = k <= i ? C.cobalt : C.fog;
      g.fillRect(16 + k * tw, head - 6, tw - 4, 4);
    }
    // Footer: legend and credit.
    g.fillStyle = C.paper;
    g.fillRect(0, head + mapH, W, foot);
    if (legend.kind === 'ramp') {
      const lw = Math.min(220, W / 3);
      const grad = g.createLinearGradient(16, 0, 16 + lw, 0);
      for (let k = 0; k <= 10; k++) grad.addColorStop(k / 10, rampColorAt(legend.ramp, k / 10));
      g.fillStyle = grad;
      g.fillRect(16, head + mapH + 12, lw, 10);
      g.font = `500 12px ${FONT}`;
      g.fillStyle = C.graphite;
      g.textBaseline = 'top';
      g.fillText(`${formatValue(legend.ramp, legend.ramp.domain[0])} ${legend.ramp.low}`, 16, head + mapH + 26);
      const hi = `${legend.ramp.high} ${formatValue(legend.ramp, legend.ramp.domain[1])}`;
      g.fillText(hi, 16 + lw - g.measureText(hi).width, head + mapH + 26);
    }
    g.font = `400 11px ${FONT}`;
    g.fillStyle = C.graphite;
    g.textBaseline = 'top';
    const credit = creditLine(spec);
    const cw = W / 2 - 16;
    wrap(g, credit, cw)
      .slice(0, 3)
      .forEach((l, k) => g.fillText(l, W - 16 - cw, head + mapH + 10 + k * 14));
    const { data } = g.getImageData(0, 0, W, H);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, W, H, { palette, delay: i === layers.length - 1 ? 1800 : 1000 });
    onFrame?.(i);
    // Let the page breathe between frames.
    await new Promise((r) => setTimeout(r, 0));
  }
  gif.finish();
  return new Blob([gif.bytes() as Uint8Array<ArrayBuffer>], { type: "image/gif" });
}
