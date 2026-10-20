import { useEffect, useMemo, useRef, useState } from 'react';
import { compileRoute, decodeSpec, encodeSpec, routeFromSpec, type AppSpec } from '../compiler/spec';
import { earthEngineScript } from '../compiler/export-ee';
import { SIGNAL_NAMES, STATION_BY_ID } from '../network/network';
import { checkRoute } from '../network/typecheck';
import type { Route } from '../network/types';
import { THEME_WORDS, parseGoal, type Intent } from '../planner/intent';
import { parseGoalWithClaude } from '../planner/llm';
import { geocodeFirst, nominatim } from '../planner/places';
import { planRoutes, type Place, type PlanResult } from '../planner/plan';
import { AppRuntime } from './AppRuntime';
import { BrandMark } from './BrandMark';
import { Dialog } from './Dialog';
import { Dossier } from './Dossier';
import { MapView } from './MapView';
import { MapKey, NetworkMap } from './NetworkMap';
import { RouteStrip, type StopKey } from './RouteStrip';
import { StopEditor } from './StopEditor';
import { stationColor } from './colors';
import { JourneyNav, type Step } from './JourneyNav';
import { PlacePicker } from './PlacePicker';
import { ReadBackSign } from './ReadBackSign';
import { useLiveIntent, whenWords } from './readback';

type View = Step;
type Modal = { kind: 'ee'; code: string; title: string } | { kind: 'share'; url: string } | { kind: 'key' } | { kind: 'place' } | null;

/** Starting points, one per kind of question, so the first screen shows the range. */
export const EXAMPLES = [
  'Show which fields in Tompkins County, NY had a cover crop each spring since 2018, and click a field for its history',
  'Compare greenness in Fresno County fields, summer 2019 vs summer 2025',
  'sea surface temperature in the north atlantic since 1999',
  'What crops grew around Ames, Iowa in 2021',
  'Map flooding in Houston before and after August 2017',
  'Snow cover in the Sierra Nevada each winter since 2018',
  'Urban heat island in Phoenix, summer 2025',
  'How much of Austin, Texas is built up?',
];


function readingOf(intent: Intent, plan: PlanResult): string {
  const where = plan.place ? ` in ${plan.place.name}` : '';
  return `Looking for ${THEME_WORDS[intent.theme]}${where}, ${whenWords(intent)}.`;
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

export function Builder({ forkToken, initialGoal, initialStation }: { forkToken: string | null; initialGoal?: string | null; initialStation?: string | null }) {
  const [view, setView] = useState<View>('ask');
  const [goal, setGoal] = useState(initialGoal ?? '');
  const [pinned, setPinned] = useState<string | null>(initialStation && STATION_BY_ID[initialStation] ? initialStation : null);
  /** A place chosen on the map, used instead of the one in the sentence. */
  const [pinnedPlace, setPinnedPlace] = useState<Place | null>(null);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [sel, setSel] = useState(0);
  const [stop, setStop] = useState<StopKey | null>(null);
  const [spec, setSpec] = useState<AppSpec | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** The goal to try again when the last plan failed to find its place. */
  const [retryGoal, setRetryGoal] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [dossier, setDossier] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState(loadKey);
  const [planSeq, setPlanSeq] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const goalRef = useRef<HTMLTextAreaElement>(null);
  const live = useLiveIntent(goal, pinnedPlace);
  // A new place phrase means the map pick no longer applies.
  const phrase = live.intent?.place ?? '';
  const pickedFor = useRef('');
  useEffect(() => {
    if (pinnedPlace && phrase !== pickedFor.current) setPinnedPlace(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrase]);

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
    history.replaceState(null, '', `${location.pathname}${location.search}#build`);
  }, [forkToken]);

  // Arriving from the landing page with a question: plan it straight away.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !initialGoal) return;
    started.current = true;
    runPlan(initialGoal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGoal]);

  const runPlan = async (text: string, chosenPlace: Place | null = pinnedPlace) => {
    const t = text.trim();
    if (!t) {
      goalRef.current?.focus();
      return;
    }
    setGoal(t);
    setBusy(true);
    setErr(null);
    setRetryGoal(null);
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
      const phrases = [intent.place, ...intent.places].filter((x): x is string => !!x);
      // The read-back already found it while typing: plan on the same place it showed.
      const previewed = live.status.state === 'found' && t === goal.trim() ? live.status.place : null;
      const found = chosenPlace ? { place: chosenPlace } : previewed ? { place: previewed } : phrases.length ? await geocodeFirst(nominatim, phrases) : null;
      const place = found?.place ?? null;
      if (phrases.length && !place) {
        // Stay where we are, and offer the map: the place may just be spelled in a way the lookup doesn't know.
        setErr(`Couldn't find "${intent.place}" on the map. Pick it on the map, or add a state or country, like "Tompkins County, NY".`);
        setRetryGoal(t);
        return;
      }
      setDossier(null);
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
    if (!route || building) return;
    // Acknowledge the press this frame; compile and mount the app on the next.
    setBuilding(true);
    requestAnimationFrame(() =>
      setTimeout(() => {
        const { spec: s, errors } = compileRoute(route, goal || route.title);
        setBuilding(false);
        if (!s) {
          setErr(errors[0]);
          return;
        }
        setSpec(s);
        setView('app');
      }, 0),
    );
  };

  const errorNote = err && (
    <div className="error" role="alert">
      {err}
      {retryGoal && (
        <>
          {' '}
          <button className="btn-link" onClick={() => setModal({ kind: 'place' })}>
            Pick it on the map
          </button>{' '}
          <button className="btn-link" onClick={() => runPlan(retryGoal)} disabled={busy}>
            {busy ? 'Trying again' : 'Try again'}
          </button>
        </>
      )}
    </div>
  );

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
      <header className="band builder-band">
        <a className="brand" href="#" aria-label="Interchange, about the project">
          <BrandMark />
          <span>Interchange</span>
        </a>
        <JourneyNav current={view} reached={{ ask: true, route: !!plan, app: !!spec }} onGo={setView} />
        <button className="btn btn-quiet reader-btn" type="button" onClick={() => setModal({ kind: 'key' })}>
          {apiKey ? 'Reading with Claude' : 'Reader: built-in'}
        </button>
      </header>

      <main className="view">
        {view === 'ask' && (
          <div className="ask">
            <section className="ask-top" aria-labelledby="ask-title">
              <h1 id="ask-title">What do you want to see, and where?</h1>
              <form
                className="ask-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  runPlan(goal);
                }}
              >
                <label className="sr-only" htmlFor="goal">
                  Your question
                </label>
                <textarea
                  id="goal"
                  ref={goalRef}
                  rows={2}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value.replace(/\n/g, ' '))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      runPlan(goal);
                    }
                  }}
                  placeholder={pinned ? `Riding ${STATION_BY_ID[pinned].name}. What do you want to see, and where?` : 'For example: snow cover in the Alps, winter 2020 vs 2024'}
                  autoComplete="off"
                  autoFocus={!initialGoal}
                />
                <button className="btn btn-primary" type="submit" disabled={busy} aria-busy={busy}>
                  {busy ? 'Planning' : 'Plan the route'}
                </button>
              </form>
              <ReadBackSign back={live.back} status={live.status} onPickPlace={() => setModal({ kind: 'place' })} />
              {pinned && (
                <p className="hint">
                  Riding {STATION_BY_ID[pinned].name}.{' '}
                  <button className="btn-link" onClick={() => setPinned(null)}>
                    Let the planner choose
                  </button>
                </p>
              )}
              {err && <div className="ask-error">{errorNote}</div>}
              <div className="examples" aria-label="Example questions">
                <span className="examples-label">Or start from one of these</span>
                {EXAMPLES.map((ex) => (
                  <button key={ex} className="example" type="button" onClick={() => runPlan(ex, null)} disabled={busy}>
                    {ex}
                  </button>
                ))}
              </div>
            </section>
            <section className="ask-network" aria-labelledby="net-title">
              <div className="ask-network-head">
                <h2 id="net-title">The network</h2>
                <p>
                  {live.back?.stations.length
                    ? 'The stations your question would ride are ringed. Tap any station to see what it measures and what it is bad at.'
                    : 'Every dataset Interchange knows, on the line for the part of the Earth it watches. Tap a station to see what it measures and what it is bad at.'}
                </p>
              </div>
              <div className="network-scroll">
                <NetworkMap selected={dossier} highlight={live.back?.stations ?? []} onSelect={setDossier} />
              </div>
              <MapKey />
            </section>
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
                <p className="route-question">
                  “{plan.intent.text}”{' '}
                  <button className="btn-link" onClick={() => setView('ask')}>
                    Edit
                  </button>
                </p>
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
                {errorNote}
                <ol className="routes">
                  {routes.map((r, i) => {
                    const st = STATION_BY_ID[r.station];
                    const selected = i === sel;
                    const rc = checkRoute(r);
                    return (
                      <li key={`${planSeq}-${i}`} className="route" data-selected={selected} style={{ ['--route-color' as string]: stationColor(st) }}>
                        <div className="route-head">
                          <h3 className="route-title">
                            {selected ? (
                              r.title
                            ) : (
                              <button
                                onClick={() => {
                                  setSel(i);
                                  setStop(null);
                                }}
                                aria-expanded={false}
                              >
                                {r.title}
                              </button>
                            )}
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
                              <button className="btn btn-primary" onClick={build} disabled={!check?.ok || !plan.place} aria-busy={building}>
                                {building ? 'Building' : 'Build this app'}
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
                <div className="pane-inner no-place">
                  <h3>Where should it look?</h3>
                  <p className="lede">The question doesn't name a place yet. Add one to the question, or pick it on the map.</p>
                  <div className="route-actions">
                    <button className="btn btn-primary" onClick={() => setModal({ kind: 'place' })}>
                      Pick it on the map
                    </button>
                    <button className="btn" onClick={() => setView('ask')}>
                      Edit the question
                    </button>
                  </div>
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
        <Dialog labelledBy="modal-title" onClose={() => setModal(null)} wide={modal.kind === 'place' || modal.kind === 'ee'}>
          {(close) => (
            <>
              {modal.kind === 'share' && (
                <>
                  <h2 id="modal-title">Your app is live</h2>
                  <p>The link holds the whole app, so it opens for anyone with no login and nothing stored on a server. It was copied to your clipboard.</p>
                  <pre>{modal.url}</pre>
                  <div className="route-actions">
                    <a className="btn btn-primary" href={modal.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                      Open the app
                    </a>
                    <button className="btn" onClick={close} autoFocus>
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
                    <CopyButton text={modal.code} />
                    <button className="btn" onClick={close} autoFocus>
                      Done
                    </button>
                  </div>
                </>
              )}
              {modal.kind === 'place' && (
                <PlacePicker
                  initial={live.intent?.place ?? ''}
                  onCancel={close}
                  onPick={(p) => {
                    pickedFor.current = live.intent?.place ?? '';
                    setPinnedPlace(p);
                    close();
                    runPlan(goal || retryGoal || '', p);
                  }}
                />
              )}
              {modal.kind === 'key' && (
                <KeyForm
                  current={apiKey}
                  onSave={(k) => {
                    setApiKey(k);
                    saveKey(k);
                    close();
                  }}
                  onCancel={close}
                />
              )}
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <button
      className="btn btn-primary"
      onClick={() =>
        navigator.clipboard
          .writeText(text)
          .then(() => setState('copied'))
          .catch(() => setState('failed'))
      }
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy blocked: select the text' : 'Copy script'}
    </button>
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
