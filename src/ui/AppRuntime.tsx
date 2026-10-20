import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { composeGif, composeImage, type ExportFormat, type ExportLegend } from './exportImage';
import { creditLine } from '../compiler/credit';
import { CopyButton } from './keys';
import type { AppSpec } from '../compiler/spec';
import { METHOD_BY_ID, SIGNAL_NAMES, STATION_BY_ID } from '../network/network';
import { lonLatToMerc, makeGrid } from '../runtime/geo';
import { shapeMask } from '../runtime/shape';
import { LANDCOVER_CLASSES } from '../runtime/colormap';
import { formatValue, rampColorAt } from '../runtime/colormap';
import { differenceLayer, evaluateLayer, type LayerResult, type TimeWindow } from '../runtime/layers';
import { pointSeries, type SeriesResult } from '../runtime/series';
import { changeRamp, gridCorners, layerRgba, legendFor, pixelSizeLabel, presentClasses, rampFor, regionStats, sharedDomain, toDataUrl } from '../runtime/render';
import { download, layerGeoTiff, seriesCsv } from '../runtime/export';
import { INDICES } from '../runtime/indices';
import { HistoryChart } from './Chart';
import { MapView } from './MapView';
import { stationColor } from './colors';

type Status = { state: 'idle' } | { state: 'loading'; message: string } | { state: 'error'; message: string };

/** What the studio can ask of a running app. */
export interface AppApi {
  exportImage: (format: ExportFormat) => Promise<Blob>;
  /** Only when the app has more than one date. */
  exportGif?: (onFrame?: (done: number, of: number) => void) => Promise<Blob>;
}


export function AppRuntime({
  spec,
  mode,
  actions,
  onTitle,
  onFork,
  onSpec,
  apiRef,
  openUrl,
}: {
  spec: AppSpec;
  mode: 'builder' | 'published' | 'embed';
  actions?: ReactNode;
  onTitle?: (title: string) => void;
  onFork?: () => void;
  /** Builder only: notes and questions edited in place. */
  onSpec?: (s: AppSpec) => void;
  apiRef?: MutableRefObject<AppApi | null>;
  /** Embed only: where "Open in Interchange" goes. */
  openUrl?: string;
}) {
  const station = STATION_BY_ID[spec.station];
  const color = stationColor(station);
  const has = (c: string) => spec.components.includes(c as never);
  const swipe = has('swipe') && spec.windows.length === 2;
  const slider = has('time-slider') && spec.windows.length > 1 && !swipe;
  const chartable = has('click-chart') && (station.temporal === 'dense' || station.temporal === 'composite') && spec.signal !== 'true-color';
  const canChange = spec.methods.includes('difference') && spec.windows.length === 2;

  const grid = useMemo(() => makeGrid(spec.aoi.bbox, typeof window !== 'undefined' && window.innerWidth < 700 ? 640 : 900), [spec.aoi.bbox]);
  const corners = useMemo(() => gridCorners(grid), [grid]);
  const [winIdx, setWinIdx] = useState(spec.windows.length - 1);
  const [change, setChangeState] = useState(spec.view === 'change' && canChange);
  // A follow-up in the studio ("show only the change") switches the view from outside.
  useEffect(() => setChangeState(spec.view === 'change' && canChange), [spec.view, canChange]);
  // In the studio, the view on screen is the view that gets published.
  const setChange = (v: boolean) => {
    setChangeState(v);
    if (mode === 'builder' && onSpec && (spec.view === 'change') !== v) onSpec({ ...spec, view: v ? 'change' : undefined });
  };
  const [layers, setLayers] = useState<Record<string, LayerResult>>({});
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const [point, setPoint] = useState<[number, number] | null>(null);
  const [series, setSeries] = useState<SeriesResult | null>(null);
  const [seriesStatus, setSeriesStatus] = useState<Status>({ state: 'idle' });
  const pending = useRef(new Map<string, Promise<LayerResult>>());
  // Results are keyed by everything that changes the pixels, so an edit never shows stale data.
  const keyOf = (w: TimeWindow) => `${spec.station}|${spec.signal}|${spec.aoi.bbox.join(',')}|${w.start}/${w.end}${w.prefer ? `|${w.prefer}` : ''}`;

  useEffect(() => {
    setLayers({});
    pending.current.clear();
    setWinIdx(spec.windows.length - 1);
    setPoint(null);
    setSeries(null);
  }, [spec.station, spec.signal, spec.aoi.bbox, spec.windows]);

  // Which windows must be on screen now, then which to fetch quietly for the slider.
  const needed = swipe ? [spec.windows[0], spec.windows[1]] : [spec.windows[winIdx] ?? spec.windows[0]];
  const recipe = useMemo(() => ({ station: spec.station, signal: spec.signal }), [spec.station, spec.signal]);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const load = (w: TimeWindow, quiet: boolean) => {
      const k = keyOf(w);
      let p = pending.current.get(k);
      if (!p) {
        p = evaluateLayer(recipe, grid, w, {
          signal: ctrl.signal,
          onProgress: quiet ? undefined : (m) => !cancelled && setStatus({ state: 'loading', message: m }),
        });
        pending.current.set(k, p);
        p.catch(() => pending.current.delete(k));
      }
      return p.then((r) => {
        if (!cancelled) setLayers((prev) => ({ ...prev, [k]: r }));
        return r;
      });
    };
    const missing = needed.filter((w) => !layers[keyOf(w)]);
    if (!missing.length) {
      setStatus({ state: 'idle' });
    } else {
      setStatus({ state: 'loading', message: 'Finding data' });
      Promise.all(missing.map((w) => load(w, false)))
        .then(async () => {
          if (cancelled) return;
          setStatus({ state: 'idle' });
          if (slider) {
            for (const w of spec.windows) if (!cancelled && !pending.current.has(keyOf(w))) await load(w, true).catch(() => undefined);
          }
        })
        .catch((e: Error) => {
          if (!cancelled && e.name !== 'AbortError') setStatus({ state: 'error', message: e.message });
        });
    }
    return () => {
      cancelled = true;
      if (missing.length) ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needed.map(keyOf).join('|'), recipe, grid, attempt]);

  // An uploaded boundary masks everything outside it, so the map and its totals cover just that.
  const mask = useMemo(() => (spec.aoi.shape?.length ? shapeMask(grid, spec.aoi.shape) : null), [grid, spec.aoi.shape]);
  const maskedCache = useRef(new WeakMap<LayerResult, LayerResult>());
  const masked = (r: LayerResult | undefined): LayerResult | undefined => {
    if (!r || !mask || mask.length !== r.values.length) return r;
    let m = maskedCache.current.get(r);
    if (!m) {
      const cut = (a: Float32Array) => a.map((v, i) => (mask[i] ? v : NaN));
      m = { ...r, values: cut(r.values), rgb: r.rgb ? [cut(r.rgb[0]), cut(r.rgb[1]), cut(r.rgb[2])] : undefined };
      maskedCache.current.set(r, m);
    }
    return m;
  };
  const current = masked(layers[keyOf(needed[needed.length - 1])]);
  const before = swipe ? masked(layers[keyOf(spec.windows[0])]) : undefined;
  const changeValues = useMemo(() => (change && before && current ? differenceLayer(before, current) : undefined), [change, before, current]);
  // Every window shares one color range, so the swipe and the slider compare like with like.
  const domain = useMemo(() => sharedDomain(Object.values(layers).map((r) => masked(r)!)), [layers, mask]);
  const urlFor = (r: LayerResult | undefined, cv?: Float32Array) => (r ? toDataUrl(layerRgba(r, cv, domain), r.grid) : null);
  const url = useMemo(() => urlFor(current, changeValues), [current, changeValues, domain]);
  const beforeUrl = useMemo(() => (swipe && !change ? urlFor(before) : undefined), [swipe, change, before, domain]);
  const legend = useMemo(() => {
    const l = current ? legendFor(current, !!changeValues, domain) : null;
    if (!l || l.kind !== 'classes' || !current) return l;
    // Only list classes that actually appear on this map, most common first.
    const { shown, more } = presentClasses(current);
    return { ...l, classes: shown, more };
  }, [current, changeValues, domain]);
  const stats = useMemo(() => (current && has('region-stats') ? regionStats(changeValues ? { ...current, values: changeValues } : current) : null), [current, changeValues]);

  const runSeries = (pt: [number, number]) => {
    if (!chartable) return;
    setPoint(pt);
    setSeries(null);
    setSeriesStatus({ state: 'loading', message: 'Finding scenes' });
    const start = spec.history?.start ?? spec.windows[0].start.slice(0, 4) + '-01-01';
    const end = spec.history?.end ?? spec.windows[spec.windows.length - 1].end;
    pointSeries(spec.station, spec.signal, pt, start, end, { season: spec.windows[spec.windows.length - 1], onProgress: (m) => setSeriesStatus({ state: 'loading', message: m }) })
      .then((s) => {
        setSeries(s);
        setSeriesStatus({ state: 'idle' });
      })
      .catch((e: Error) => setSeriesStatus({ state: 'error', message: e.message }));
  };

  const ramp = rampFor(spec.signal, domain ?? current?.domain);
  // While data loads, the route's own stops show where it is: searching the catalog, then reading.
  const working = status.state === 'loading' ? (/^(Reading|Read )/.test(status.message) ? 1 : 0) : spec.methods.length;
  const stageOf = (i: number): 'done' | 'here' | 'ahead' => (i < working ? 'done' : i === working ? 'here' : 'ahead');
  const statRamp = changeValues && current ? changeRamp(current) : ramp;
  const fmt = (v: number) => formatValue(statRamp ?? {}, v);
  const sigName = SIGNAL_NAMES[spec.signal]?.short ?? spec.signal;
  const windowLabel = change ? `Change from ${spec.windows[0].label} to ${spec.windows[1].label}` : swipe ? `${spec.windows[0].label} and ${spec.windows[1].label}` : (spec.windows[winIdx] ?? spec.windows[0]).label;
  const captureRef = useRef<(() => Promise<HTMLCanvasElement[]>) | null>(null);
  const captureBaseRef = useRef<(() => Promise<{ canvas: HTMLCanvasElement; rect: { x: number; y: number; w: number; h: number } } | null>) | null>(null);
  const [hoverAt, setHoverAt] = useState<{ lonLat: [number, number]; side: 'before' | 'after' } | null>(null);
  const probe = useMemo(() => {
    if (!hoverAt) return null;
    const layer = swipe && !change && hoverAt.side === 'before' ? before : current;
    if (!layer) return null;
    const [lon, lat] = hoverAt.lonLat;
    const g = layer.grid;
    const [mx, my] = lonLatToMerc(lon, lat);
    const col = Math.floor(((mx - g.merc[0]) / (g.merc[2] - g.merc[0])) * g.width);
    const row = Math.floor(((g.merc[3] - my) / (g.merc[3] - g.merc[1])) * g.height);
    const where = `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(3)}°${lon >= 0 ? 'E' : 'W'}`;
    if (col < 0 || row < 0 || col >= g.width || row >= g.height) return null;
    const vals = changeValues && layer === current ? changeValues : layer.values;
    const v = vals[row * g.width + col];
    let text: string;
    if (layer.kind === 'rgb') text = 'True color';
    else if (Number.isNaN(v)) text = 'No clear view';
    else if (layer.kind === 'categorical') text = (LANDCOVER_CLASSES[layer.recipe.station] ?? []).find((c) => c.value === v)?.label ?? `Class ${v}`;
    else text = `${fmt(v)} ${changeValues ? 'change' : sigName}`;
    return (
      <>
        <strong>{text}</strong>
        <span>
          {where}
          {swipe && !change ? `, ${hoverAt.side === 'before' ? spec.windows[0].label : spec.windows[1].label}` : ''}
        </span>
      </>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverAt, current, before, changeValues]);
  if (apiRef)
    apiRef.current = {
      exportImage: async (format) => {
        const maps = (await captureRef.current?.()) ?? [];
        const lg: ExportLegend =
          legend && legend.kind === 'ramp'
            ? { kind: 'ramp', title: legend.title, ramp: legend.ramp }
            : legend && legend.kind === 'classes'
              ? { kind: 'classes', title: legend.title, classes: legend.classes.map((c) => ({ label: c.label, color: c.color })) }
              : { kind: 'none' };
        const labels = swipe && !change ? [spec.windows[0].label, spec.windows[1].label] : [change ? `Change, ${spec.windows[0].label} to ${spec.windows[1].label}` : (spec.windows[winIdx] ?? spec.windows[0]).label];
        return composeImage(spec, swipe && !change ? maps : maps.slice(-1), lg, labels, format);
      },
      exportGif:
        spec.windows.length > 1 && STATION_BY_ID[spec.station].temporal !== 'static'
          ? async (onFrame) => {
              const results = (await Promise.all(spec.windows.map((w) => layers[keyOf(w)] ?? pending.current.get(keyOf(w)) ?? evaluateLayer(recipe, grid, w)))).map((r) => masked(r)!);
              const dom = sharedDomain(results);
              const base = await captureBaseRef.current?.();
              if (!base) throw new Error('The map is still loading');
              const first = results[0];
              const lg: ExportLegend = first && legendFor(first, false, dom).kind === 'ramp' ? { kind: 'ramp', title: '', ramp: (legendFor(first, false, dom) as { ramp: NonNullable<typeof ramp> }).ramp } : { kind: 'none' };
              return composeGif(
                spec,
                base,
                results.map((r) => ({ rgba: layerRgba(r, undefined, dom), width: r.grid.width, height: r.grid.height })),
                spec.windows.map((w) => w.label),
                lg,
                (i) => onFrame?.(i + 1, results.length),
              );
            }
          : undefined,
    };

  const readerNotes = (spec.notes || spec.questions?.length) && mode !== 'builder' && (
    <div className="app-section reader-notes">
      {spec.notes && <p className="app-notes">{spec.notes}</p>}
      {spec.questions && spec.questions.some((q) => q.trim()) && (
        <>
          <h3>Questions to explore</h3>
          <ol className="app-questions">
            {spec.questions.filter((q) => q.trim()).map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
        </>
      )}
    </div>
  );

  const mapView = (
    <MapView
      bbox={spec.aoi.bbox}
      corners={corners}
      url={url}
      beforeUrl={swipe && !change ? (beforeUrl ?? null) : undefined}
      labels={swipe && !change ? [spec.windows[0].label, spec.windows[1].label] : undefined}
      marker={point}
      onClick={chartable ? runSeries : undefined}
      clickable={chartable}
      captureRef={captureRef}
      captureBaseRef={captureBaseRef}
      shape={spec.aoi.shape}
      cooperative={mode === 'embed'}
      padLeft={mode === 'embed' && typeof window !== 'undefined' && window.innerWidth >= 700 ? 320 : 0}
      onHover={(h) => setHoverAt(h ? { lonLat: h.lonLat, side: h.side } : null)}
      probe={probe}
    />
  );

  if (mode === 'embed') {
    return (
      <div className="embed" style={{ ['--route-color' as string]: color }}>
        <div className="map-wrap">{mapView}</div>
        <div className="embed-card">
          <h1 className="embed-title">{spec.title}</h1>
          <p className="embed-when">{windowLabel}</p>
          {canChange && (
            <div className="toggle toggle-small" role="group" aria-label="Show both dates or the change">
              <button aria-pressed={!change} onClick={() => setChange(false)}>
                Both dates
              </button>
              <button aria-pressed={change} onClick={() => setChange(true)}>
                Change
              </button>
            </div>
          )}
          {slider && (
            <input
              type="range"
              min={0}
              max={spec.windows.length - 1}
              value={winIdx}
              aria-label="Period"
              aria-valuetext={spec.windows[winIdx].label}
              onChange={(e) => setWinIdx(Number(e.target.value))}
            />
          )}
          {!legend && has('legend') && status.state !== 'error' && <div className="legend-slot" aria-hidden="true" />}
          {legend && legend.kind === 'ramp' && (
            <>
              <div className="legend-ramp" style={{ background: `linear-gradient(90deg, ${Array.from({ length: 11 }, (_, i) => rampColorAt(legend.ramp, i / 10)).join(', ')})` }} />
              <div className="legend-ends">
                <span>
                  {formatValue(legend.ramp, legend.ramp.domain[0])} {legend.ramp.low}
                </span>
                <span>
                  {legend.ramp.high} {formatValue(legend.ramp, legend.ramp.domain[1])}
                </span>
              </div>
            </>
          )}
          {legend && legend.kind === 'classes' && (
            <ul className="classes classes-compact">
              {legend.classes.slice(0, 6).map((c) => (
                <li key={c.value}>
                  <span className="swatch" style={{ background: c.color }} />
                  {c.label}
                </li>
              ))}
            </ul>
          )}
          {spec.notes && <p className="app-notes">{spec.notes}</p>}
        </div>
        {status.state === 'loading' && (
          <div className="loading embed-loading" role="status">
            {status.message}
          </div>
        )}
        <p className="embed-credit">
          {creditLine(spec)}{' '}
          <a href={openUrl} target="_blank" rel="noreferrer">
            Open in Interchange
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="app" style={{ ['--route-color' as string]: color }}>
      <section className="app-panel" aria-label="App controls">
        {actions}
        {mode === 'builder' && onTitle ? (
          <textarea className="app-title-input" aria-label="App title" rows={2} value={spec.title} onChange={(e) => onTitle(e.target.value.replace(/\n/g, ' '))} />
        ) : (
          <h1 className="app-title">{spec.title}</h1>
        )}
        <p className="app-question">“{spec.question}”</p>
        {readerNotes}
        {mode === 'builder' && onSpec && (
          <details className="app-section for-readers" open={!!(spec.notes || spec.questions?.length)}>
            <summary>
              <h3>Notes for readers</h3>
            </summary>
            <label className="field">
              What should people notice?
              <textarea rows={2} value={spec.notes ?? ''} placeholder="The flooded area spread east of the ship channel." onChange={(e) => onSpec({ ...spec, notes: e.target.value || undefined })} />
            </label>
            <label className="field">
              Questions to explore, one per line
              <textarea
                rows={3}
                value={(spec.questions ?? []).join('\n')}
                placeholder={'Where did the water reach first?\nWhich neighborhoods stayed dry?'}
                onChange={(e) => {
                  const qs = e.target.value.split('\n').map((q) => q.trimStart());
                  onSpec({ ...spec, questions: qs.some((q) => q.trim()) ? qs : undefined });
                }}
              />
            </label>
          </details>
        )}

        {slider && (
          <div className="app-section">
            <h3 id="period-label">Period</h3>
            <div className="slider-row">
              <strong>{spec.windows[winIdx].label}</strong>
              <input
                type="range"
                min={0}
                max={spec.windows.length - 1}
                step={1}
                value={winIdx}
                aria-labelledby="period-label"
                aria-valuetext={spec.windows[winIdx].label}
                onChange={(e) => setWinIdx(Number(e.target.value))}
              />
            </div>
            <div className="ticks" aria-hidden="true">
              <span>{spec.windows[0].label}</span>
              <span>{spec.windows[spec.windows.length - 1].label}</span>
            </div>
          </div>
        )}

        {canChange && (
          <div className="app-section">
            <h3>Show</h3>
            <div className="toggle" role="group" aria-label="Show both dates or the change">
              <button aria-pressed={!change} onClick={() => setChange(false)}>
                Both dates
              </button>
              <button aria-pressed={change} onClick={() => setChange(true)}>
                Change
              </button>
            </div>
          </div>
        )}

        {legend && legend.kind !== 'none' && has('legend') && (
          <div className="app-section">
            <h3>{legend.title}</h3>
            {legend.kind === 'ramp' ? (
              <>
                <div
                  className="legend-ramp"
                  style={{ background: `linear-gradient(90deg, ${Array.from({ length: 11 }, (_, i) => rampColorAt(legend.ramp, i / 10)).join(', ')})` }}
                />
                <div className="legend-ends">
                  <span>
                    {formatValue(legend.ramp, legend.ramp.domain[0])} {legend.ramp.low}
                  </span>
                  <span>
                    {legend.ramp.high} {formatValue(legend.ramp, legend.ramp.domain[1])}
                  </span>
                </div>
              </>
            ) : (
              <>
                <ul className="classes">
                  {legend.classes.map((c) => (
                    <li key={c.value}>
                      <span className="swatch" style={{ background: c.color }} />
                      {c.label}
                      <span />
                    </li>
                  ))}
                </ul>
                {'more' in legend && legend.more ? <p className="hint">and {legend.more} rarer {legend.more === 1 ? 'class' : 'classes'}</p> : null}
              </>
            )}
          </div>
        )}

        {stats && (
          <div className="app-section" data-testid="stats">
            <h3>Across the whole map{swipe && !change ? `, ${spec.windows[1].label}` : ''}</h3>
            {stats.kind === 'continuous' ? (
              <>
                <div className="stat-big">
                  {fmt(stats.median)} <span style={{ fontSize: 15, fontWeight: 600 }}>median {changeValues ? 'change' : sigName}</span>
                </div>
                <p className="hint">
                  Middle 80% of pixels: {fmt(stats.p10)} to {fmt(stats.p90)}. {Math.round(stats.coverage * 100)}% of the area had a clear view.
                </p>
              </>
            ) : (
              <ul className="classes">
                {stats.rows.slice(0, 6).map((r) => (
                  <li key={r.entry.value}>
                    <span className="swatch" style={{ background: r.entry.color }} />
                    {r.entry.label}
                    <span>
                      {Math.round(r.share * 100)}% ({r.km2 < 10 ? r.km2.toFixed(1) : Math.round(r.km2)} km²)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {chartable && (
          <div className="app-section">
            <h3>History at a point</h3>
            {!point && <p className="hint">Click anywhere on the map to chart {sigName} there over time.</p>}
            {seriesStatus.state === 'loading' && (
              <div>
                <span className="hint">{seriesStatus.message}</span>
                <div className="train-track" aria-hidden="true">
                  <div className="train" />
                </div>
              </div>
            )}
            {seriesStatus.state === 'error' && <p className="error">Couldn't read the history: {seriesStatus.message}. Click again to retry.</p>}
            {series && series.points.length > 0 && ramp && (
              <>
                <HistoryChart points={series.points} domain={ramp.domain} windows={spec.windows} units={sigName} color={color} format={ramp.format} />
                <p className="hint">
                  {series.points.length} usable readings out of {series.looked} looked at, at {point![1].toFixed(4)}, {point![0].toFixed(4)}.
                </p>
              </>
            )}
            {series && series.points.length === 0 && <p className="hint">No clear looks at that spot in this range. Try another point or widen the dates.</p>}
          </div>
        )}

        {has('download') && current && (
          <div className="app-section">
            <h3>Download</h3>
            <div className="route-actions" style={{ marginTop: 0 }}>
              {current.kind !== 'rgb' && (
                <button
                  className="btn"
                  onClick={() =>
                    download(
                      `${spec.aoi.name.replace(/\W+/g, '-').toLowerCase()}-${spec.signal}-${(changeValues ? 'change' : windowLabel).replace(/\W+/g, '-').toLowerCase()}.tif`,
                      layerGeoTiff(changeValues ?? current.values, current.grid),
                      'image/tiff',
                    )
                  }
                >
                  GeoTIFF of this map
                </button>
              )}
              {current.kind === 'rgb' && (
                <button
                  className="btn"
                  onClick={() => {
                    const url = urlFor(current);
                    if (!url) return;
                    const bin = atob(url.slice(url.indexOf(',') + 1));
                    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
                    download(`${spec.aoi.name.replace(/\W+/g, '-').toLowerCase()}-true-color-${windowLabel.replace(/\W+/g, '-').toLowerCase()}.png`, bytes, 'image/png');
                  }}
                >
                  Image of this map (PNG)
                </button>
              )}
              {stats && stats.kind === 'classes' && (
                <button
                  className="btn"
                  onClick={() =>
                    download(
                      `${spec.aoi.name.replace(/\W+/g, '-').toLowerCase()}-area-totals.csv`,
                      ['class,share_percent,area_km2', ...stats.rows.map((r) => `"${r.entry.label}",${(r.share * 100).toFixed(1)},${r.km2.toFixed(2)}`)].join('\n'),
                      'text/csv',
                    )
                  }
                >
                  CSV of the area totals
                </button>
              )}
              {series && series.points.length > 0 && point && (
                <button className="btn" onClick={() => download(`${spec.signal}-history.csv`, seriesCsv(series.points, spec.signal, point), 'text/csv')}>
                  CSV of the history
                </button>
              )}
            </div>
          </div>
        )}

        <div className="app-section">
          <h3>How this map was made</h3>
          <ol className="made" data-loading={status.state === 'loading' || undefined} aria-label={status.state === 'loading' ? `Working: ${status.message}` : undefined}>
            <li data-stop={stageOf(-1)}>
              <strong>{station.name}</strong>
              {station.specs.resolution}, {station.specs.license}. {station.access.stac ? `STAC ${station.access.stac}` : ''}
            </li>
            {spec.methods.map((m, i) => (
              <li key={m} data-stop={stageOf(i)}>
                <strong>{m === 'index' ? `${sigName}: ${INDICES[spec.signal]?.formula ?? ''}` : METHOD_BY_ID[m].name}</strong>
                {m === 'find-scenes' ? spec.windows.map((w) => w.label).join(', ') : METHOD_BY_ID[m].does}
              </li>
            ))}
            <li>
              <strong>Limits</strong>
              {station.badAt.join('. ')}.
            </li>
          </ol>
          {current && current.scenes.length > 0 && (
            <p className="hint">
              This view uses {current.scenes.length} {current.scenes.length === 1 ? 'acquisition' : 'acquisitions'}: {current.scenes.slice(0, 4).map((s) => s.date).join(', ')}
              {current.scenes.length > 4 ? ', and more' : ''}. Pixels are {pixelSizeLabel(current.grid)} on this preview.
            </p>
          )}
          {mode === 'published' && onFork && (
            <div className="route-actions">
              <button className="btn btn-primary" onClick={onFork}>
                Fork this route
              </button>
            </div>
          )}
          <p className="credit-line">
            <span>{creditLine(spec)}</span> <CopyButton text={creditLine(spec)} label="Copy the credit line" primary={false} />
          </p>
          <p className="made-by">
            Made with <a href={mode === 'published' ? './' : undefined}>Interchange</a> on {spec.createdAt}. Data read live from open catalogs; nothing stored on a server.
          </p>
        </div>
      </section>

      <div className="map-wrap">
        {mapView}
        {status.state === 'loading' && (
          <div className="loading" role="status">
            {status.message}
            <div className="train-track" aria-hidden="true">
              <div className="train" />
            </div>
          </div>
        )}
        {status.state === 'error' && (
          <div className="loading error" role="alert">
            Couldn't load this layer: {status.message}.{' '}
            <button className="btn-link" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        )}
        {status.state === 'idle' && current?.note && (
          <div className="loading" role="status">
            {current.note}
          </div>
        )}
      </div>
    </div>
  );
}
