import { useEffect, useMemo, useRef, useState } from 'react';
import { compileRoute, decodeSpec, encodeSpec, routeFromSpec, type AppSpec } from '../compiler/spec';
import { earthEngineScript } from '../compiler/export-ee';
import { SIGNAL_NAMES, STATION_BY_ID } from '../network/network';
import { checkRoute } from '../network/typecheck';
import type { Route } from '../network/types';
import { parseGoal, type Intent, type Theme } from '../planner/intent';
import { parseGoalWithClaude } from '../planner/llm';
import { nominatim } from '../planner/places';
import { planRoutes, type PlanResult } from '../planner/plan';
import { AppRuntime } from './AppRuntime';
import { BrandMark } from './BrandMark';
import { Dossier } from './Dossier';
import { MapView } from './MapView';
import { MapKey, NetworkMap } from './NetworkMap';
import { RouteStrip, type StopKey } from './RouteStrip';
import { StopEditor } from './StopEditor';
import { stationColor } from './colors';

type View = 'network' | 'route' | 'app';
type Modal = { kind: 'ee'; code: string; title: string } | { kind: 'share'; url: string } | { kind: 'key' } | null;

export const EXAMPLES = [
  'Show which fields in Tompkins County, NY had a cover crop each spring since 2018, and click a field for its history',
  'Compare greenness in Fresno County, California in summer 2019 vs summer 2025',
  'Map flooding in Houston before and after August 2017',
  'Burn severity in Paradise, California before and after November 2018',
  'How much of Austin, Texas is built up?',
  'Lake Mead water each year from 2015 to 2024',
];

const THEME_WORDS: Record<Theme, string> = {
  vegetation: 'greenness',
  'cover-crop': 'winter cover on fields',
  water: 'surface water',
  flood: 'flooding',
  fire: 'burn severity',
  snow: 'snow',
  built: 'built-up land',
  landcover: 'land cover',
  terrain: 'terrain',
  moisture: 'plant moisture',
  imagery: 'what the ground looks like',
  'forest-loss': 'forest loss',
  air: 'air quality',
  heat: 'surface heat',
  rain: 'rainfall',
  'night-lights': 'night lights',
  'soil-moisture': 'soil moisture',
  groundwater: 'groundwater',
  'canopy-height': 'canopy height',
  ocean: 'ocean heat',
};

function readingOf(intent: Intent, plan: PlanResult): string {
  const t = intent.time;
  const when =
    t.kind === 'compare'
      ? `${t.windows[0].label} against ${t.windows[1].label}`
      : t.kind === 'yearly'
        ? `${t.windows[0].label} to ${t.windows[t.windows.length - 1].label}, one map per year`
        : t.kind === 'history'
          ? `history from ${t.range.start.slice(0, 4)}, mapped for ${t.window.label}`
          : t.window.label;
  const where = plan.place ? ` in ${plan.place.name}` : '';
  return `Looking for ${THEME_WORDS[intent.theme]}${where}, ${when}.`;
}

const KEY_STORE = 'interchange.anthropicKey';
function loadKey(): string {
  try {
    return localStorage.getItem(KEY_STORE) ?? '';
  } catch {
    return '';
  }
}
function saveKey(k: string) {
  try {
    if (k) localStorage.setItem(KEY_STORE, k);
    else localStorage.removeItem(KEY_STORE);
  } catch {
    /* storage blocked: the key lives for this tab only */
  }
}

export function Builder({ forkToken }: { forkToken: string | null }) {
  const [view, setView] = useState<View>('network');
  const [goal, setGoal] = useState('');
  const [pinned, setPinned] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [sel, setSel] = useState(0);
  const [stop, setStop] = useState<StopKey | null>(null);
  const [spec, setSpec] = useState<AppSpec | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dossier, setDossier] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState(loadKey);
  const [planSeq, setPlanSeq] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const goalRef = useRef<HTMLInputElement>(null);

  // A forked app arrives as its own route, ready to edit.
  useEffect(() => {
    if (!forkToken) return;
    const s = decodeSpec(forkToken);
    if (!s) {
      setErr('That fork link is damaged or from a newer version.');
      return;
    }
    const intent = parseGoal(s.question);
    const route = routeFromSpec(s);
    const p: PlanResult = { intent, place: { name: s.aoi.name, bbox: s.aoi.bbox }, routes: [route], skipped: [], warnings: [] };
    setGoal(s.question);
    setPlan(p);
    setRoutes([route]);
    setSel(0);
    setView('route');
    setPlanSeq((n) => n + 1);
    history.replaceState(null, '', location.pathname + location.search);
  }, [forkToken]);

  const runPlan = async (text: string) => {
    const t = text.trim();
    if (!t) {
      goalRef.current?.focus();
      return;
    }
    setGoal(t);
    setBusy(true);
    setErr(null);
    setDossier(null);
    try {
      let intent: Intent;
      if (apiKey) {
        try {
          intent = await parseGoalWithClaude(t, apiKey);
        } catch (e) {
          setErr(`Claude couldn't read the goal (${(e as Error).message}), so the built-in reader was used.`);
          intent = parseGoal(t);
        }
      } else intent = parseGoal(t);
      if (pinned) intent = { ...intent, station: pinned };
      const place = intent.place ? await nominatim(intent.place) : null;
      if (intent.place && !place) setErr(`Couldn't find "${intent.place}" on the map. Add a state or country, like "Tompkins County, NY".`);
      const p = planRoutes(intent, place);
      setPlan(p);
      setRoutes(p.routes);
      setSel(0);
      setStop(null);
      setView('route');
      setPlanSeq((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const route = routes[sel];
  const check = useMemo(() => (route ? checkRoute(route) : null), [route]);

  const build = () => {
    if (!route) return;
    const { spec: s, errors } = compileRoute(route, goal || route.title);
    if (!s) {
      setErr(errors[0]);
      return;
    }
    setSpec(s);
    setView('app');
  };

  const publish = async () => {
    if (!spec) return;
    const url = `${location.origin}${location.pathname}#app=${encodeSpec(spec)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard blocked: the dialog still shows the link */
    }
    setModal({ kind: 'share', url });
  };

  const updateRoute = (r: Route) => setRoutes((rs) => rs.map((x, i) => (i === sel ? r : x)));

  return (
    <div className="shell">
      <header className="band">
        <button className="brand" onClick={() => setView('network')} aria-label="Interchange, back to the network map">
          <BrandMark />
          <span>Interchange</span>
        </button>
        <nav className="nav" aria-label="Views">
          <button aria-current={view === 'network' ? 'page' : undefined} onClick={() => setView('network')}>
            Network
          </button>
          <button aria-current={view === 'route' ? 'page' : undefined} onClick={() => setView('route')} disabled={!plan}>
            Route
          </button>
          <button aria-current={view === 'app' ? 'page' : undefined} onClick={() => setView('app')} disabled={!spec}>
            App
          </button>
        </nav>
        <form
          className="goal"
          onSubmit={(e) => {
            e.preventDefault();
            runPlan(goal);
          }}
        >
          <label className="sr-only" htmlFor="goal">
            What do you want to see?
          </label>
          <input
            id="goal"
            ref={goalRef}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder={pinned ? `Using ${STATION_BY_ID[pinned].name}. What do you want to see, and where?` : 'What do you want to see, and where?'}
            autoComplete="off"
          />
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Planning' : 'Plan'}
          </button>
          <button className="btn btn-quiet" type="button" onClick={() => setModal({ kind: 'key' })} title="Use Claude to read goals">
            {apiKey ? 'Claude on' : 'Claude'}
          </button>
        </form>
      </header>

      <main className="view">
        {view === 'network' && (
          <div className="network">
            <div className="network-head">
              <h1>Every dataset is a station. Your project is a route.</h1>
              <p>
                Type what you want to see and where. Interchange draws the line from the right satellites to a live map app, and shows why each stop was picked.
                Or tap a station to see what it measures and what it's bad at.
              </p>
            </div>
            <div className="examples" aria-label="Example goals">
              {EXAMPLES.map((ex) => (
                <button key={ex} className="example" onClick={() => runPlan(ex)} disabled={busy}>
                  {ex}
                </button>
              ))}
            </div>
            {err && <p className="error" style={{ margin: '12px 24px 0' }}>{err}</p>}
            <div style={{ padding: '8px 12px 0', overflowX: 'auto' }}>
              <NetworkMap selected={dossier} highlight={route ? [route.station] : []} onSelect={setDossier} />
            </div>
            <MapKey />
            {dossier && (
              <Dossier
                id={dossier}
                onClose={() => setDossier(null)}
                onPlan={(id) => {
                  setPinned(id);
                  setDossier(null);
                  goalRef.current?.focus();
                }}
              />
            )}
          </div>
        )}

        {view === 'route' && plan && (
          <div className="split">
            <section className="pane" aria-label="Candidate routes">
              <div className="pane-inner">
                <h2>{routes.length ? `${routes.length} route${routes.length > 1 ? 's' : ''} found` : 'No live route yet'}</h2>
                <p className="lede">{readingOf(plan.intent, plan)}</p>
                {pinned && (
                  <p className="hint">
                    Starting from {STATION_BY_ID[pinned].name}.{' '}
                    <button className="btn-link" onClick={() => setPinned(null)}>
                      Let the planner choose
                    </button>
                  </p>
                )}
                {plan.warnings.map((w) => (
                  <p className="warning" key={w}>
                    {w}
                  </p>
                ))}
                {err && <p className="error">{err}</p>}
                <ol className="routes">
                  {routes.map((r, i) => {
                    const st = STATION_BY_ID[r.station];
                    const selected = i === sel;
                    const rc = checkRoute(r);
                    return (
                      <li key={`${planSeq}-${i}`} className="route" data-selected={selected} style={{ ['--route-color' as string]: stationColor(st) }}>
                        <div className="route-head">
                          <h3 className="route-title">
                            <button
                              onClick={() => {
                                setSel(i);
                                setStop(null);
                              }}
                              aria-expanded={selected}
                            >
                              {r.title}
                            </button>
                          </h3>
                          {i === 0 && <span className="hint" style={{ whiteSpace: 'nowrap' }}>Best fit</span>}
                        </div>
                        {r.when && <p className="route-when">{r.when}</p>}
                        <p className="route-why">{r.why}</p>
                        {selected && (
                          <>
                            <RouteStrip route={r} active={stop} onStop={(k) => setStop(stop === k ? null : k)} animate={planSeq > 0} />
                            <p className="hint">Tap a stop to change it.</p>
                            {stop && <StopEditor route={r} stop={stop} onChange={updateRoute} />}
                            {!rc.ok && (
                              <div className="error" role="alert">
                                {rc.errors.map((e) => (
                                  <div key={e}>{e}</div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                        <dl className="tradeoffs">
                          {r.tradeoffs.map((t) => (
                            <div key={t.label} style={{ display: 'contents' }}>
                              <dt>{t.label}</dt>
                              <dd className={t.tone === 'good' ? 'tone-good' : t.tone === 'bad' ? 'tone-bad' : undefined}>
                                <span className="tone-mark" aria-hidden="true">
                                  {t.tone === 'good' ? '+' : t.tone === 'bad' ? '−' : ''}
                                </span>
                                {t.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        {r.warnings.length > 0 && (
                          <ul className="notes">
                            {r.warnings.map((w) => (
                              <li key={w}>{w}</li>
                            ))}
                          </ul>
                        )}
                        {selected && (
                          <div className="route-actions">
                            {r.runs === 'live' && (
                              <button className="btn btn-primary" onClick={build} disabled={!check?.ok || !plan.place}>
                                Build this app
                              </button>
                            )}
                            <button className="btn" onClick={() => setModal({ kind: 'ee', code: earthEngineScript(r), title: r.title })}>
                              {r.runs === 'live' ? 'Earth Engine version' : 'Export to Earth Engine'}
                            </button>
                            <button className="btn-link" onClick={() => setDossier(r.station)}>
                              About {st.name}
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
                {plan.skipped.length > 0 && (
                  <div className="skipped">
                    <strong>Considered and left out</strong>
                    <ul className="notes">
                      {plan.skipped.map((s) => (
                        <li key={s.station}>{s.reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
            <div style={{ position: 'relative', minHeight: 360 }}>
              {plan.place ? (
                <MapView bbox={route?.aoi.bbox ?? plan.place.bbox} corners={null} url={null} marker={null} />
              ) : (
                <div className="pane-inner">
                  <p className="lede">Add a place to the goal to see it here.</p>
                </div>
              )}
              {dossier && <Dossier id={dossier} onClose={() => setDossier(null)} onPlan={(id) => { setPinned(id); setDossier(null); goalRef.current?.focus(); }} />}
            </div>
          </div>
        )}

        {view === 'app' && spec && (
          <AppRuntime
            spec={spec}
            mode="builder"
            onTitle={(title) => setSpec({ ...spec, title })}
            actions={
              <div className="route-actions" style={{ marginTop: 0, marginBottom: 14 }}>
                <button className="btn btn-primary" onClick={publish}>
                  Publish link
                </button>
                <button className="btn" onClick={() => setView('route')}>
                  Edit route
                </button>
                {route && (
                  <button className="btn" onClick={() => setModal({ kind: 'ee', code: earthEngineScript(route), title: route.title })}>
                    Earth Engine version
                  </button>
                )}
              </div>
            }
          />
        )}
      </main>

      {modal && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-card">
            {modal.kind === 'share' && (
              <>
                <h2 id="modal-title">Your app is live</h2>
                <p>The link holds the whole app, so it opens for anyone with no login and nothing stored on a server. It was copied to your clipboard.</p>
                <pre>{modal.url}</pre>
                <div className="route-actions">
                  <a className="btn btn-primary" href={modal.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                    Open the app
                  </a>
                  <button className="btn" onClick={() => setModal(null)} autoFocus>
                    Done
                  </button>
                </div>
              </>
            )}
            {modal.kind === 'ee' && (
              <>
                <h2 id="modal-title">Earth Engine version</h2>
                <p>Paste into the Earth Engine Code Editor and press Run. To publish it there, use Apps, then New App, with your own Earth Engine project.</p>
                <pre>{modal.code}</pre>
                <div className="route-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => navigator.clipboard?.writeText(modal.code).catch(() => undefined)}
                  >
                    Copy script
                  </button>
                  <button className="btn" onClick={() => setModal(null)} autoFocus>
                    Done
                  </button>
                </div>
              </>
            )}
            {modal.kind === 'key' && (
              <KeyForm
                current={apiKey}
                onSave={(k) => {
                  setApiKey(k);
                  saveKey(k);
                  setModal(null);
                }}
                onCancel={() => setModal(null)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function KeyForm({ current, onSave, onCancel }: { current: string; onSave: (k: string) => void; onCancel: () => void }) {
  const [k, setK] = useState(current);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(k.trim());
      }}
    >
      <h2 id="modal-title">Read goals with Claude</h2>
      <p>
        The built-in reader handles plain sentences. With an Anthropic API key, Claude reads looser ones too. One small request per plan, sent from this
        browser straight to api.anthropic.com. The key stays in this browser.
      </p>
      <label className="field">
        API key
        <input type="password" value={k} onChange={(e) => setK(e.target.value)} placeholder="sk-ant-..." autoFocus />
      </label>
      <div className="route-actions">
        <button className="btn btn-primary" type="submit">
          {k ? 'Use this key' : 'Use the built-in reader'}
        </button>
        {current && (
          <button className="btn" type="button" onClick={() => onSave('')}>
            Forget key
          </button>
        )}
        <button className="btn-link" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function signalWords(signal: string): string {
  return SIGNAL_NAMES[signal]?.long ?? signal;
}
