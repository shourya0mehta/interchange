import { useEffect, useRef } from 'react';
import { describe, formatLatLon, loadEarth, sample, type Earth, type Sample } from './earth';

/**
 * The planet drawn in type, from real data: every character is a half-degree cell of ESA CCI land
 * cover or NOAA sea surface temperature. A satellite sweeps its swath across it; drag to turn it,
 * hover to read what's under the cursor, click to ask about that spot.
 */

export interface GlobeFocus {
  lat: number;
  lon: number;
  /** west, south, east, north */
  bbox?: [number, number, number, number];
  label?: string;
}

export type Emphasis = 'none' | 'ocean' | 'land' | 'green' | 'crops' | 'snow' | 'water' | 'built' | 'dry';

export interface GlobeProps {
  focus?: GlobeFocus | null;
  emphasis?: Emphasis;
  /** Swath width of the satellite drawn sweeping the planet, in km. */
  swathKm?: number;
  satelliteName?: string;
  /** Aim the satellite so its next pass goes over this spot, about a second from now. */
  task?: { lat: number; lon: number } | null;
  onHover?: (h: { lat: number; lon: number; sample: Sample; text: string; where: string } | null) => void;
  onPick?: (lat: number, lon: number, s: Sample) => void;
  /** Character cell width in CSS px; height is 1.6 times this. */
  cell?: number;
  className?: string;
  ariaLabel?: string;
}

// ---- Palette: inks on paper ------------------------------------------------------------
export const INK = {
  paper: '#ECEEF0',
  ink: '#121518',
  crop: '#B98B10',
  forest: '#2D6A3E',
  grass: '#7E8F3E',
  tundra: '#8F8B7C',
  wetland: '#2F8379',
  built: '#D2462C',
  bare: '#A9814E',
  water: '#2C66B0',
  snow: '#6F9DBA',
  swath: '#1D3FD6',
  highlight: '#E4EE4A',
};
const GLYPH: Record<number, string> = { 1: '=', 2: '#', 3: ';', 4: '.', 5: '%', 6: '@', 7: ':', 8: '~', 9: '*' };
const COLOR: Record<number, string> = {
  1: INK.crop,
  2: INK.forest,
  3: INK.grass,
  4: INK.tundra,
  5: INK.wetland,
  6: INK.built,
  7: INK.bare,
  8: INK.water,
  9: INK.snow,
};
// Sea surface temperature, cold to warm, as ink.
const SST_STOPS: [number, [number, number, number]][] = [
  [-2, [53, 78, 150]],
  [8, [72, 120, 186]],
  [18, [118, 160, 200]],
  [24, [222, 160, 88]],
  [30, [206, 74, 44]],
];
function sstColor(t: number): string {
  let i = 0;
  while (i < SST_STOPS.length - 2 && t > SST_STOPS[i + 1][0]) i++;
  const [t0, a] = SST_STOPS[i];
  const [t1, b] = SST_STOPS[i + 1];
  const f = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
  // Quantize so the sprite atlas stays small.
  const q = Math.round(f * 6) / 6;
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * q)},${Math.round(a[1] + (b[1] - a[1]) * q)},${Math.round(a[2] + (b[2] - a[2]) * q)})`;
}

const EMPHASIS_GROUPS: Record<Emphasis, number[] | null> = {
  none: null,
  ocean: [0],
  land: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  green: [1, 2, 3, 5],
  crops: [1],
  snow: [9],
  water: [5, 8],
  built: [6],
  dry: [3, 4, 7],
};

const RAD = Math.PI / 180;
const EARTH_KM = 6371;

/** Sprite atlas: one small canvas per glyph, color and alpha step, drawn once. */
class Atlas {
  private sprites = new Map<string, HTMLCanvasElement>();
  constructor(
    private cw: number,
    private ch: number,
    private dpr: number,
    private font: string,
  ) {}
  get(glyph: string, color: string, alpha: number, bold: boolean, tint = 0): HTMLCanvasElement {
    const a = Math.round(alpha * 8) / 8;
    const key = `${glyph}|${color}|${a}|${bold ? 1 : 0}|${tint}`;
    let s = this.sprites.get(key);
    if (!s) {
      s = document.createElement('canvas');
      s.width = Math.ceil(this.cw * this.dpr);
      s.height = Math.ceil(this.ch * this.dpr);
      const g = s.getContext('2d')!;
      g.scale(this.dpr, this.dpr);
      if (tint) {
        // A pale wash of the same ink behind the glyph, so areas read as areas.
        g.globalAlpha = tint * a;
        g.fillStyle = color;
        g.fillRect(0, 0, this.cw, this.ch);
      }
      g.globalAlpha = a;
      g.fillStyle = color;
      g.font = `${bold ? 700 : 400} ${this.font}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(glyph, this.cw / 2, this.ch / 2 + this.ch * 0.04);
      this.sprites.set(key, s);
    }
    return s;
  }
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const INC = 98.2 * (Math.PI / 180);
const NODE_RATE = 2.2 * (Math.PI / 180);
const ARG_RATE = 30 * (Math.PI / 180);

export function Globe({ focus, emphasis = 'none', swathKm = 290, satelliteName, task, onHover, onPick, cell = 9, className = '', ariaLabel }: GlobeProps) {
  /** The orbit, as a node and an argument at a reference time; tasking re-aims it. */
  const orbit = useRef({ node0: 1.2, u0: 0, t0: performance.now() });
  useEffect(() => {
    if (!task) return;
    const phi = Math.max(-80, Math.min(80, task.lat)) * (Math.PI / 180);
    const lam = task.lon * (Math.PI / 180);
    const u = Math.asin(Math.sin(phi) / Math.sin(INC));
    const node = lam - Math.atan2(Math.cos(INC) * Math.sin(u), Math.cos(u));
    const lead = 1.0;
    orbit.current = { node0: node + NODE_RATE * lead, u0: u - ARG_RATE * lead, t0: performance.now() };
  }, [task?.lat, task?.lon]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const props = useRef({ focus, emphasis, swathKm, onHover, onPick });
  const scheduleRef = useRef<(() => void) | null>(null);
  /** Emphasis fades between topics instead of switching. */
  const fade = useRef({ from: emphasis, to: emphasis, t0: 0 });
  if (fade.current.to !== emphasis) fade.current = { from: fade.current.to, to: emphasis, t0: performance.now() };
  props.current = { focus, emphasis, swathKm, onHover, onPick };
  const view = useRef({ lon: -40, lat: 18, zoom: 1, vLon: 0, vLat: 0, dragging: false, target: null as null | { lon: number; lat: number; zoom: number; t0: number; from: { lon: number; lat: number; zoom: number } } });

  // Fly to a new focus.
  useEffect(() => {
    const v = view.current;
    if (!focus) {
      v.target = null;
      return;
    }
    // The planet stays whole; the place is marked rather than zoomed into.
    const zoom = 1;
    v.target = { lon: focus.lon, lat: Math.max(-60, Math.min(60, focus.lat)), zoom, t0: performance.now(), from: { lon: v.lon, lat: v.lat, zoom: v.zoom } };
    v.vLon = 0;
    v.vLat = 0;
  }, [focus?.lat, focus?.lon, focus?.bbox?.join(',')]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let earth: Earth | null = null;
    let raf = 0;
    let visible = true;
    let atlas: Atlas | null = null;
    let size = { w: 0, h: 0, dpr: 1 };
    const reduced = prefersReducedMotion();
    const start = performance.now();
    let last = start;
    let lastDraw = 0;
    let hover: { x: number; y: number } | null = null;

    loadEarth()
      .then((e) => {
        earth = e;
        canvas.dataset.ready = 'true';
        schedule();
      })
      .catch(() => {
        canvas.dataset.ready = 'error';
      });

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size = { w: r.width, h: r.height, dpr };
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      const cw = r.width < 420 ? Math.max(6, cell - 2) : cell;
      atlas = new Atlas(cw, cw * 1.6, dpr, `${cw * 1.3}px "IBM Plex Mono", ui-monospace, monospace`);
      schedule();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) schedule();
    });
    io.observe(canvas);

    function schedule() {
      if (!raf) raf = requestAnimationFrame(frame);
    }
    scheduleRef.current = schedule;

    // Unit vector for a lat/lon.
    const vec = (lat: number, lon: number): [number, number, number] => [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];

    function invert(px: number, py: number, cx: number, cy: number, R: number, lat0: number, lon0: number) {
      const x = (px - cx) / R;
      const y = (cy - py) / R;
      const rho = Math.hypot(x, y);
      if (rho > 1) return null;
      const c = Math.asin(rho);
      const sinc = Math.sin(c);
      const cosc = Math.cos(c);
      const lat = rho === 0 ? lat0 : Math.asin(cosc * Math.sin(lat0) + (y * sinc * Math.cos(lat0)) / rho);
      const lon = lon0 + Math.atan2(x * sinc, rho * cosc * Math.cos(lat0) - y * sinc * Math.sin(lat0));
      return { lat, lon, light: cosc };
    }

    function project(lat: number, lon: number, cx: number, cy: number, R: number, lat0: number, lon0: number) {
      const cosc = Math.sin(lat0) * Math.sin(lat) + Math.cos(lat0) * Math.cos(lat) * Math.cos(lon - lon0);
      if (cosc < 0) return null;
      const x = Math.cos(lat) * Math.sin(lon - lon0);
      const y = Math.cos(lat0) * Math.sin(lat) - Math.sin(lat0) * Math.cos(lat) * Math.cos(lon - lon0);
      return { x: cx + x * R, y: cy - y * R };
    }

    function frame(now: number) {
      raf = 0;
      const dt = Math.min(64, now - last);
      last = now;
      const v = view.current;

      // Motion: fly-to, inertia, then a slow idle turn.
      if (v.target) {
        const k = reduced ? 1 : Math.min(1, (now - v.target.t0) / 1400);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        let dLon = v.target.lon - v.target.from.lon;
        dLon = ((dLon + 540) % 360) - 180;
        v.lon = v.target.from.lon + dLon * e;
        v.lat = v.target.from.lat + (v.target.lat - v.target.from.lat) * e;
        v.zoom = v.target.from.zoom + (v.target.zoom - v.target.from.zoom) * e;
      } else if (!v.dragging) {
        v.lon += v.vLon * dt;
        v.lat = Math.max(-70, Math.min(70, v.lat + v.vLat * dt));
        v.vLon *= 0.94;
        v.vLat *= 0.94;
        if (!reduced && Math.abs(v.vLon) < 0.002) v.lon += dt * 0.004;
        v.zoom += (1 - v.zoom) * 0.05;
      }

      // 30 frames a second is plenty for a slow turn; dragging gets every frame.
      if (v.dragging || now - lastDraw >= 32 || reduced) {
        draw(now);
        lastDraw = now;
      }
      const settling = v.target && now - v.target.t0 < 1500;
      if (visible && !document.hidden && (!reduced || settling || v.dragging || Math.abs(v.vLon) > 0.001)) schedule();
    }

    function draw(now: number) {
      const { w, h, dpr } = size;
      if (!w || !atlas) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const v = view.current;
      const p = props.current;
      const cw = w < 420 ? Math.max(6, cell - 2) : cell;
      const ch = cw * 1.6;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.46 * v.zoom;
      const lat0 = v.lat * RAD;
      const lon0 = v.lon * RAD;

      // Rim: a thin ink circle so the planet reads as a ball before the data arrives.
      ctx.beginPath();
      ctx.arc(cx, cy, R + 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(27,30,34,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (!earth) return;

      // Satellite: a sun-synchronous orbit (98.2°) whose ground track drifts west each pass.
      const o = orbit.current;
      const t = (now - o.t0) / 1000;
      const inc = INC;
      const node = o.node0 - t * NODE_RATE;
      const u = (((o.u0 + t * ARG_RATE) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const pole: [number, number, number] = [Math.sin(inc) * Math.sin(node), -Math.sin(inc) * Math.cos(node), Math.cos(inc)];
      const axisA: [number, number, number] = [Math.cos(node), Math.sin(node), 0];
      const axisB: [number, number, number] = [pole[1] * axisA[2] - pole[2] * axisA[1], pole[2] * axisA[0] - pole[0] * axisA[2], pole[0] * axisA[1] - pole[1] * axisA[0]];
      const half = (p.swathKm / 2 / EARTH_KM) * Math.max(1, 3 / v.zoom);
      const trail = 1.1;
      const f = fade.current;
      const fk = reduced ? 1 : Math.min(1, (now - f.t0) / 500);
      const fromG = EMPHASIS_GROUPS[f.from];
      const toG = EMPHASIS_GROUPS[f.to];
      const box = p.focus?.bbox;

      const cols = Math.ceil(w / cw);
      const rows = Math.ceil(h / ch);
      for (let r = 0; r < rows; r++) {
        const py = r * ch + ch / 2;
        if (Math.abs(py - cy) > R) continue;
        for (let c = 0; c < cols; c++) {
          const px = c * cw + cw / 2;
          const g = invert(px, py, cx, cy, R, lat0, lon0);
          if (!g) continue;
          const latD = g.lat / RAD;
          let lonD = g.lon / RAD;
          lonD = ((lonD + 540) % 360) - 180;
          const s = sample(earth, latD, lonD);

          // Freshly observed: inside the swath and just behind the satellite.
          const pv = vec(g.lat, g.lon);
          const off = Math.asin(Math.max(-1, Math.min(1, pv[0] * pole[0] + pv[1] * pole[1] + pv[2] * pole[2])));
          let fresh = 0;
          if (Math.abs(off) < half) {
            const theta = Math.atan2(pv[0] * axisB[0] + pv[1] * axisB[1] + pv[2] * axisB[2], pv[0] * axisA[0] + pv[1] * axisA[1] + pv[2] * axisA[2]);
            let behind = u - theta;
            behind = ((behind % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            if (behind < trail) fresh = 1 - behind / trail;
          }

          let glyph: string;
          let color: string;
          if (s.group === 0) {
            if (s.ice !== null && s.ice >= 15) {
              glyph = s.ice > 70 ? '*' : '+';
              color = INK.snow;
            } else {
              const sst = s.sst ?? 10;
              glyph = sst < 6 ? '.' : sst < 18 ? '-' : '~';
              color = sstColor(sst);
            }
          } else {
            glyph = s.urban >= 6 && s.group !== 6 ? '@' : GLYPH[s.group];
            color = s.urban >= 6 ? INK.built : COLOR[s.group];
          }
          const inBox = box && latD >= box[1] && latD <= box[3] && lonD >= box[0] && lonD <= box[2];
          let alpha = 0.32 + 0.68 * Math.pow(g.light, 0.6);
          const dimFrom = fromG && !fromG.includes(s.group) ? 0.5 : 1;
          const dimTo = toG && !toG.includes(s.group) ? 0.5 : 1;
          alpha *= dimFrom + (dimTo - dimFrom) * fk;
          let bold = false;
          if (fresh > 0) {
            alpha = Math.min(1, alpha + 0.5 * fresh);
            bold = fresh > 0.55;
          }
          if (inBox) {
            // The place in the question, marked with a highlighter.
            ctx.fillStyle = INK.highlight;
            ctx.fillRect(c * cw, r * ch, cw, ch);
            color = INK.ink;
            alpha = 1;
          }
          ctx.drawImage(atlas.get(glyph, color, alpha, bold, inBox ? 0 : s.group === 0 ? 0.14 : 0.2), c * cw, r * ch, cw, ch);
        }
      }

      // The satellite itself, and a short dotted track ahead of it.
      const satVec = [axisA[0] * Math.cos(u) + axisB[0] * Math.sin(u), axisA[1] * Math.cos(u) + axisB[1] * Math.sin(u), axisA[2] * Math.cos(u) + axisB[2] * Math.sin(u)];
      const satLat = Math.asin(satVec[2]);
      const satLon = Math.atan2(satVec[1], satVec[0]);
      ctx.fillStyle = INK.swath;
      for (let k = 1; k < 18; k++) {
        const uu = u + k * 0.06;
        const sv = [axisA[0] * Math.cos(uu) + axisB[0] * Math.sin(uu), axisA[1] * Math.cos(uu) + axisB[1] * Math.sin(uu), axisA[2] * Math.cos(uu) + axisB[2] * Math.sin(uu)];
        const q = project(Math.asin(sv[2]), Math.atan2(sv[1], sv[0]), cx, cy, R, lat0, lon0);
        if (q) ctx.fillRect(q.x - 1, q.y - 1, 2, 2);
      }
      const sp = project(satLat, satLon, cx, cy, R, lat0, lon0);
      if (sp) {
        ctx.save();
        ctx.translate(sp.x, sp.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = INK.paper;
        ctx.fillRect(-6, -6, 12, 12);
        ctx.strokeStyle = INK.swath;
        ctx.lineWidth = 2;
        ctx.strokeRect(-5, -5, 10, 10);
        ctx.restore();
        if (satelliteName) {
          ctx.font = `600 12px "IBM Plex Sans Condensed", system-ui, sans-serif`;
          ctx.fillStyle = INK.ink;
          ctx.textBaseline = 'middle';
          ctx.fillText(satelliteName, sp.x + 12, sp.y);
        }
      }

      // The focus box outline and label.
      if (box && p.focus) {
        const pts: { x: number; y: number }[] = [];
        const [w0, s0, e0, n0] = box;
        const steps = 24;
        for (let i = 0; i <= steps; i++) pts.push(project(n0 * RAD, (w0 + ((e0 - w0) * i) / steps) * RAD, cx, cy, R, lat0, lon0)!);
        for (let i = 0; i <= steps; i++) pts.push(project((n0 - ((n0 - s0) * i) / steps) * RAD, e0 * RAD, cx, cy, R, lat0, lon0)!);
        for (let i = 0; i <= steps; i++) pts.push(project(s0 * RAD, (e0 - ((e0 - w0) * i) / steps) * RAD, cx, cy, R, lat0, lon0)!);
        for (let i = 0; i <= steps; i++) pts.push(project((s0 + ((n0 - s0) * i) / steps) * RAD, w0 * RAD, cx, cy, R, lat0, lon0)!);
        if (pts.every(Boolean)) {
          ctx.beginPath();
          pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
          ctx.closePath();
          ctx.strokeStyle = INK.swath;
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Hover reticle.
      if (hover) {
        const g = invert(hover.x, hover.y, cx, cy, R, lat0, lon0);
        if (g) {
          ctx.strokeStyle = INK.ink;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(hover.x, hover.y, 10, 0, Math.PI * 2);
          ctx.moveTo(hover.x - 16, hover.y);
          ctx.lineTo(hover.x - 6, hover.y);
          ctx.moveTo(hover.x + 6, hover.y);
          ctx.lineTo(hover.x + 16, hover.y);
          ctx.moveTo(hover.x, hover.y - 16);
          ctx.lineTo(hover.x, hover.y - 6);
          ctx.moveTo(hover.x, hover.y + 6);
          ctx.lineTo(hover.x, hover.y + 16);
          ctx.stroke();
        }
      }
    }

    // ---- Pointer: drag to turn, hover to read, click to pick ------------------------------
    let down: { x: number; y: number; lon: number; lat: number; t: number; moved: boolean } | null = null;
    let lastMove = { x: 0, y: 0, t: 0 };
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const geoAt = (x: number, y: number) => {
      const v = view.current;
      const R = Math.min(size.w, size.h) * 0.46 * v.zoom;
      const g = invert(x, y, size.w / 2, size.h / 2, R, v.lat * RAD, v.lon * RAD);
      if (!g || !earth) return null;
      const lat = g.lat / RAD;
      const lon = ((g.lon / RAD + 540) % 360) - 180;
      return { lat, lon, sample: sample(earth, lat, lon) };
    };
    const onDown = (e: PointerEvent) => {
      const { x, y } = local(e);
      const v = view.current;
      down = { x, y, lon: v.lon, lat: v.lat, t: performance.now(), moved: false };
      lastMove = { x, y, t: performance.now() };
      v.target = null;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const { x, y } = local(e);
      const v = view.current;
      if (down) {
        const R = Math.min(size.w, size.h) * 0.46 * v.zoom;
        const dx = x - down.x;
        const dy = y - down.y;
        if (Math.hypot(dx, dy) > 4) down.moved = true;
        if (down.moved) {
          v.dragging = true;
          v.lon = down.lon - (dx / R) * 57.3;
          v.lat = Math.max(-70, Math.min(70, down.lat + (dy / R) * 57.3));
          const now = performance.now();
          const dt = Math.max(1, now - lastMove.t);
          v.vLon = (-(x - lastMove.x) / R) * 57.3 / dt;
          v.vLat = ((y - lastMove.y) / R) * 57.3 / dt;
          lastMove = { x, y, t: now };
        }
      }
      hover = e.pointerType === 'mouse' ? { x, y } : null;
      const g = geoAt(x, y);
      canvas.style.cursor = down?.moved ? 'grabbing' : g ? 'crosshair' : 'default';
      props.current.onHover?.(g ? { ...g, text: describe(g.sample), where: formatLatLon(g.lat, g.lon) } : null);
      schedule();
    };
    const onUp = (e: PointerEvent) => {
      const v = view.current;
      const { x, y } = local(e);
      if (down && !down.moved) {
        const g = geoAt(x, y);
        if (g) props.current.onPick?.(g.lat, g.lon, g.sample);
      }
      v.dragging = false;
      down = null;
      schedule();
    };
    const onLeave = () => {
      hover = null;
      props.current.onHover?.(null);
      schedule();
    };
    // Keyboard: arrows turn the planet.
    const onKey = (e: KeyboardEvent) => {
      const v = view.current;
      const step = 8;
      if (e.key === 'ArrowLeft') v.lon -= step;
      else if (e.key === 'ArrowRight') v.lon += step;
      else if (e.key === 'ArrowUp') v.lat = Math.min(70, v.lat + step);
      else if (e.key === 'ArrowDown') v.lat = Math.max(-70, v.lat - step);
      else return;
      v.target = null;
      e.preventDefault();
      schedule();
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('keydown', onKey);
    const onVis = () => schedule();
    document.addEventListener('visibilitychange', onVis);
    document.fonts?.ready.then(() => {
      resize();
    });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [cell, satelliteName]);

  // Props that only change the drawing still need a frame when the planet is at rest.
  useEffect(() => {
    scheduleRef.current?.();
  }, [focus, emphasis, swathKm]);

  return (
    <canvas
      ref={canvasRef}
      className={`globe ${className}`}
      tabIndex={0}
      role="img"
      aria-label={ariaLabel ?? 'The planet drawn in type from satellite data. Drag or use the arrow keys to turn it.'}
    />
  );
}
