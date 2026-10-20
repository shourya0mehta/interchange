import { useEffect, useMemo, useRef, useState } from 'react';
import { compileRoute, decodeSpec, routeFromSpec, type AppSpec } from '../compiler/spec';
import { earthEngineScript } from '../compiler/export-ee';
import { STATION_BY_ID } from '../network/network';
import type { Route } from '../network/types';
import { THEME_WORDS, parseGoal, placeCandidates, type Intent } from '../planner/intent';
import { parseGoalWithClaude } from '../planner/llm';
import { geocodeFirst, nominatim } from '../planner/places';
import { planRoutes, type Place } from '../planner/plan';
import { refine } from '../planner/refine';
import { AppRuntime, type AppApi } from './AppRuntime';
import { BrandMark } from './BrandMark';
import { Dialog } from './Dialog';
import { Dossier } from './Dossier';
import { PlacePicker } from './PlacePicker';
import { RouteStrip, type StopKey } from './RouteStrip';
import { StopEditor } from './StopEditor';
import { ShareDialog } from './ShareDialog';
import { AskBox } from './AskBox';
import { stationColor } from './colors';
import { shortName } from './NetworkMap';
import { whenWords } from './readback';
import { KeyForm, CopyButton, loadKey, saveKey } from './keys';
import { daysAgo, latestLook } from '../runtime/latest';
import { forgetMaps, loadRecent, rememberMap } from './recent';
import { useSlashFocus } from './useSlash';
import { Swap } from './Swap';
import { JourneyEditor } from './JourneyEditor';
import type { JourneyStop } from '../compiler/journey';

/** What one build looked like, so any earlier version can be brought back. */
interface Version {
  intent: Intent;
  place: Place;
  routes: Route[];
  routeIdx: number;
  spec: AppSpec | null;
}

interface Step {
  label: string;
  value: string;
  note?: string;
}

type Turn =
  | { id: number; who: 'you'; text: string }
  | { id: number; who: 'ic'; kind: 'built'; version: number; steps: Step[]; changes: string[]; warnings: string[]; color: string; live: boolean }
  | { id: number; who: 'ic'; kind: 'problem'; text: string; retry?: string; pick?: boolean }
  | { id: number; who: 'ic'; kind: 'note'; text: string };

type NewTurn = Turn extends unknown ? (Turn extends infer T ? (T extends Turn ? Omit<T, 'id'> : never) : never) : never;

const SHOWS: Record<string, string> = {
  swipe: 'a before and after swipe',
  'time-slider': 'a map for each year with a slider',
  'click-chart': 'a history chart wherever you click',
  'region-stats': 'area totals',
  legend: 'a legend',
  download: 'downloads',
};

export const TEMPLATES: { who: string; job: string; questions: string[] }[] = [
  {
    who: 'Newsroom',
    job: 'A credible satellite visual for today’s story, with the credit line written for you.',
    questions: [
      'Map flooding in Houston before and after Hurricane Harvey',
      'Sea surface temperature against normal in the Gulf of Mexico this summer',
      'Burn scar from the Camp Fire in Paradise, California',
    ],
  },
  {
    who: 'Classroom',
    job: 'A safe link students can open and investigate, no accounts.',
    questions: [
      'How has snow cover in the Sierra Nevada changed each winter since 2018',
      'Land cover around Atlanta from 1992 to 2020',
      'Where did fires burn in the Amazon in 2019',
    ],
  },
  {
    who: 'Field office',
    job: 'This season against past ones, county by county, ready for a slide or a newsletter.',
    questions: [
      'Compare greenness of fields in Fresno County, California in summer 2019 vs summer 2025',
      'What crops grew in Story County, Iowa in 2021',
      'Rainfall in Kansas, 2022 vs 2012',
    ],
  },
];

function stepsFor(intent: Intent, place: Place, route: Route): Step[] {
  const st = STATION_BY_ID[route.station];
  const shows = route.views.map((v) => SHOWS[v]).filter(Boolean);
  return [
    { label: 'Heard', value: `${THEME_WORDS[intent.theme][0].toUpperCase()}${THEME_WORDS[intent.theme].slice(1)}, ${whenWords(intent)}` },
    { label: 'Place', value: place.name },
    { label: 'Data', value: `${st.name}`, note: route.why },
    {
      label: 'Dates',
      value: route.windows.length > 2 ? `${route.windows[0].label} to ${route.windows[route.windows.length - 1].label}, ${route.windows.length} maps` : route.windows.map((w) => w.label).join(' vs '),
    },
    { label: 'App', value: shows.length ? shows.join(', ') : 'a map with a legend' },
  ];
}

/** Next things people usually ask for, given what's on screen. */
function suggestions(intent: Intent, route: Route | undefined, routes: Route[], spec?: AppSpec | null): string[] {
  if (!route) return [];
  const out: string[] = [];
  // A before and after that can be differenced: offer the change first, it's usually the story.
  if (spec && spec.methods.includes('difference') && spec.windows.length === 2) out.push(spec.view === 'change' ? 'Show both dates' : 'Show only the change');
  const t = intent.time;
  // Years from the route as built (a crop map that ends in 2021 was fitted there), not as asked.
  const ws = route.windows;
  const y0 = Number((t.kind === 'history' && route.historyRange ? route.historyRange.start : ws[0].start).slice(0, 4));
  const y1 = Number((t.kind === 'history' && route.historyRange ? route.historyRange.end : ws[ws.length - 1].start).slice(0, 4));
  const st = STATION_BY_ID[route.station];
  const earliest = st.score.startYear;
  const changes = st.temporal !== 'static';
  if (changes && t.kind === 'snapshot' && Math.max(earliest, y1 - 5) < y1) out.push(`Compare with ${Math.max(earliest, y1 - 5)}`);
  if (changes && t.kind === 'compare' && y0 - 5 >= earliest) out.push(`Compare with ${y0 - 5} instead`);
  if (changes && t.kind !== 'yearly' && Math.max(earliest, y1 - 6) < y1) out.push(`Make it a slider by year since ${Math.max(earliest, y1 - 6)}`);
  if (!route.views.includes('click-chart') && (st.temporal === 'dense' || st.temporal === 'composite') && route.signal !== 'true-color') out.push('Add a history chart where I click');
  out.push('Zoom out');
  const alt = routes.find((r) => r.station !== route.station && r.runs === 'live');
  if (alt) out.push(`Use ${shortName(STATION_BY_ID[alt.station])}`);
  return out.slice(0, 5);
}

export function Studio({ forkToken, initialGoal, initialStation }: { forkToken: string | null; initialGoal?: string | null; initialStation?: string | null }) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [current, setCurrent] = useState(-1);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusyState] = useState(false);
  // A ref as well as state, so a request that hands over to another sees the current value.
  const busyRef = useRef(false);
  const setBusy = (b: boolean) => {
    busyRef.current = b;
    setBusyState(b);
  };
  const [draft, setDraft] = useState('');
  const [pinned, setPinned] = useState<string | null>(initialStation && STATION_BY_ID[initialStation] ? initialStation : null);
  const [apiKey, setApiKey] = useState(loadKey);
  const [modal, setModal] = useState<null | { kind: 'share' } | { kind: 'key' } | { kind: 'place'; text: string; area?: boolean } | { kind: 'ee'; code: string } | { kind: 'route' } | { kind: 'journey' }>(null);
  const [journey, setJourney] = useState<JourneyStop[]>([]);
  const [journeyTitle, setJourneyTitle] = useState('');
  const [dossier, setDossier] = useState<string | null>(null);
  const [stop, setStop] = useState<StopKey | null>(null);
  const turnId = useRef(0);
  const apiRef = useRef<AppApi | null>(null);
  const versionsRef = useRef<Version[]>([]);
  const addVersion = (version: Version): number => {
    versionsRef.current = [...versionsRef.current, version];
    setVersions(versionsRef.current);
    const idx = versionsRef.current.length - 1;
    setCurrent(idx);
    return idx;
  };
  const logRef = useRef<HTMLDivElement>(null);
  const v = versions[current];
  const route = v ? v.routes[v.routeIdx] : undefined;
  const spec = v?.spec ?? null;

  const push = (...ts: NewTurn[]) => setTurns((prev) => [...prev, ...ts.map((t) => ({ ...t, id: ++turnId.current }) as Turn)]);

  // Keep the newest turn in view.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [turns.length]);

  /** Plan, pick the best live route, compile it, and record a version. */
  const build = (intent: Intent, place: Place, changes: string[], preferStation: string | null = null) => {
    const plan = planRoutes(preferStation ? { ...intent, station: preferStation } : intent, place);
    if (!plan.routes.length) {
      push({ who: 'ic', kind: 'problem', text: plan.skipped.map((s) => s.reason).join(' ') || 'No dataset fits that yet.' });
      return;
    }
    const idx = Math.max(0, plan.routes.findIndex((r) => r.runs === 'live'));
    const r = plan.routes[idx];
    const compiled = r.runs === 'live' ? compileRoute(r, intent.text.split(' / ')[0]) : { spec: null, errors: [] };
    const n = addVersion({ intent, place, routes: plan.routes, routeIdx: idx, spec: compiled.spec });
    push({
      who: 'ic',
      kind: 'built',
      version: n,
      steps: stepsFor(intent, place, r),
      changes,
      warnings: [...plan.warnings, ...r.warnings].slice(0, 3),
      color: stationColor(STATION_BY_ID[r.station]),
      live: r.runs === 'live' && !!compiled.spec,
    });
  };

  const findPlace = async (intent: Intent, text: string): Promise<Place | null> => {
    const phrases = [intent.place, ...intent.places].filter((x): x is string => !!x);
    if (!phrases.length) {
      push({ who: 'ic', kind: 'problem', text: 'Where should it look? Add a place to the question, or pick it on the map.', pick: true, retry: text });
      return null;
    }
    try {
      const hit = await geocodeFirst(nominatim, phrases);
      if (hit) return hit.place;
      push({ who: 'ic', kind: 'problem', text: `Couldn't find "${intent.place}" on the map. Pick it on the map, or add a state or country, like "Tompkins County, NY".`, pick: true, retry: text });
    } catch (e) {
      if ((e as Error).name !== 'LookupDown') throw e;
      push({ who: 'ic', kind: 'problem', text: `Place lookup isn't answering right now, so "${intent.place}" couldn't be found. Try again in a moment, or pick it on the map.`, pick: true, retry: text });
    }
    return null;
  };

  const start = async (text: string, chosen: Place | null = null) => {
    const t = text.trim();
    if (!t || busyRef.current) return;
    setBusy(true);
    push({ who: 'you', text: t });
    try {
      let intent: Intent;
      if (apiKey) {
        try {
          intent = await parseGoalWithClaude(t, apiKey);
        } catch (e) {
          push({ who: 'ic', kind: 'note', text: `Claude couldn't read that (${(e as Error).message}), so the built-in reader did.` });
          intent = parseGoal(t);
        }
      } else intent = parseGoal(t);
      const place = chosen ?? (await findPlace(intent, t));
      if (!place) return;
      build(intent, place, [], pinned);
    } finally {
      setBusy(false);
    }
  };

  const followUp = async (text: string) => {
    const t = text.trim();
    if (!t || busyRef.current) return;
    if (!v) return start(t);
    setBusy(true);
    setDraft('');
    push({ who: 'you', text: t });
    try {
      // "Show only the change" and "show both dates" switch the view in place; nothing to rebuild.
      const s = v.spec;
      if (s && s.methods.includes('difference') && s.windows.length === 2) {
        const toChange = /^(please )?((show|see|map|display)( me)?( only| just)? (the )?(change|difference)( map| only)?|(just|only) the (change|difference)|(the )?change map|(show( me)? )?what changed)\b/i.test(t);
        const toBoth = /\b(both dates|side by side|before and after|swipe)\b/i.test(t) && s.view === 'change' && !/\b(19|20)\d\d\b/.test(t);
        if (toChange || toBoth) {
          patchSpec({ ...s, view: toChange ? 'change' : undefined });
          push({ who: 'ic', kind: 'note', text: toChange ? `Showing the change: ${s.windows[1].label} minus ${s.windows[0].label}. The link and embed open this way too.` : 'Showing both dates with the swipe.' });
          return;
        }
      }
      const r = refine(v.intent, t);
      let place: Place | null = v.place;
      if (r.newPlace) {
        place = await findPlace(r.intent, t);
        if (!place) return;
      } else if (r.scale) {
        const [w, s, e, n] = v.place.bbox;
        const cx = (w + e) / 2;
        const cy = (s + n) / 2;
        const hw = ((e - w) / 2) * r.scale;
        const hh = ((n - s) / 2) * r.scale;
        place = { name: v.place.name, bbox: [Math.max(-180, cx - hw), Math.max(-85, cy - hh), Math.min(180, cx + hw), Math.min(85, cy + hh)] };
      }
      if (!r.changes.length) {
        // Nothing recognisable as a change. A new place means a new question; otherwise say what can change.
        if (placeCandidates(t).some((c) => c.score >= 3)) {
          setBusy(false);
          setTurns((prev) => prev.slice(0, -1));
          return start(t);
        }
        push({ who: 'ic', kind: 'note', text: 'I can change the dates, the place, the dataset, the view or how much area it covers. Try "compare with 2015", "use Landsat", "make it a slider by year" or "zoom out".' });
        return;
      }
      build(r.intent, place, r.changes, r.intent.station);
    } finally {
      setBusy(false);
    }
  };

  const ride = (idx: number) => {
    if (!v) return;
    const r = v.routes[idx];
    const compiled = r.runs === 'live' ? compileRoute(r, v.intent.text.split(' / ')[0]) : { spec: null, errors: [] };
    push({ who: 'you', text: `Use ${STATION_BY_ID[r.station].name}` });
    const n = addVersion({ ...v, routeIdx: idx, spec: compiled.spec });
    push({
      who: 'ic',
      kind: 'built',
      version: n,
      steps: stepsFor(v.intent, v.place, r),
      changes: [`Dataset: ${STATION_BY_ID[r.station].name}`],
      warnings: r.warnings.slice(0, 2),
      color: stationColor(STATION_BY_ID[r.station]),
      live: r.runs === 'live' && !!compiled.spec,
    });
  };

  const editRoute = (r: Route) => {
    if (!v) return;
    const routes = v.routes.map((x, i) => (i === v.routeIdx ? r : x));
    const compiled = r.runs === 'live' ? compileRoute(r, v.intent.text.split(' / ')[0]) : { spec: null, errors: [] };
    versionsRef.current = versionsRef.current.map((x, i) => (i === current ? { ...x, routes, spec: compiled.spec ?? x.spec } : x));
    setVersions(versionsRef.current);
  };
  const patchSpec = (s: AppSpec) => {
    const old = versionsRef.current[current]?.spec;
    versionsRef.current = versionsRef.current.map((x, i) => (i === current ? { ...x, spec: s } : x));
    setVersions(versionsRef.current);
    // A title or note edited after the map joined the journey follows it there.
    if (old) setJourney((prev) => prev.map((j) => (j.spec === old ? { ...j, spec: s } : j)));
  };

  // Arriving with a question (from the landing page) or a fork.
  const began = useRef(false);
  useEffect(() => {
    if (began.current) return;
    began.current = true;
    if (forkToken) {
      const s = decodeSpec(forkToken);
      history.replaceState(null, '', `${location.pathname}${location.search}#build`);
      if (!s) {
        push({ who: 'ic', kind: 'problem', text: 'That fork link is damaged or from a newer version.' });
        return;
      }
      const intent = parseGoal(s.question);
      const r = routeFromSpec(s);
      addVersion({ intent, place: { name: s.aoi.name, bbox: s.aoi.bbox }, routes: [r], routeIdx: 0, spec: s });
      push({ who: 'you', text: s.question }, { who: 'ic', kind: 'built', version: 0, steps: stepsFor(intent, { name: s.aoi.name, bbox: s.aoi.bbox }, r), changes: ['Forked from a published app'], warnings: [], color: stationColor(STATION_BY_ID[r.station]), live: true });
    } else if (initialGoal) start(initialGoal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tips = useMemo(() => (v ? suggestions(v.intent, route, v.routes, v.spec) : []), [v, route]);
  const [recent, setRecent] = useState(loadRecent);
  useSlashFocus(['follow-input', 'goal']);
  // Remember each map that builds, so it can be reopened from the start screen later.
  useEffect(() => {
    if (spec) rememberMap(spec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec?.title, spec?.aoi.name, spec?.station, spec?.windows.map((w) => w.start).join()]);
  const empty = turns.length === 0;

  return (
    <div className="shell studio-shell">
      <header className="band studio-band">
        <a className="brand" href="#" aria-label="Interchange, home">
          <BrandMark />
          <span>Interchange</span>
        </a>
        {!empty && (
          <button
            className="btn btn-quiet"
            type="button"
            onClick={() => {
              setTurns([]);
              setRecent(loadRecent());
              versionsRef.current = [];
              setVersions([]);
              setCurrent(-1);
              setDraft('');
            }}
          >
            New map
          </button>
        )}
        <span className="band-spacer" />
        {journey.length > 0 && (
          <button className="btn btn-quiet journey-btn" type="button" onClick={() => setModal({ kind: 'journey' })}>
            Journey: {journey.length} {journey.length === 1 ? 'stop' : 'stops'}
          </button>
        )}
        <button className="btn btn-quiet reader-btn" type="button" onClick={() => setModal({ kind: 'key' })}>
          {apiKey ? 'Reading with Claude' : 'Reader: built-in'}
        </button>
        {spec && (
          <button className="btn btn-signal" type="button" onClick={() => setModal({ kind: 'share' })}>
            Publish
          </button>
        )}
      </header>

      <Swap id={empty ? 'start' : 'studio'} className="swap-view studio-swap">
      {empty ? (
        <main className="studio-start">
          <AskBox
            id="goal"
            heading="What should the map show?"
            submitLabel="Build this map"
            pinned={pinned}
            onUnpin={() => setPinned(null)}
            onSubmit={(text, place) => start(text, place)}
            busy={busy}
            autoFocus={!initialGoal}
            withGlobe
          />
          {recent.length > 0 && (
            <section className="recent" aria-labelledby="recent-title">
              <div className="recent-head">
                <h2 id="recent-title">Your maps</h2>
                <button
                  className="btn-link"
                  onClick={() => {
                    forgetMaps();
                    setRecent([]);
                  }}
                >
                  Clear this list
                </button>
              </div>
              <ul>
                {recent.map((r) => (
                  <li key={r.token}>
                    <a href={`#fork=${r.token}`} className="recent-map">
                      <strong>{r.title}</strong>
                      <span>{r.at}</span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="hint">Kept in this browser only.</p>
            </section>
          )}
          <section className="templates" aria-labelledby="templates-title">
            <h2 id="templates-title">Or start from a job</h2>
            <div className="template-cols">
              {TEMPLATES.map((g) => (
                <div className="template" key={g.who}>
                  <h3>{g.who}</h3>
                  <p>{g.job}</p>
                  <ul>
                    {g.questions.map((q) => (
                      <li key={q}>
                        <button className="example" type="button" onClick={() => start(q)} disabled={busy}>
                          {q}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </main>
      ) : (
        <main className="studio">
          <aside className="studio-log" aria-label="Conversation">
            <div className="log-scroll" ref={logRef} aria-live="polite">
              {turns.map((t) =>
                t.who === 'you' ? (
                  <div key={t.id} className="turn turn-you">
                    <p>{t.text}</p>
                  </div>
                ) : t.kind === 'built' ? (
                  <BuiltTurn
                    key={t.id}
                    turn={t}
                    isCurrent={t.version === current}
                    version={versions[t.version]}
                    onRestore={() => setCurrent(t.version)}
                    onRide={ride}
                    onDetails={() => setModal({ kind: 'route' })}
                    onArea={() => setModal({ kind: 'place', text: '', area: true })}
                    inJourney={!!versions[t.version]?.spec && journey.some((j) => j.spec === versions[t.version]?.spec)}
                    onJourney={() => {
                      const sp = versions[t.version]?.spec;
                      if (!sp || journey.some((j) => j.spec === sp)) return;
                      setJourney((prev) => [...prev, { spec: sp, caption: '' }]);
                      push({ who: 'ic', kind: 'note', text: `Added as stop ${journey.length + 1} of your journey. Build more maps and add them, then open Journey to caption and publish.` });
                    }}
                    onAbout={(id) => setDossier(id)}
                    onExport={(code) => setModal({ kind: 'ee', code })}
                  />
                ) : t.kind === 'problem' ? (
                  <div key={t.id} className="turn turn-ic turn-problem" role="alert">
                    <p>{t.text}</p>
                    <div className="turn-actions">
                      {t.pick && (
                        <button className="chip" onClick={() => setModal({ kind: 'place', text: t.retry ?? '' })}>
                          Pick it on the map
                        </button>
                      )}
                      {t.retry && (
                        <button className="chip" onClick={() => start(t.retry!)} disabled={busy}>
                          Try again
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div key={t.id} className="turn turn-ic turn-note">
                    <p>{t.text}</p>
                  </div>
                ),
              )}
              {busy && (
                <div className="turn turn-ic turn-working" role="status">
                  <span className="scan-dots" aria-hidden="true" /> Working
                </div>
              )}
            </div>
            <form
              className="follow"
              onSubmit={(e) => {
                e.preventDefault();
                followUp(draft);
              }}
            >
              {tips.length > 0 && (
                <div className="follow-tips" aria-label="Suggested changes">
                  {tips.map((s) => (
                    <button key={s} type="button" className="chip" disabled={busy} onClick={() => followUp(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <label className="sr-only" htmlFor="follow-input">
                Ask for a change
              </label>
              <div className="follow-row">
                <textarea
                  id="follow-input"
                  rows={2}
                  value={draft}
                  placeholder={v ? 'Ask for a change: "compare with 2010", "use Landsat", "now do Clovis"' : 'Ask again'}
                  onChange={(e) => setDraft(e.target.value.replace(/\n/g, ' '))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      followUp(draft);
                    }
                  }}
                />
                <button className="btn btn-primary" type="submit" disabled={busy || !draft.trim()}>
                  Send
                </button>
              </div>
            </form>
          </aside>

          <section className="studio-preview" aria-label="Your app">
            {spec ? (
              <Swap id={String(current)} className="swap-view">
                <AppRuntime key={current} spec={spec} mode="builder" apiRef={apiRef} onTitle={(title) => patchSpec({ ...spec, title })} onSpec={patchSpec} />
              </Swap>
            ) : route && route.runs === 'export' ? (
              <div className="preview-empty">
                <h2>This one runs in Earth Engine</h2>
                <p>{STATION_BY_ID[route.station].name} isn't readable in the browser yet, so Interchange wrote the Earth Engine script instead.</p>
                <button className="btn btn-primary" onClick={() => setModal({ kind: 'ee', code: earthEngineScript(route) })}>
                  Open the script
                </button>
              </div>
            ) : (
              <div className="preview-empty" aria-hidden={busy}>
                <div className="preview-scan" />
              </div>
            )}
          </section>
        </main>
      )}
      </Swap>

      {dossier && <Dossier id={dossier} onClose={() => setDossier(null)} onPlan={(id) => { setPinned(id); setDossier(null); }} />}

      {modal && (
        <Dialog labelledBy="modal-title" onClose={() => setModal(null)} wide={modal.kind !== 'key'}>
          {(close) => (
            <>
              {modal.kind === 'share' && spec && <ShareDialog spec={spec} route={route} apiRef={apiRef} onClose={close} />}
              {modal.kind === 'ee' && (
                <>
                  <h2 id="modal-title">Earth Engine version</h2>
                  <p>Paste into the Earth Engine Code Editor and press Run. To publish it there, use Apps, then New App, with your own Earth Engine project.</p>
                  <pre>{modal.code}</pre>
                  <div className="route-actions">
                    <CopyButton text={modal.code} label="Copy script" />
                    <button className="btn" onClick={close} autoFocus>
                      Done
                    </button>
                  </div>
                </>
              )}
              {modal.kind === 'route' && route && v && (
                <>
                  <h2 id="modal-title">The route</h2>
                  <p>Every step this map takes, from the satellite to the app. Tap a stop to change it; the map rebuilds when you close this.</p>
                  <RouteStrip route={route} active={stop} onStop={(k) => setStop(stop === k ? null : k)} animate />
                  {stop && <StopEditor route={route} stop={stop} onChange={editRoute} />}
                  <div className="route-actions">
                    <button className="btn btn-primary" onClick={close} autoFocus>
                      Done
                    </button>
                  </div>
                </>
              )}
              {modal.kind === 'place' && (
                <PlacePicker
                  initial={modal.area ? (v?.place.name ?? '') : (parseGoal(modal.text).place ?? '')}
                  onCancel={close}
                  onPick={(p) => {
                    close();
                    // Drop the failed attempt from the log; the retry carries the picked place.
                    setTurns((prev) => prev.filter((t) => !(t.who === 'ic' && t.kind === 'problem')));
                    if (v && (modal.area || (modal.text && !parseGoal(modal.text).place))) {
                      if (modal.area) push({ who: 'you', text: `Use ${p.name} as the area` });
                      build(v.intent, p, [`Place: ${p.name}`]);
                    }
                    else start(modal.text || 'Greenness this summer', p);
                  }}
                />
              )}
              {modal.kind === 'journey' && <JourneyEditor title={journeyTitle} stops={journey} onTitle={setJourneyTitle} onStops={setJourney} onClose={close} />}
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

function BuiltTurn({
  turn,
  version,
  isCurrent,
  onRestore,
  onRide,
  onDetails,
  onAbout,
  onExport,
  onArea,
  onJourney,
  inJourney,
}: {
  onArea: () => void;
  onJourney: () => void;
  inJourney: boolean;
  turn: Extract<Turn, { kind: 'built' }>;
  version: Version | undefined;
  isCurrent: boolean;
  onRestore: () => void;
  onRide: (idx: number) => void;
  onDetails: () => void;
  onAbout: (station: string) => void;
  onExport: (code: string) => void;
}) {
  if (!version) return null;
  const route = version.routes[version.routeIdx];
  const others = version.routes.map((r, i) => ({ r, i })).filter(({ i }) => i !== version.routeIdx).slice(0, 3);
  return (
    <div className="turn turn-ic turn-built" data-current={isCurrent || undefined} style={{ ['--route-color' as string]: turn.color }}>
      {turn.changes.length > 0 && (
        <ul className="turn-changes">
          {turn.changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      <ol className="build-steps">
        {turn.steps.map((s, i) => (
          <li key={s.label} style={{ ['--i' as string]: i }}>
            <span className="build-label">{s.label}</span>
            <span className="build-value">{s.value}</span>
            {s.note && <span className="build-note">{s.note}</span>}
          </li>
        ))}
      </ol>
      {isCurrent && turn.live && <LatestLook station={route.station} place={version.place} />}
      {turn.warnings.map((w) => (
        <p className="build-warning" key={w}>
          {w}
        </p>
      ))}
      <div className="turn-actions">
        {isCurrent ? (
          <>
            <button className="chip" onClick={onDetails}>
              See every step
            </button>
            <button className="chip" onClick={onArea}>
              Change the area
            </button>
            {turn.live && (
              <button className="chip chip-journey" onClick={onJourney} disabled={inJourney}>
                {inJourney ? 'In your journey' : 'Add to journey'}
              </button>
            )}
            <button className="chip" onClick={() => onAbout(route.station)}>
              About {shortName(STATION_BY_ID[route.station])}
            </button>
            {!turn.live && (
              <button className="chip" onClick={() => onExport(earthEngineScript(route))}>
                Earth Engine script
              </button>
            )}
          </>
        ) : (
          <button className="chip" onClick={onRestore}>
            Show this version
          </button>
        )}
      </div>
      {isCurrent && others.length > 0 && (
        <div className="other-routes">
          <span className="other-label">Other ways to build it</span>
          {others.map(({ r, i }) => {
            const st = STATION_BY_ID[r.station];
            const plus = ['Years', 'Detail', 'Looks', 'Runs'].map((l) => r.tradeoffs.find((t) => t.label === l && t.tone === 'good')).find(Boolean);
            return (
              <button key={i} className="chip chip-route" style={{ ['--route-color' as string]: stationColor(st) }} onClick={() => onRide(i)}>
                <span className="chip-dot" aria-hidden="true" />
                {shortName(st)}
                {plus ? `: ${plus.value}` : ''}
                {r.runs === 'export' ? ' (Earth Engine)' : ''}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** "Sentinel-2 last looked here 4 days ago": a real, current fact about the place. */
function LatestLook({ station, place }: { station: string; place: Place }) {
  const [date, setDate] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    latestLook(station, place.bbox).then((d) => alive && setDate(d));
    return () => {
      alive = false;
    };
  }, [station, place.bbox]);
  if (!date) return null;
  const n = daysAgo(date);
  const when = n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
  const pretty = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return (
    <p className="latest-look">
      <span className="latest-dot" aria-hidden="true" />
      {shortName(STATION_BY_ID[station])} last looked here {when}, on {pretty}.
    </p>
  );
}
