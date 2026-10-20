import { useEffect, useMemo, useRef, useState } from 'react';
import { compileRoute, encodeSpec, type AppSpec } from '../compiler/spec';
import { creditLine } from '../compiler/credit';
import { LINE_BY_ID, STATIONS, STATION_BY_ID } from '../network/network';
import { parseGoal } from '../planner/intent';
import { planRoutes, type Place } from '../planner/plan';
import { Globe } from '../globe/Globe';
import { INK } from '../globe/Globe';
import { BrandMark } from '../ui/BrandMark';
import { Dossier } from '../ui/Dossier';
import { MapKey, NetworkMap, shortName } from '../ui/NetworkMap';
import { ReadBackSign } from '../ui/ReadBackSign';
import { SplitFlap } from '../ui/SplitFlap';
import { globeProps } from '../ui/AskBox';
import { useLiveIntent } from '../ui/readback';

const REPO = 'https://github.com/shourya0mehta/interchange';
const base = () => `${location.origin}${location.pathname}`;

/** Questions the hero asks itself until someone starts typing. Places are fixed, so no lookups. */
const DEMO: { q: string; place: Place }[] = [
  { q: 'sea surface temperature in the north atlantic since 1999', place: { name: 'North Atlantic Ocean', bbox: [-82, 0, 0, 66] } },
  { q: 'compare greenness of fields in fresno county, summer 2019 vs 2025', place: { name: 'Fresno County, California', bbox: [-120.92, 35.9, -118.36, 37.59] } },
  { q: 'flooding in houston before and after hurricane harvey', place: { name: 'Houston, Texas', bbox: [-95.79, 29.52, -95.01, 30.11] } },
  { q: 'snow cover in the alps each winter since 2018', place: { name: 'Alps', bbox: [5.5, 43.8, 16.5, 48.2] } },
  { q: 'where did fires burn in the amazon in 2019', place: { name: 'Amazon rainforest', bbox: [-74, -16, -46, 4] } },
  { q: 'urban heat island in delhi, summer 2025', place: { name: 'Delhi, India', bbox: [76.84, 28.4, 77.35, 28.88] } },
];

/** Real apps for the departures board, compiled here and opened from their links. */
const DEPARTURES: { q: string; place: Place }[] = [
  { q: 'Compare greenness of fields in Fresno County, summer 2019 vs summer 2025', place: { name: 'Fresno County, California', bbox: [-120.92, 35.9, -118.36, 37.59] } },
  { q: 'Sea surface temperature in the North Atlantic since 1999', place: { name: 'North Atlantic Ocean', bbox: [-82, 0, 0, 66] } },
  { q: 'What crops grew around Ames, Iowa in 2021', place: { name: 'Ames, Iowa', bbox: [-93.75, 41.95, -93.5, 42.1] } },
  { q: 'Map flooding in Houston before and after August 2017', place: { name: 'Houston, Texas', bbox: [-95.79, 29.52, -95.01, 30.11] } },
  { q: 'Where fires burned in California in September 2020', place: { name: 'California', bbox: [-124.48, 32.53, -114.13, 42.01] } },
  { q: 'Snow cover in the Sierra Nevada, winter 2021 vs winter 2023', place: { name: 'Sierra Nevada', bbox: [-121.5, 35.4, -117.8, 40.3] } },
  { q: 'Urban heat island in Phoenix, summer 2025', place: { name: 'Phoenix, Arizona', bbox: [-112.32, 33.29, -111.93, 33.92] } },
  { q: 'Rainfall in Iowa, spring 2012 vs spring 2019', place: { name: 'Iowa', bbox: [-96.64, 40.38, -90.14, 43.5] } },
  { q: 'Land cover in Rondônia, Brazil, 1995 vs 2020', place: { name: 'Rondônia, Brazil', bbox: [-66.8, -13.7, -59.8, -7.97] } },
];

/** The three jobs Interchange is built for, each with a real app behind it. */
const JOBS: { id: string; who: string; job: string; gets: string[]; q: string; place: Place; shot: string; alt: string; notes?: string; questions?: string[] }[] = [
  {
    id: 'newsroom',
    who: 'Newsrooms',
    job: 'A satellite map for today’s story, without a GIS desk.',
    gets: ['An embed for the article, sized for phones', 'The credit line in each provider’s own wording', 'A methods note you can paste under the map', 'A 16:9 or square image for social'],
    q: 'Map flooding in Houston before and after Hurricane Harvey',
    place: { name: 'Houston, Texas', bbox: [-95.79, 29.52, -95.01, 30.11] },
    shot: 'use-newsroom.jpg',
    alt: 'A news article with an embedded Interchange map of Houston flooding, before and after Hurricane Harvey',
    notes: 'Dark areas east of downtown are standing water seen by radar through the storm clouds.',
  },
  {
    id: 'classroom',
    who: 'Classrooms',
    job: 'A live link students open and investigate, with no accounts and nothing to install.',
    gets: ['Questions to explore, shown beside the map', 'Click anywhere for that spot’s history', 'CSV that opens in Sheets', 'Every step explained in plain words'],
    q: 'Snow cover in the Sierra Nevada, winter 2021 vs winter 2023',
    place: { name: 'Sierra Nevada', bbox: [-121.5, 35.4, -117.8, 40.3] },
    shot: 'use-classroom.jpg',
    alt: 'A published Interchange app comparing Sierra Nevada snow cover in two winters, with questions for students',
    questions: ['Which side of the range kept snow longer in 2023?', 'Why might the same mountains look so different two years apart?'],
  },
  {
    id: 'field',
    who: 'Field offices',
    job: 'This season against past ones, county by county, ready for a slide or a newsletter.',
    gets: ['Field-level greenness back to 1984', 'Crop types by field across the US', 'Area totals for the county', 'A slide image with legend and credit'],
    q: 'Compare greenness of fields in Fresno County, summer 2019 vs summer 2025',
    place: { name: 'Fresno County, California', bbox: [-120.92, 35.9, -118.36, 37.59] },
    shot: 'use-field.jpg',
    alt: 'A slide image exported from Interchange: Fresno County greenness in summer 2010 and summer 2025, side by side, with a legend and credit line',
  },
];

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function compile(q: string, place: Place, extra?: Partial<AppSpec>): AppSpec | null {
  const plan = planRoutes(parseGoal(q), place);
  const route = plan.routes.find((r) => r.runs === 'live');
  const spec = route ? compileRoute(route, q).spec : null;
  return spec ? { ...spec, ...extra } : null;
}

function departures() {
  return DEPARTURES.map((d) => {
    const plan = planRoutes(parseGoal(d.q), d.place);
    const route = plan.routes.find((r) => r.runs === 'live');
    const spec = route ? compileRoute(route, d.q).spec : null;
    const st = route ? STATION_BY_ID[route.station] : null;
    const shows = route?.views.includes('swipe') ? 'Swipe' : route?.views.includes('time-slider') ? 'Slider' : route?.views.includes('click-chart') ? 'History' : route?.views.includes('region-stats') ? 'Totals' : 'Map';
    return { ...d, spec, st, shows };
  }).filter((d) => d.spec && d.st);
}

/** Cycles the demo questions, typing each into the placeholder, until the visitor takes over. */
function useDemo(active: boolean) {
  const [i, setI] = useState(0);
  const [n, setN] = useState(DEMO[0].q.length);
  useEffect(() => {
    if (!active || reducedMotion()) {
      setN(DEMO[i].q.length);
      return;
    }
    setN(0);
    const type = setInterval(() => setN((k) => Math.min(DEMO[i].q.length, k + 1)), 28);
    const next = setTimeout(() => setI((k) => (k + 1) % DEMO.length), 5600);
    return () => {
      clearInterval(type);
      clearTimeout(next);
    };
  }, [active, i]);
  return { demo: DEMO[i], typed: DEMO[i].q.slice(0, n) };
}

/** Plays its animation once, when it first scrolls into view. */
function useInView<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

const GLYPH_KEY: [string, string, string][] = [
  ['=', INK.crop, 'cropland'],
  ['#', INK.forest, 'forest'],
  [';', INK.grass, 'grass and shrub'],
  [':', INK.bare, 'desert'],
  ['@', INK.built, 'cities'],
  ['*', INK.snow, 'ice'],
  ['~', '#CE4A2C', 'warm sea'],
  ['.', '#354E96', 'cold sea'],
];

export function Landing() {
  const [goal, setGoal] = useState('');
  const [focused, setFocused] = useState(false);
  const [dossier, setDossier] = useState<string | null>(null);
  const [hover, setHover] = useState('');
  const [job, setJob] = useState(JOBS[0].id);
  const demoOn = !goal && !focused;
  const { demo, typed } = useDemo(demoOn);
  const live = useLiveIntent(goal || demo.q, goal ? null : demo.place);
  const g = globeProps(live.intent, live.back, live.place);
  const deps = useMemo(departures, []);
  const jobs = useMemo(() => JOBS.map((j) => ({ ...j, spec: compile(j.q, j.place, { notes: j.notes, questions: j.questions }) })), []);
  const liveCount = STATIONS.filter((s) => s.live).length;
  const [howRef, howSeen] = useInView<HTMLOListElement>();
  const active = jobs.find((j) => j.id === job)!;

  useEffect(() => {
    document.title = 'Interchange: satellite maps from a sentence';
  }, []);

  const [task, setTask] = useState<{ lat: number; lon: number } | null>(null);
  // Pressing Build tasks the satellite: it swings round to pass over the place, then the studio opens.
  const build = (q: string) => {
    const p = live.place;
    const go = () => (location.hash = `build?q=${encodeURIComponent(q)}`);
    if (!p || reducedMotion()) return go();
    setTask({ lat: (p.bbox[1] + p.bbox[3]) / 2, lon: (p.bbox[0] + p.bbox[2]) / 2 });
    setTimeout(go, 1500);
  };

  return (
    <div className="home">
      <header className="band home-band">
        <a className="brand" href="#" aria-label="Interchange, home">
          <BrandMark />
          <span>Interchange</span>
        </a>
        <nav className="home-nav" aria-label="Site">
          <a href="#who">Who it’s for</a>
          <a href="#how">How it works</a>
          <a href="#departures">Examples</a>
          <a href="#network">Datasets</a>
          <a href={REPO}>GitHub</a>
        </nav>
        <a className="btn btn-signal" href="#build">
          Open the studio
        </a>
      </header>

      <main>
        <section className="home-hero" aria-labelledby="hero-title">
          <div className="home-hero-copy">
            <h1 id="hero-title">Ask the planet. Publish the map.</h1>
            <p className="home-sub">
              Type what you want to see and where. Interchange picks the satellite, builds a live map, and writes the credit line. Share it as a link, an embed or a slide. No code, no
              account.
            </p>
            <form
              className="home-ask"
              onSubmit={(e) => {
                e.preventDefault();
                build(goal || demo.q);
              }}
            >
              <label className="sr-only" htmlFor="hero-goal">
                What should the map show, and where?
              </label>
              <input
                id="hero-goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={demoOn ? typed : 'What should the map show, and where?'}
                autoComplete="off"
              />
              <button className="btn btn-primary btn-go" type="submit" aria-busy={!!task}>
                <span>{task ? 'Tasking the satellite' : 'Build this map'}</span>
              </button>
            </form>
            <ReadBackSign back={live.back} status={live.status} idPrefix="hero" layout="compact" />
          </div>
          <figure className="home-globe">
            <Globe
              {...g}
              task={task}
              cell={9}
              onHover={(h) => setHover(h ? `${h.text}. ${h.where}` : '')}
              onPick={(lat, lon) => {
                setGoal(`Greenness near ${lat.toFixed(2)}, ${lon.toFixed(2)} this summer`);
              }}
            />
            <figcaption>
              <span className="globe-readout" aria-live="off">
                {hover || 'Every character is a measurement. Drag to turn the planet; click a spot to ask about it.'}
              </span>
              <span className="glyph-key" aria-label="Key">
                {GLYPH_KEY.map(([ch, color, label]) => (
                  <span key={label}>
                    <b style={{ color }} aria-hidden="true">
                      {ch}
                    </b>
                    {label}
                  </span>
                ))}
              </span>
              <span className="globe-credit">Land: ESA CCI land cover 2020. Sea: NOAA OISST, October 3, 2026.</span>
            </figcaption>
          </figure>
        </section>

        <section className="jobs" id="who" aria-labelledby="jobs-title">
          <div className="section-head">
            <h2 id="jobs-title">Built for three jobs</h2>
            <p>People who need a trustworthy satellite map this afternoon, not a geospatial pipeline. Each one below is a real app; open it and poke at it.</p>
          </div>
          <div className="jobs-grid">
            <div className="jobs-list" role="tablist" aria-label="Who it's for" aria-orientation="vertical">
              {jobs.map((j, i) => (
                <button
                  key={j.id}
                  role="tab"
                  id={`job-${j.id}`}
                  aria-selected={job === j.id}
                  aria-controls="job-panel"
                  className="job-tab"
                  onClick={() => setJob(j.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault();
                      const n = jobs[(i + (e.key === 'ArrowDown' ? 1 : jobs.length - 1)) % jobs.length];
                      setJob(n.id);
                      document.getElementById(`job-${n.id}`)?.focus();
                    }
                  }}
                >
                  <span className="job-who">{j.who}</span>
                  <span className="job-job">{j.job}</span>
                </button>
              ))}
            </div>
            <div className="job-panel" id="job-panel" role="tabpanel" aria-labelledby={`job-${active.id}`} key={active.id}>
              <div className={`job-figure job-figure-${active.id}`}>
                {active.id === 'newsroom' && (
                  <div className="mock-article" aria-hidden="true">
                    <span className="mock-kicker">Weather</span>
                    <span className="mock-head">Radar shows how far the water spread</span>
                    <span className="mock-line" />
                    <span className="mock-line short" />
                  </div>
                )}
                <img src={`${import.meta.env.BASE_URL}shots/${active.shot}`} alt={active.alt} loading="lazy" />
                {active.id === 'newsroom' && active.spec && <p className="mock-credit">{creditLine(active.spec)}</p>}
              </div>
              <div className="job-copy">
                <ul className="job-gets">
                  {active.gets.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                <p className="job-q">“{active.q}”</p>
                <div className="route-actions">
                  {active.spec && (
                    <a className="btn btn-primary" href={`${base()}#app=${encodeSpec(active.spec)}`}>
                      <span>Open this app</span>
                    </a>
                  )}
                  <a className="btn" href={`#build?q=${encodeURIComponent(active.q)}`}>
                    Rebuild it in the studio
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="how" id="how" aria-labelledby="how-title">
          <div className="section-head">
            <h2 id="how-title">A sentence in, a map out</h2>
            <p>Like an app builder, but every step is a real dataset and a real method you can inspect.</p>
          </div>
          <ol className="how-steps" ref={howRef} data-seen={howSeen || undefined}>
            <li>
              <span className="how-n">1</span>
              <h3>Say it plainly</h3>
              <p>Lowercase, misspelled, a county, a lake, an ocean or coordinates. The sign reads back what it heard before anything runs.</p>
              <div className="how-sign" aria-hidden="true">
                <div>
                  <small>Where</small>
                  <SplitFlap text={howSeen ? 'GULF OF MEXICO' : '              '} />
                </div>
                <div>
                  <small>When</small>
                  <SplitFlap text={howSeen ? 'SUMMER 2026' : '           '} />
                </div>
              </div>
            </li>
            <li>
              <span className="how-n">2</span>
              <h3>Watch it build</h3>
              <p>It picks the dataset that covers your place and dates, then shows each step: the satellite, the dates, the method, the app.</p>
              <ol className="how-log" aria-hidden="true">
                <li style={{ ['--i' as string]: 0 }}>
                  <b>Data</b> NOAA sea surface temperature
                </li>
                <li style={{ ['--i' as string]: 1 }}>
                  <b>Dates</b> June 15 to August 31, 2026
                </li>
                <li style={{ ['--i' as string]: 2 }}>
                  <b>App</b> map, legend, history on click
                </li>
              </ol>
            </li>
            <li>
              <span className="how-n">3</span>
              <h3>Ask for changes</h3>
              <p>“Compare with 2010.” “Use Landsat.” “Zoom out.” Each request rebuilds the map, and every version stays one click away.</p>
              <div className="how-chips" aria-hidden="true">
                <span className="chip">Compare with 2010</span>
                <span className="chip">Make it a slider by year</span>
                <span className="chip">Zoom out</span>
              </div>
            </li>
            <li>
              <span className="how-n">4</span>
              <h3>Publish</h3>
              <p>A link that holds the whole app, an embed with the credit line, or an image for a slide. Nothing to host, nothing to log in to.</p>
              <div className="how-ticket" aria-hidden="true">
                <span>Link</span>
                <span>Embed</span>
                <span>Image</span>
              </div>
            </li>
          </ol>
          <div className="route-actions how-cta">
            <a className="btn btn-primary" href="#build">
              <span>Open the studio</span>
            </a>
          </div>
        </section>

        <section className="departures" id="departures" aria-labelledby="dep-title">
          <div className="section-head">
            <h2 id="dep-title">Departures</h2>
            <p>Real apps, each one a link. The data loads live from open catalogs when you open it, so give a big area a few seconds.</p>
          </div>
          <table className="board">
            <thead>
              <tr>
                <th scope="col">To</th>
                <th scope="col">Via</th>
                <th scope="col">Question</th>
                <th scope="col">Shows</th>
              </tr>
            </thead>
            <tbody>
              {deps.map((d) => (
                <tr key={d.q}>
                  <td className="board-to">{d.place.name}</td>
                  <td className="board-line">
                    <span className="line-badge" style={{ background: LINE_BY_ID[d.st!.lines[0]].color }} aria-hidden="true" />
                    {shortName(d.st!)}
                  </td>
                  <td className="board-q">
                    <a href={`${base()}#app=${encodeSpec(d.spec!)}`}>{d.q}</a>
                  </td>
                  <td className="board-shows">{d.shows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="network-section" id="network" aria-labelledby="net-title">
          <div className="section-head">
            <h2 id="net-title">Every dataset is a station</h2>
            <p>
              {STATIONS.length} datasets on five lines, one for each part of the Earth system. {liveCount} run live in your browser, read straight from open cloud storage. The rest are on
              the map so you can see what exists; routes through them end in an Earth Engine script. Tap a station to see what it measures and what it’s bad at.
            </p>
          </div>
          <div className="network-scroll">
            <NetworkMap selected={dossier} highlight={live.back?.stations ?? []} onSelect={setDossier} />
          </div>
          <MapKey />
          {dossier && (
            <Dossier
              id={dossier}
              onClose={() => setDossier(null)}
              onPlan={(id) => {
                location.hash = `build?station=${id}`;
              }}
            />
          )}
        </section>

        <section className="compare" aria-labelledby="compare-title">
          <div className="section-head">
            <h2 id="compare-title">Why not Earth Engine’s App Builder?</h2>
            <p>Earth Engine is the right tool for heavy analysis, and Interchange writes the script for it. For a map that answers one question, the trade-offs look like this.</p>
          </div>
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Topic</span>
                </th>
                <th scope="col">Earth Engine App Builder</th>
                <th scope="col">Interchange</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">How you build it</th>
                <td>JavaScript against the ee and ui libraries</td>
                <td>One sentence, then ask for changes</td>
              </tr>
              <tr>
                <th scope="row">Choosing data</th>
                <td>You find the dataset ID, bands and scale factors</td>
                <td>Picked for your place and dates, with the trade-offs shown</td>
              </tr>
              <tr>
                <th scope="row">Where it runs</th>
                <td>Google’s servers, against the publisher’s Cloud project and quota</td>
                <td>The viewer’s browser, reading open data directly</td>
              </tr>
              <tr>
                <th scope="row">Publishing</th>
                <td>An app URL tied to your project</td>
                <td>A link, an embed with credits, or a slide image</td>
              </tr>
              <tr>
                <th scope="row">Heavy jobs</th>
                <td>Built for them</td>
                <td>Hands them off as an Earth Engine script</td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>

      <footer className="home-foot">
        <div className="home-foot-cta">
          <p>What should the map show?</p>
          <a className="btn btn-signal" href="#build">
            Open the studio
          </a>
        </div>
        <p>
          Interchange is open source under the MIT license. Data from ESA Copernicus, USGS and NASA, NOAA, USDA, Impact Observatory, ESA CCI and the EC JRC, read through{' '}
          <a href="https://element84.com/earth-search/">Earth Search</a> and the <a href="https://planetarycomputer.microsoft.com/">Microsoft Planetary Computer</a>. Basemap by{' '}
          <a href="https://openfreemap.org/">OpenFreeMap</a>, places from OpenStreetMap. The observing-system idea comes from{' '}
          <a href="https://naturalgeneralintelligence.ai/#observing-system">Natural General Intelligence</a>.
        </p>
        <p>
          Made by <a href="https://github.com/shourya0mehta">Shourya Mehta</a>.
        </p>
      </footer>
    </div>
  );
}
