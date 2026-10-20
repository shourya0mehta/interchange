import { formatValue, type Ramp } from '../runtime/colormap';
import type { TimeWindow } from '../runtime/layers';
import type { SeriesPoint } from '../runtime/series';

const W = 320;
const H = 168;
const L = 34;
const R = 8;
const T = 10;
const B = 22;

/** History at one point: dots for each clear look, a thin line between them, windows shaded. */
export function HistoryChart({
  points,
  domain,
  windows,
  units,
  color,
  format,
}: {
  points: SeriesPoint[];
  domain: [number, number];
  windows: TimeWindow[];
  units: string;
  color: string;
  format?: Ramp['format'];
}) {
  const label = (v: number) => (format ? formatValue({ format }, v).replace(' °C', '°') : Math.abs(hi - lo) > 20 ? String(Math.round(v)) : v.toFixed(1));
  if (!points.length) return null;
  const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const t0 = t(points[0].date);
  const t1 = Math.max(t(points[points.length - 1].date), t0 + 86400000);
  const lo = Math.min(domain[0], ...points.map((p) => p.value));
  const hi = Math.max(domain[1], ...points.map((p) => p.value));
  const x = (d: string) => L + ((t(d) - t0) / (t1 - t0)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const years: number[] = [];
  const y0 = new Date(t0).getUTCFullYear();
  const y1 = new Date(t1).getUTCFullYear();
  const step = Math.max(1, Math.ceil((y1 - y0 + 1) / 6));
  for (let yr = y0; yr <= y1 + 1; yr += step) {
    const d = `${yr}-01-01`;
    if (t(d) >= t0 && t(d) <= t1) years.push(yr);
  }
  const ticks = [lo, (lo + hi) / 2, hi];
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)} ${y(p.value).toFixed(1)}`).join('');
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${units} over time, ${points.length} clear observations`}>
      {windows
        .filter((w) => t(w.end) >= t0 && t(w.start) <= t1)
        .map((w) => (
          <rect key={w.label} x={Math.max(L, x(w.start))} y={T} width={Math.max(2, Math.min(W - R, x(w.end)) - Math.max(L, x(w.start)))} height={H - T - B} fill="#000" fillOpacity={0.05}>
            <title>{w.label}</title>
          </rect>
        ))}
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#d7dad4" />
          <text x={L - 5} y={y(v) + 3.5} textAnchor="end">
            {label(v)}
          </text>
        </g>
      ))}
      {years.map((yr) => (
        <text key={yr} x={x(`${yr}-01-01`)} y={H - 6} textAnchor="middle">
          {yr}
        </text>
      ))}
      <path d={path} fill="none" stroke="#9aa0a5" strokeWidth={1} />
      {points.map((p) => (
        <circle key={`${p.date}-${p.source}`} cx={x(p.date)} cy={y(p.value)} r={2.6} fill={color}>
          <title>{`${p.date}: ${format ? formatValue({ format }, p.value) : p.value.toFixed(3)}`}</title>
        </circle>
      ))}
    </svg>
  );
}
