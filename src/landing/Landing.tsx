import { useEffect, useMemo, useState } from 'react';
import { compileRoute, encodeSpec } from '../compiler/spec';
import { LINE_BY_ID, STATIONS, STATION_BY_ID } from '../network/network';
import { parseGoal } from '../planner/intent';
import { planRoutes, type Place } from '../planner/plan';
import { BrandMark } from '../ui/BrandMark';
import { Dossier } from '../ui/Dossier';
import { MapKey, NetworkMap, shortName } from '../ui/NetworkMap';
import { ReadBackSign } from '../ui/ReadBackSign';
import { RouteStrip } from '../ui/RouteStrip';
import { useLiveIntent } from '../ui/readback';
import { HeroMap } from './HeroMap';

const REPO = 'https://github.com/shourya0mehta/interchange';
const base = () => `${location.origin}${location.pathname}`;

/** Questions the hero types for itself until someone starts typing. Places are fixed, so no lookups. */
const DEMO: { q: string; place: Place }[] = [
  { q: 'sea surface temperature in the north atlantic since 1999', place: { name: 'North Atlantic Ocean', bbox: [-82, 0, 0, 66] } },
  { q: 'compare greenness of fields in fresno county, summer 2019 vs 2025', place: { name: 'Fresno County, California', bbox: [-120.92, 35.9, -118.36, 37.59] } },
  { q: 'what crops grew around ames, iowa in 2021', place: { name: 'Ames, Iowa', bbox: [-93.75, 41.95, -93.5, 42.1] } },
  { q: 'flooding in houston before and after hurricane harvey', place: { name: 'Houston, Texas', bbox: [-95.79, 29.52, -95.01, 30.11] } },
  { q: 'snow cover in the sierra nevada each winter since 2018', place: { name: 'Sierra Nevada', bbox: [-121.5, 35.4, -117.8, 40.3] } },
  { q: 'urban heat island in phoenix, summer 2025', place: { name: 'Phoenix, Arizona', bbox: [-112.32, 33.29, -111.93, 33.92] } },
];

/** Real apps for the departures board, each compiled here and opened from its link. */
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

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Types example questions into the hero's placeholder until the visitor takes over. */
function useDemo(active: boolean): number {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active || reducedMotion()) return;
    const t = setInterval(() => setI((n) => (n + 1) % DEMO.length), 4200);
    return () => clearInterval(t);
  }, [active]);
  return i;
}

function useTyped(text: string, active: boolean): string {
  const [n, setN] = useState(text.length);
  useEffect(() => {
    if (!active || reducedMotion()) {
      setN(text.length);
      return;
    }
    setN(0);
    const t = setInterval(() => setN((k) => (k >= text.length ? k : k + 1)), 26);
    return () => clearInterval(t);
  }, [text, active]);
  return text.slice(0, n);
}

function departures() {
  return DEPARTURES.map((d) => {
    const plan = planRoutes(parseGoal(d.q), d.place);
    const route = plan.routes.find((r) => r.runs === 'live');
    const spec = route ? compileRoute(route, d.q).spec : null;
    const st = route ? STATION_BY_ID[route.station] : null;
    const shows = route?.views.includes('swipe')
      ? 'Swipe'
      : route?.views.includes('time-slider')
        ? 'Slider'
        : route?.views.includes('click-chart')
          ? 'History chart'
          : route?.views.includes('region-stats')
            ? 'Area totals'
            : 'Map';
    return { ...d, route, spec, st, shows, when: route?.when ?? '' };
  }).filter((d) => d.spec && d.st);
}

export function Landing() {
  const [goal, setGoal] = useState('');
  const [focused, setFocused] = useState(false);
  const [dossier, setDossier] = useState<string | null>(null);
  const demoOn = !goal && !focused;
  const demoIdx = useDemo(demoOn);
  const demo = DEMO[demoIdx];
  const typed = useTyped(demo.q, demoOn);
  const effective = goal || demo.q;
  const live = useLiveIntent(effective, goal ? null : demo.place);
  const back = live.back;
  const primary = back?.via?.id ?? null;
  const color = back?.via?.color ?? '#000';
  const deps = useMemo(departures, []);
  const liveCount = STATIONS.filter((s) => s.live).length;
  const exportCount = STATIONS.length - liveCount;
  const sampleRoute = deps[0]?.route ?? null;

  useEffect(() => {
    document.title = 'Interchange: satellite map apps from a sentence';
  }, []);

  const build = (q: string) => {
    location.hash = `build?q=${encodeURIComponent(q)}`;
  };

  return (
    <div className="landing">
      <header className="band landing-band">
        <a className="brand" href="#" aria-label="Interchange, home">
          <BrandMark />
          <span>Interchange</span>
        </a>
        <nav className="landing-nav" aria-label="Site">
          <a href="#how">How it works</a>
          <a href="#departures">Examples</a>
          <a href="#network">Datasets</a>
          <a href={REPO}>GitHub</a>
        </nav>
        <a className="btn" href="#build">
          Open the builder
        </a>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title">Every dataset is a station. Your question is the route.</h1>
            <p className="hero-sub">
              Type what you want to see and where. Interchange picks the satellites, lays out every step in the open, and builds a live map app anyone can open from a
              link. You don't write code or make an account.
            </p>
            <form
              className="hero-ask"
              onSubmit={(e) => {
                e.preventDefault();
                build(goal || demo.q);
              }}
            >
              <label className="sr-only" htmlFor="hero-goal">
                What do you want to see, and where?
              </label>
              <input
                id="hero-goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={demoOn ? typed : 'What do you want to see, and where?'}
                autoComplete="off"
              />
              <button className="btn btn-primary" type="submit">
                Build this map
              </button>
            </form>
            <ReadBackSign back={back} status={live.status} idPrefix="hero" layout="compact" />
          </div>
          <div className="hero-figure">
            <HeroMap lit={back?.stations ?? []} primary={primary} shows={back?.shows ?? ''} color={color} />
          </div>
        </section>

        <section className="how" id="how" aria-labelledby="how-title">
          <h2 id="how-title">From a sentence to an app in three stops</h2>
          <ol className="stops">
            <li>
              <div className="stop-text">
                <h3>Ask</h3>
                <p>
                  Write it the way you'd say it: lowercase, misspelled, with a county, a lake, an ocean or a pair of coordinates. Before anything runs, Interchange reads back
                  what it heard, so you can see a wrong guess and fix it.
                </p>
              </div>
              <div className="stop-figure">
                <ReadBackSign
                  back={{ what: 'Ocean temperature', where: 'North Atlantic Ocean', when: '1999 to now', via: { id: 'oisst', name: 'Sea surface temp', line: 'hydrosphere', color: LINE_BY_ID.hydrosphere.color, live: true }, shows: 'Click for history', stations: [] }}
                  status={{ state: 'found', place: { name: 'North Atlantic Ocean', bbox: [-82, 0, 0, 66] }, phrase: 'north atlantic' }}
                  idPrefix="how"
                  layout="compact"
                />
              </div>
            </li>
            <li>
              <div className="stop-text">
                <h3>Pick a route</h3>
                <p>
                  It lays out two or three routes through the observing system, each with its trade-offs: how much detail, how often it looks, how far back it goes, whether
                  clouds get in the way. Every stop on a route can be swapped, and routes that can't work are refused before they run.
                </p>
              </div>
              <div className="stop-figure stop-route" style={{ ['--route-color' as string]: sampleRoute ? LINE_BY_ID[STATION_BY_ID[sampleRoute.station].lines[0]].color : '#000' }}>
                {sampleRoute && (
                  <>
                    <p className="stop-route-title">{sampleRoute.title}</p>
                    <RouteStrip route={sampleRoute} active={null} animate={false} />
                  </>
                )}
              </div>
            </li>
            <li>
              <div className="stop-text">
                <h3>Share the app</h3>
                <p>
                  The route becomes a live map: swipe between two dates, step through the years, click any spot for its history, read area totals, download the data. Publishing
                  is copying a link. The whole app lives in it, so there is no server to keep running.
                </p>
              </div>
              <div className="stop-figure">
                <img src={`${import.meta.env.BASE_URL}shots/app-swipe.jpg`} alt="A published app: Fresno County greenness, summer 2019 on the left and 2025 on the right, with a swipe handle between them" loading="lazy" width={1440} height={900} />
              </div>
            </li>
          </ol>
        </section>

        <section className="departures" id="departures" aria-labelledby="dep-title">
          <div className="departures-head">
            <h2 id="dep-title">Departures</h2>
            <p>Real apps, each one a link. The data loads live from open catalogs when you open it, so give a big area a few seconds.</p>
          </div>
          <table className="board">
            <thead>
              <tr>
                <th scope="col">To</th>
                <th scope="col">Line</th>
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
            <h2 id="net-title">The network</h2>
            <p>
              {STATIONS.length} datasets on five lines, one for each part of the Earth system. {liveCount} run live in your browser, read straight from open cloud storage.
              The other {exportCount} are on the map so you can see what exists; routes through them end in an Earth Engine script. Tap a station to see what it measures and
              what it's bad at.
            </p>
          </div>
          <div className="network-scroll">
            <NetworkMap selected={dossier} highlight={[]} onSelect={setDossier} />
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
            <h2 id="compare-title">Why not Earth Engine's App Builder?</h2>
            <p>Earth Engine is the right tool for heavy analysis, and Interchange exports to it. For a map app that answers one question, the trade-offs look like this.</p>
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
                <td>One sentence, then edit the route if you want</td>
              </tr>
              <tr>
                <th scope="row">Choosing data</th>
                <td>You find the dataset ID, bands and scale factors</td>
                <td>Picked from a curated catalog, with the trade-offs shown</td>
              </tr>
              <tr>
                <th scope="row">Where it runs</th>
                <td>Google's servers, against the publisher's Cloud project</td>
                <td>The viewer's browser, reading open data directly</td>
              </tr>
              <tr>
                <th scope="row">Keeping it online</th>
                <td>The publisher's quota pays for every visit</td>
                <td>Nothing to host: the link holds the whole app</td>
              </tr>
              <tr>
                <th scope="row">Heavy jobs</th>
                <td>Built for them</td>
                <td>Hands them off as an Earth Engine script</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="riders" aria-labelledby="riders-title">
          <h2 id="riders-title">Who it's for</h2>
          <ul>
            <li>
              <h3>Researchers</h3>
              <p>A map app for a paper, a poster or a talk, without a week of scripting.</p>
            </li>
            <li>
              <h3>Students</h3>
              <p>Learning what each satellite can and can't see by riding different routes to the same question.</p>
            </li>
            <li>
              <h3>Extension agents and advisors</h3>
              <p>Answering a grower's question about one field, with a link they can open on a phone.</p>
            </li>
            <li>
              <h3>Reporters and NGOs</h3>
              <p>Checking a flood, a fire or a heat wave against the satellite record, and showing the work.</p>
            </li>
          </ul>
        </section>

        <section className="limits" aria-labelledby="limits-title">
          <h2 id="limits-title">What it can't do yet</h2>
          <ul>
            <li>Long composites over very large areas. The browser previews as much of a place as each dataset reads quickly, from a county for Sentinel-2 to a whole ocean for sea temperature, and exports the rest.</li>
            <li>{exportCount} of the {STATIONS.length} datasets, including air quality, soil moisture and night lights, aren't readable in the browser yet.</li>
            <li>The built-in reader handles plain sentences. Looser ones read better with your own Claude API key, which stays in your browser.</li>
            <li>No accounts, uploads or private data. Everything is open data.</li>
          </ul>
          <div className="route-actions">
            <a className="btn btn-primary" href="#build">
              Open the builder
            </a>
            <a className="btn" href={REPO}>
              Read the code
            </a>
          </div>
        </section>
      </main>

      <footer className="landing-foot">
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
