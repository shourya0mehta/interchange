import type { Map as MlMap } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import type { Place } from '../planner/plan';
import type { Bbox } from '../runtime/geo';
import { getFetcher } from '../runtime/stac';
import { createMap, setAoi, whenStyled } from './maplib';

interface Hit {
  name: string;
  detail: string;
  bbox: Bbox;
}

/** Photon (OpenStreetMap) search-as-you-type, CORS-enabled and free. */
async function suggest(q: string, signal: AbortSignal): Promise<Hit[]> {
  const url = `https://photon.komoot.io/api/?limit=6&q=${encodeURIComponent(q)}`;
  const res = await getFetcher()(url, { signal });
  if (!res.ok) return [];
  const j = (await res.json()) as {
    features: { properties: { name?: string; state?: string; country?: string; county?: string; type?: string; extent?: [number, number, number, number] }; geometry: { coordinates: [number, number] } }[];
  };
  return j.features
    .filter((f) => f.properties.name)
    .map((f) => {
      const p = f.properties;
      const [x, y] = f.geometry.coordinates;
      const bbox: Bbox = p.extent ? [p.extent[0], p.extent[3], p.extent[2], p.extent[1]] : [x - 0.05, y - 0.04, x + 0.05, y + 0.04];
      return { name: p.name!, detail: [p.county, p.state, p.country].filter(Boolean).join(', '), bbox };
    });
}

const WORLD: Bbox = [-130, 15, -60, 55];

/**
 * When a place can't be read from the sentence: search for it, or frame it on the map, or drag
 * a box. Whatever is on screen when "Use this area" is pressed becomes the place.
 */
/** The box around every coordinate in a GeoJSON or KML file: a field, a farm, a district. */
export function boundaryBbox(text: string): Bbox | null {
  const pts: [number, number][] = [];
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    const walk = (v: unknown) => {
      if (Array.isArray(v)) {
        if (v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number') pts.push([v[0], v[1]]);
        else v.forEach(walk);
      } else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    try {
      walk(JSON.parse(t));
    } catch {
      return null;
    }
  } else {
    for (const m of t.matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/g))
      for (const c of m[1].trim().split(/\s+/)) {
        const [x, y] = c.split(',').map(Number);
        if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
      }
  }
  const ok = pts.filter(([x, y]) => Math.abs(x) <= 180 && Math.abs(y) <= 90);
  if (!ok.length) return null;
  const xs = ok.map((p) => p[0]);
  const ys = ok.map((p) => p[1]);
  const b: Bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  // A single point or a tiny field still needs a little room around it.
  const padX = Math.max(0, 0.01 - (b[2] - b[0]) / 2);
  const padY = Math.max(0, 0.008 - (b[3] - b[1]) / 2);
  return [b[0] - padX, b[1] - padY, b[2] + padX, b[3] + padY];
}

export function PlacePicker({ initial, onPick, onCancel }: { initial: string; onPick: (p: Place) => void; onCancel: () => void }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [q, setQ] = useState(initial);
  const [hits, setHits] = useState<Hit[]>([]);
  const [chosen, setChosen] = useState<Place | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [searchState, setSearchState] = useState<'idle' | 'looking' | 'none' | 'error'>('idle');
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const readFile = async (f: File) => {
    setFileError(null);
    const b = boundaryBbox(await f.text());
    if (!b) {
      setFileError(`Couldn't find coordinates in ${f.name}. Use a GeoJSON or KML file.`);
      return;
    }
    show({ name: f.name.replace(/\.(geo)?json$|\.kml$/i, ''), bbox: b });
  };

  useEffect(() => {
    const m = createMap(mapEl.current!, WORLD);
    map.current = m;
    return () => m.remove();
  }, []);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setHits([]);
      setSearchState('idle');
      return;
    }
    const ctrl = new AbortController();
    setSearchState('looking');
    const t = setTimeout(() => {
      suggest(text, ctrl.signal)
        .then((h) => {
          setHits(h);
          setSearchState(h.length ? 'idle' : 'none');
        })
        .catch((e) => (e as Error).name !== 'AbortError' && setSearchState('error'));
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const show = (p: Place) => {
    setChosen(p);
    const m = map.current;
    if (!m) return;
    m.fitBounds(p.bbox as [number, number, number, number], { padding: 40, duration: 0 });
    whenStyled(m).then(() => setAoi(m, p.bbox));
  };

  // Drag a box: pan is paused while drawing so the drag draws instead.
  useEffect(() => {
    const m = map.current;
    if (!m || !drawing) return;
    m.dragPan.disable();
    const canvas = m.getCanvasContainer();
    let start: { lng: number; lat: number } | null = null;
    const down = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      start = m.unproject([e.clientX - r.left, e.clientY - r.top]);
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!start) return;
      const r = canvas.getBoundingClientRect();
      const p = m.unproject([e.clientX - r.left, e.clientY - r.top]);
      const b: Bbox = [Math.min(start.lng, p.lng), Math.min(start.lat, p.lat), Math.max(start.lng, p.lng), Math.max(start.lat, p.lat)];
      whenStyled(m).then(() => setAoi(m, b));
      setChosen({ name: 'The box you drew', bbox: b });
    };
    const up = () => {
      start = null;
      setDrawing(false);
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      m.dragPan.enable();
    };
  }, [drawing]);

  const useView = () => {
    const m = map.current;
    if (!m) return;
    const b = m.getBounds();
    onPick({ name: chosen && chosen.name !== 'The box you drew' ? chosen.name : 'The area on the map', bbox: chosen?.bbox ?? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] });
  };

  return (
    <div className="picker">
      <h2 id="modal-title">Where should the map look?</h2>
      <p className="hint" style={{ marginTop: 0 }}>Search for a place, or move the map and drag a box around the area you mean.</p>
      <div className="picker-search">
        <label className="sr-only" htmlFor="picker-q">
          Search for a place
        </label>
        <input id="picker-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="A county, city, park, lake or coast" autoComplete="off" autoFocus />
        {hits.length > 0 && (
          <ul className="picker-hits" role="listbox" aria-label="Places found">
            {hits.map((h) => (
              <li key={`${h.name}-${h.detail}`} role="option" aria-selected={chosen?.name === h.name}>
                <button type="button" onClick={() => show({ name: [h.name, h.detail.split(', ').slice(-2, -1)[0]].filter(Boolean).join(', '), bbox: h.bbox })}>
                  <strong>{h.name}</strong> <span>{h.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {searchState === 'none' && <p className="hint">Nothing by that name. Try a nearby town, or draw a box.</p>}
        {searchState === 'error' && <p className="error" role="alert">Place search isn't answering. Draw a box on the map instead.</p>}
      </div>
      <div className="picker-map" ref={mapEl} data-drawing={drawing || undefined} />
      <div className="route-actions">
        <button type="button" className="btn btn-primary" onClick={useView}>
          {chosen ? `Use ${chosen.name}` : 'Use this area'}
        </button>
        <button type="button" className="btn" aria-pressed={drawing} onClick={() => setDrawing((d) => !d)}>
          {drawing ? 'Drag on the map' : 'Draw a box'}
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          Use a boundary file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".geojson,.json,.kml,application/geo+json,application/vnd.google-earth.kml+xml"
          hidden
          onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
        />
        <button type="button" className="btn-link" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {fileError && (
        <p className="error" role="alert">
          {fileError}
        </p>
      )}
    </div>
  );
}
