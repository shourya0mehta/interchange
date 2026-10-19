import type { CSSProperties } from 'react';
import { COMPONENT_BY_ID, METHOD_BY_ID, SIGNAL_NAMES, STATION_BY_ID } from '../network/network';
import type { Route } from '../network/types';
import { INDICES } from '../runtime/indices';
import { stationColor } from './colors';

export type StopKey = 'source' | 'windows' | 'signal' | 'views' | `method:${string}`;

export interface StripStop {
  key: StopKey;
  name: string;
  note: string;
  terminus?: boolean;
}

function windowsNote(r: Route): string {
  if (r.historyRange) return `Map: ${r.windows[r.windows.length - 1].label}. History: ${r.historyRange.start.slice(0, 4)} to ${r.historyRange.end.slice(0, 4)}`;
  return r.windows.map((w) => w.label).join(', ');
}

export function stripStops(r: Route): StripStop[] {
  const st = STATION_BY_ID[r.station];
  const stops: StripStop[] = [{ key: 'source', name: st.name, note: `${st.specs.resolution}, ${st.specs.revisit}` }];
  for (const id of r.methods) {
    const m = METHOD_BY_ID[id];
    if (id === 'find-scenes') {
      stops.push({ key: 'windows', name: m.name, note: windowsNote(r) });
    } else if (id === 'index') {
      const sig = SIGNAL_NAMES[r.signal];
      stops.push({ key: 'signal', name: sig?.short ?? r.signal, note: INDICES[r.signal]?.formula ?? m.does });
    } else {
      stops.push({ key: `method:${id}`, name: m.name, note: m.does });
    }
  }
  stops.push({
    key: 'views',
    name: r.runs === 'live' ? 'Live app' : 'Earth Engine export',
    note: r.views.map((v) => COMPONENT_BY_ID[v].name).join(', '),
    terminus: true,
  });
  return stops;
}

const ROW = 46;

/** A strip map, the kind posted inside a subway car: one line, stops top to bottom. */
export function RouteStrip({
  route,
  active,
  onStop,
  animate,
}: {
  route: Route;
  active: StopKey | null;
  onStop?: (k: StopKey) => void;
  animate: boolean;
}) {
  const stops = stripStops(route);
  const color = stationColor(STATION_BY_ID[route.station]);
  const h = stops.length * ROW;
  const len = h - ROW;
  return (
    <svg className="route-line" viewBox={`0 0 400 ${h}`} height={h} role="list" aria-label={`Stops on ${route.title}`}>
      <line
        x1={14}
        x2={14}
        y1={ROW / 2}
        y2={h - ROW / 2}
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        className={animate ? 'draw-line' : undefined}
        style={animate ? ({ '--len': len } as CSSProperties) : undefined}
      />
      {stops.map((s, i) => {
        const y = i * ROW + ROW / 2;
        const isActive = active === s.key;
        const content = (
          <>
            {s.terminus ? (
              <rect x={4} y={y - 10} width={20} height={20} rx={4} fill={route.runs === 'live' ? color : '#fff'} stroke="#000" strokeWidth={2.5} />
            ) : (
              <circle cx={14} cy={y} r={isActive ? 9 : 7.5} fill="#fff" stroke="#000" strokeWidth={isActive ? 3.5 : 2.5} />
            )}
            <text className="stop-label" x={34} y={y - 3}>
              {s.name}
            </text>
            <text className="stop-note" x={34} y={y + 12}>
              {s.note.length > 62 ? `${s.note.slice(0, 60)}…` : s.note}
            </text>
          </>
        );
        return (
          <g
            key={s.key}
            role="listitem"
            className={animate ? 'pop-in' : undefined}
            style={animate ? { animationDelay: `${40 + i * 40}ms` } : undefined}
          >
            {onStop ? (
              <g
                className="stop-hit"
                role="button"
                tabIndex={0}
                aria-label={`Edit ${s.name}`}
                aria-pressed={isActive}
                onClick={() => onStop(s.key)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onStop(s.key);
                  }
                }}
              >
                <rect x={0} y={y - ROW / 2} width={400} height={ROW} fill="transparent" />
                {content}
              </g>
            ) : (
              content
            )}
          </g>
        );
      })}
    </svg>
  );
}
