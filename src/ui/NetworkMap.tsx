import { useMemo } from 'react';
import { LINES, STATIONS } from '../network/network';
import type { LineId, Station } from '../network/types';

const W = 1240;
const LEFT = 170;
const RIGHT = 40;
const TOP = 70;
const GAP = 112;

const lineY = Object.fromEntries(LINES.map((l, i) => [l.id, TOP + i * GAP])) as Record<LineId, number>;
const xOf = (s: Station) => LEFT + (s.x / 1000) * (W - LEFT - RIGHT);

interface Placed {
  station: Station;
  x: number;
  y0: number;
  y1: number;
  labelY: number;
  anchor: 'middle' | 'start';
}

const SHORT: Record<string, string> = {
  'io-lulc': 'IO land cover',
  'esa-worldcover': 'WorldCover',
  'jrc-water': 'Surface water',
  'cop-dem': 'Copernicus DEM',
  'dynamic-world': 'Dynamic World',
  alphaearth: 'AlphaEarth',
  'active-fire': 'Active fire',
  oisst: 'Sea surface temp',
  nclimgrid: 'NClimGrid',
  'usda-cdl': 'US crops (CDL)',
  'esa-cci-lc': 'CCI land cover',
  gedi: 'GEDI height',
  hansen: 'Forest Change',
  smap: 'SMAP',
  grace: 'GRACE',
  'modis-snow': 'MODIS snow',
  snotel: 'SNOTEL',
  argo: 'Argo floats',
  era5: 'ERA5-Land',
  chirps: 'CHIRPS rain',
  s5p: 'Sentinel-5P',
  goes: 'GOES-19',
  'modis-lst': 'Surface temp',
  'viirs-night': 'Night lights',
  'modis-vi': 'MODIS NDVI',
  'sentinel-1': 'Sentinel-1',
  'sentinel-2': 'Sentinel-2',
  landsat: 'Landsat',
};

export function shortName(s: Station): string {
  return SHORT[s.id] ?? s.name;
}

function layout(): Placed[] {
  const out: Placed[] = [];
  const perLine = new Map<LineId, Station[]>();
  for (const s of STATIONS) {
    if (s.lines.length > 1) {
      const ys = s.lines.map((l) => lineY[l]);
      const y0 = Math.min(...ys);
      const y1 = Math.max(...ys);
      out.push({ station: s, x: xOf(s), y0, y1, labelY: y1 + 30, anchor: 'middle' });
    } else {
      const l = s.lines[0];
      perLine.set(l, [...(perLine.get(l) ?? []), s]);
    }
  }
  // Labels go on the lowest free row above their line, measured by an estimate of their width,
  // so neighbors never print over each other.
  const widthOf = (s: Station) => shortName(s).length * 6.7 + 10;
  for (const [l, list] of perLine) {
    list.sort((a, b) => a.x - b.x);
    const rows: [number, number][][] = [[], [], []];
    for (const s of list) {
      const y = lineY[l];
      const x = xOf(s);
      const half = widthOf(s) / 2;
      let row = rows.findIndex((spans) => spans.every(([a, b]) => x + half < a || x - half > b));
      if (row < 0) row = rows.length - 1;
      rows[row].push([x - half, x + half]);
      out.push({ station: s, x, y0: y, y1: y, labelY: y - 16 - row * 17, anchor: 'middle' });
    }
  }
  return out;
}

export function NetworkMap({
  selected,
  highlight,
  onSelect,
}: {
  selected: string | null;
  highlight: string[];
  onSelect: (id: string) => void;
}) {
  const placed = useMemo(layout, []);
  const H = TOP + (LINES.length - 1) * GAP + 70;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="group"
      aria-label="Network map of Earth observation datasets"
      style={{ maxWidth: '100%', height: 'auto', minWidth: 900 }}
    >
      {LINES.map((l) => (
        <g key={l.id}>
          <line x1={LEFT - 8} x2={W - RIGHT + 8} y1={lineY[l.id]} y2={lineY[l.id]} stroke={l.color} strokeWidth={8} strokeLinecap="round" />
          <circle cx={30} cy={lineY[l.id]} r={13} fill={l.color} />
          <text x={30} y={lineY[l.id] + 4.5} textAnchor="middle" fontSize={12} fontWeight={800} fill="#fff">
            {l.name[0]}
          </text>
          <text className="line-name" x={52} y={lineY[l.id] + 4.5}>
            {l.name}
          </text>
        </g>
      ))}
      {placed.map(({ station: s, x, y0, y1, labelY, anchor }) => {
        const isSel = selected === s.id;
        const lit = highlight.includes(s.id);
        const color = '#000';
        const multi = y1 > y0;
        return (
          <g
            key={s.id}
            className="station-hit"
            role="button"
            tabIndex={0}
            aria-label={`${s.name}, ${s.live ? 'runs live' : s.temporal === 'in-situ' ? 'ground network' : 'export only'}`}
            aria-pressed={isSel}
            onClick={() => onSelect(s.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(s.id);
              }
            }}
          >
            {(lit || isSel) && (
              <rect x={x - 18} y={y0 - 18} width={36} height={y1 - y0 + 36} rx={18} fill="none" stroke="#000" strokeOpacity={0.18} strokeWidth={10} />
            )}
            {multi ? (
              <rect className="station-ring" x={x - 10} y={y0 - 10} width={20} height={y1 - y0 + 20} rx={10} fill="#fff" stroke={color} strokeWidth={3} />
            ) : s.live ? (
              <circle className="station-ring" cx={x} cy={y0} r={9} fill="#fff" stroke={color} strokeWidth={3} />
            ) : s.temporal === 'in-situ' ? (
              <rect className="station-ring" x={x - 6} y={y0 - 6} width={12} height={12} transform={`rotate(45 ${x} ${y0})`} fill="#fff" stroke={color} strokeWidth={2} />
            ) : (
              <rect className="station-ring" x={x - 3} y={y0 - 14} width={6} height={14} fill="#fff" stroke={color} strokeWidth={2} />
            )}
            {/* A thumb-sized hit area around the station and its label. */}
            <rect x={x - 46} y={Math.min(labelY - 18, y0 - 22)} width={92} height={Math.max(62, Math.max(y1, labelY) - Math.min(labelY - 18, y0 - 22) + 10)} fill="transparent" />
            <text className={`station-label${s.live ? '' : ' export'}`} x={x} y={labelY} textAnchor={anchor}>
              {shortName(s)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function MapKey() {
  return (
    <div className="map-key" aria-label="Map key">
      <span>
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="7" fill="#fff" stroke="#000" strokeWidth="3" />
        </svg>
        Runs live in your browser
      </span>
      <span>
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <rect x="7" y="3" width="6" height="14" fill="#fff" stroke="#000" strokeWidth="2" />
        </svg>
        Export to Earth Engine
      </span>
      <span>
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <rect x="5" y="5" width="10" height="10" transform="rotate(45 10 10)" fill="#fff" stroke="#000" strokeWidth="2" />
        </svg>
        Ground network, no map yet
      </span>
      <span>
        <svg width="20" height="28" viewBox="0 0 20 28" aria-hidden="true">
          <rect x="4" y="2" width="12" height="24" rx="6" fill="#fff" stroke="#000" strokeWidth="2.5" />
        </svg>
        Interchange: serves several spheres
      </span>
    </div>
  );
}
