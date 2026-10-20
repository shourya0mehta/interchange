import { useEffect, useRef, useState } from 'react';
import { decodeJourney } from '../compiler/journey';
import { creditLine } from '../compiler/credit';
import { encodeSpec } from '../compiler/spec';
import { STATION_BY_ID } from '../network/network';
import { AppRuntime } from './AppRuntime';
import { BrandMark } from './BrandMark';
import { Swap } from './Swap';
import { stationColor } from './colors';

/**
 * A published journey: captions down one side, one map at a time on the other. The stop in the
 * middle of the reader's screen is the map they see.
 */
export function JourneyView({ token }: { token: string }) {
  const journey = decodeJourney(token);
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (journey) document.title = `${journey.title} | Interchange`;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!journey) {
    return (
      <main style={{ padding: 24, maxWidth: 560 }}>
        <h1>This journey link is damaged</h1>
        <p>
          The link may have been cut off when it was copied. Ask for it again, or <a href="./">make your own</a>.
        </p>
      </main>
    );
  }
  const base = `${location.origin}${location.pathname}`;
  const stop = journey.stops[Math.min(active, journey.stops.length - 1)];

  return (
    <div className="journey-shell">
      <header className="band published-band">
        <a className="brand" href="./" aria-label="Interchange, home">
          <BrandMark />
          <span>Interchange</span>
        </a>
        <span className="band-spacer" />
        <a className="btn btn-signal" href="#build">
          Make your own map
        </a>
      </header>
      <main className="trip">
        <div className="journey-text">
          <header className="journey-head">
            <span className="journey-kicker">A journey in {journey.stops.length} stops</span>
            <h1>{journey.title}</h1>
            {journey.intro && <p>{journey.intro}</p>}
          </header>
          <ol className="journey-stops">
            {journey.stops.map((s, i) => {
              const st = STATION_BY_ID[s.spec.station];
              return (
                <li
                  key={i}
                  data-i={i}
                  data-active={i === active || undefined}
                  data-passed={i < active || undefined}
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  style={{ ['--route-color' as string]: stationColor(st) }}
                >
                  <span className="journey-dot" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h2>{s.spec.title}</h2>
                  <p className="journey-when">{s.spec.windows.length > 2 ? `${s.spec.windows[0].label} to ${s.spec.windows[s.spec.windows.length - 1].label}` : s.spec.windows.map((w) => w.label).join(' vs ')}</p>
                  {s.caption && <p className="journey-caption">{s.caption}</p>}
                  <p className="journey-credit">{creditLine(s.spec)}</p>
                  <a className="journey-open" href={`${base}#app=${encodeSpec(s.spec)}`}>
                    Open this map on its own
                  </a>
                </li>
              );
            })}
          </ol>
          <p className="journey-end">End of the line. Made with Interchange from open satellite data.</p>
        </div>
        <div className="journey-map" aria-label={`Map for stop ${active + 1}: ${stop.spec.title}`}>
          <Swap id={String(active)} className="swap-view">
            <AppRuntime spec={stop.spec} mode="embed" openUrl={`${base}#app=${encodeSpec(stop.spec)}`} />
          </Swap>
        </div>
      </main>
    </div>
  );
}
