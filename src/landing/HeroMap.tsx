import { useMemo } from 'react';
import { LINES, STATIONS } from '../network/network';
import type { LineId, Station } from '../network/types';
import { shortName } from '../ui/NetworkMap';

const W = 720;
const H = 520;
const X0 = 70;
const X1 = W - 170;
const ROW: Record<LineId, number> = { atmosphere: 70, biosphere: 165, hydrosphere: 260, cryosphere: 355, lithosphere: 450 };
const TERM = { x: W - 64, y: 260 };

const xOf = (s: Station) => X0 + (s.x / 1000) * (X1 - X0);

/** Each line enters with a 45° jog, the way a printed metro map draws its branches. */
function linePath(id: LineId): string {
  const y = ROW[id];
  const jog = { atmosphere: -30, biosphere: 0, hydrosphere: 0, cryosphere: 30, lithosphere: 0 }[id];
  return jog ? `M 18 ${y - jog} L ${18 + Math.abs(jog)} ${y} H ${X1 + 40}` : `M 18 ${y} H ${X1 + 40}`;
}

/** From a station along its line, then a 45° turn into the app terminus. */
function routePath(s: Station): string {
  const sx = xOf(s);
  const sy = ROW[s.lines[s.lines.length - 1]] ?? ROW[s.lines[0]];
  const y = s.lines.length > 1 ? ROW[s.lines.find((l) => Math.abs(ROW[l] - TERM.y) === Math.min(...s.lines.map((m) => Math.abs(ROW[m] - TERM.y))))!] : sy;
  const turnX = TERM.x - 46 - Math.abs(y - TERM.y);
  return `M ${sx} ${y} H ${Math.max(sx, turnX)} L ${TERM.x - 46} ${TERM.y} H ${TERM.x}`;
}

/**
 * The landing page's map: every dataset on its sphere's line. As the question is read, the
 * stations that answer it light up and the route draws itself to the app.
 */
export function HeroMap({ lit, primary, shows, color }: { lit: string[]; primary: string | null; shows: string; color: string }) {
  const stations = useMemo(() => STATIONS, []);
  const main = primary ? stations.find((s) => s.id === primary) ?? null : null;
  // Lit stations on the same line take turns above and below it, so labels never collide.
  const below = new Set<string>();
  for (const l of LINES) {
    const onLine = stations.filter((s) => lit.includes(s.id) && s.lines.length === 1 && s.lines[0] === l.id).sort((a, b) => a.x - b.x);
    onLine.forEach((s, i) => {
      if (i % 2 === 1 || (s.id !== primary && onLine.some((o) => o.id === primary))) below.add(s.id);
    });
    if (onLine.some((o) => o.id === primary)) below.delete(primary!);
  }
  return (
    <svg className="hero-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={main ? `Route from ${main.name} to a ${shows.toLowerCase()} app` : 'Map of datasets as stations on five lines'}>
      {LINES.map((l) => (
        <g key={l.id}>
          <path d={linePath(l.id)} fill="none" stroke={l.color} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" opacity={main ? 0.3 : 1} />
          <text className="hero-line-name" x={18} y={ROW[l.id] - 14 - (l.id === 'atmosphere' ? 30 : 0)}>
            {l.name}
          </text>
        </g>
      ))}
      {main && (
        <g key={main.id}>
          <path className="hero-route" d={routePath(main)} fill="none" stroke="#fff" strokeWidth={19} strokeLinecap="round" strokeLinejoin="round" />
          <path className="hero-route" d={routePath(main)} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {stations.map((s) => {
        const x = xOf(s);
        const ys = s.lines.map((l) => ROW[l]);
        const y0 = Math.min(...ys);
        const y1 = Math.max(...ys);
        const on = lit.includes(s.id);
        const isMain = s.id === primary;
        return (
          <g key={s.id} opacity={main && !on ? 0.45 : 1}>
            {y1 > y0 ? (
              <rect x={x - 9} y={y0 - 9} width={18} height={y1 - y0 + 18} rx={9} fill="#fff" stroke="#000" strokeWidth={isMain ? 4 : 2.5} />
            ) : s.live ? (
              <circle cx={x} cy={y0} r={isMain ? 9 : 7} fill="#fff" stroke="#000" strokeWidth={isMain ? 4 : 2.5} />
            ) : (
              // A plain stop is a tick off the line, as on a printed metro map.
              <rect x={x - 2} y={y0 - 14} width={4} height={10} fill="#222629" />
            )}
            {on && (
              <text className={`hero-station${isMain ? ' main' : ''}`} x={x} y={y1 > y0 ? y1 + 30 : below.has(s.id) ? y0 + 30 : y0 - 20} textAnchor="middle">
                {shortName(s)}
              </text>
            )}
          </g>
        );
      })}
      <g className="hero-term" opacity={main ? 1 : 0.5}>
        <rect x={TERM.x - 16} y={TERM.y - 16} width={32} height={32} rx={6} fill={main ? color : '#fff'} stroke="#000" strokeWidth={3} />
        <text x={W - 6} y={TERM.y + 40} textAnchor="end" className="hero-station main">
          Your app
        </text>
        {main && (
          <text x={W - 6} y={TERM.y + 58} textAnchor="end" className="hero-term-note">
            {shows}
          </text>
        )}
      </g>
    </svg>
  );
}
