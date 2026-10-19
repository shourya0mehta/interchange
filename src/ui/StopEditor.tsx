import { COMPONENTS, METHOD_BY_ID, SIGNAL_NAMES, STATIONS, STATION_BY_ID } from '../network/network';
import type { ComponentId, MethodId, Route } from '../network/types';
import { methodsFor } from '../planner/plan';
import type { Signal } from '../runtime/sources';
import type { StopKey } from './RouteStrip';

function outputOf(r: Route): 'raster' | 'classes' | 'image' {
  const st = STATION_BY_ID[r.station];
  if (st.provides === 'classes') return 'classes';
  if (r.signal === 'true-color') return 'image';
  return 'raster';
}

export function StopEditor({ route, stop, onChange }: { route: Route; stop: StopKey; onChange: (r: Route) => void }) {
  const st = STATION_BY_ID[route.station];

  if (stop === 'source') {
    const options = STATIONS.filter((s) => s.live && (s.signals.includes(route.signal) || s.provides === st.provides));
    return (
      <div className="editor">
        <h4>Swap the data</h4>
        <label className="field">
          Station
          <select
            value={route.station}
            onChange={(e) => {
              const next = STATION_BY_ID[e.target.value];
              const signal = (next.signals.includes(route.signal) ? route.signal : next.signals[0]) as Signal;
              onChange({
                ...route,
                station: next.id,
                signal,
                methods: methodsFor(next, signal, route.methods.includes('difference')),
                runs: next.live ? 'live' : 'export',
              });
            }}
          >
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.specs.resolution}, {s.specs.years})
              </option>
            ))}
          </select>
        </label>
        <p className="hint">Only stations that run live in the browser are listed here. The network map has the rest.</p>
      </div>
    );
  }

  if (stop === 'signal') {
    return (
      <div className="editor">
        <h4>What to measure</h4>
        <label className="field">
          Index
          <select
            value={route.signal}
            onChange={(e) => {
              const signal = e.target.value as Signal;
              onChange({ ...route, signal, methods: methodsFor(st, signal, route.methods.includes('difference')) });
            }}
          >
            {st.signals.map((s) => (
              <option key={s} value={s}>
                {SIGNAL_NAMES[s]?.long ?? s}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  if (stop === 'windows') {
    const setWindow = (i: number, patch: Partial<Route['windows'][number]>) =>
      onChange({ ...route, windows: route.windows.map((w, j) => (j === i ? { ...w, ...patch } : w)) });
    const canGrow = route.views.includes('time-slider') && route.windows.length < 8;
    return (
      <div className="editor">
        <h4>Dates</h4>
        {route.windows.map((w, i) => (
          <div className="window-row" key={i}>
            <label className="field">
              <span className="sr-only">Label for window {i + 1}</span>
              <input value={w.label} onChange={(e) => setWindow(i, { label: e.target.value })} />
            </label>
            <label className="field">
              <span className="sr-only">Start of {w.label}</span>
              <input type="date" value={w.start} onChange={(e) => setWindow(i, { start: e.target.value })} />
            </label>
            <label className="field">
              <span className="sr-only">End of {w.label}</span>
              <input type="date" value={w.end} onChange={(e) => setWindow(i, { end: e.target.value })} />
            </label>
          </div>
        ))}
        {route.historyRange && (
          <>
            <p className="hint">Click-for-history range</p>
            <div className="window-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label className="field">
                <span className="sr-only">History start</span>
                <input type="date" value={route.historyRange.start} onChange={(e) => onChange({ ...route, historyRange: { ...route.historyRange!, start: e.target.value } })} />
              </label>
              <label className="field">
                <span className="sr-only">History end</span>
                <input type="date" value={route.historyRange.end} onChange={(e) => onChange({ ...route, historyRange: { ...route.historyRange!, end: e.target.value } })} />
              </label>
            </div>
          </>
        )}
        {canGrow && (
          <button
            className="btn-link"
            onClick={() => {
              const last = route.windows[route.windows.length - 1];
              const shift = (d: string) => `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;
              onChange({ ...route, windows: [...route.windows, { label: last.label.replace(/\d{4}/, (y) => String(Number(y) + 1)), start: shift(last.start), end: shift(last.end) }] });
            }}
          >
            Add the next year
          </button>
        )}
      </div>
    );
  }

  if (stop === 'views') {
    const out = outputOf(route);
    const toggle = (id: ComponentId, on: boolean) =>
      onChange({ ...route, views: on ? [...route.views, id] : route.views.filter((v) => v !== id) });
    return (
      <div className="editor">
        <h4>What the app shows</h4>
        <div className="checks">
          {COMPONENTS.filter((c) => c.accepts.includes(out)).map((c) => (
            <label key={c.id} title={c.does}>
              <input type="checkbox" checked={route.views.includes(c.id)} disabled={c.id === 'layer'} onChange={(e) => toggle(c.id, e.target.checked)} />
              {c.name}
            </label>
          ))}
        </div>
        <p className="hint">A swipe needs two dates and a time slider needs two or more; the checker below says when they don't fit.</p>
      </div>
    );
  }

  const id = stop.slice('method:'.length) as MethodId;
  const m = METHOD_BY_ID[id];
  if (!m) return null;
  return (
    <div className="editor">
      <h4>{m.name}</h4>
      <p style={{ margin: '0 0 8px' }}>{m.does}</p>
      <p className="hint" style={{ marginBottom: 4 }}>Open-source tools for this step:</p>
      <ul className="plain-list">
        {m.tools.map((t) => (
          <li key={t.name}>
            <a href={t.url} target="_blank" rel="noreferrer">
              {t.name}
            </a>
            : {t.what}
          </li>
        ))}
      </ul>
      {id === 'difference' && (
        <button className="btn-link" style={{ marginTop: 8 }} onClick={() => onChange({ ...route, methods: route.methods.filter((x) => x !== 'difference') })}>
          Remove the change map
        </button>
      )}
    </div>
  );
}
