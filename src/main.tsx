import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-sans-condensed/500.css';
import '@fontsource/ibm-plex-sans-condensed/600.css';
import '@fontsource/ibm-plex-sans-condensed/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import './landing.css';
import './studio.css';
import './home.css';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { decodeSpec } from './compiler/spec';
import { setUrlSigner } from './runtime/cog';
import { signPlanetaryComputer } from './runtime/stac';
import { Landing } from './landing/Landing';
import { AppRuntime } from './ui/AppRuntime';
import { BrandMark } from './ui/BrandMark';
import { Studio } from './ui/Studio';
import { Swap } from './ui/Swap';

setUrlSigner(signPlanetaryComputer);

type Screen =
  | { kind: 'landing' }
  | { kind: 'app'; token: string }
  | { kind: 'embed'; token: string }
  | { kind: 'build'; fork: string | null; q: string | null; station: string | null };

/** Hash routes, so the static site needs no server rewrites: #app=, #fork=, #build?q=, or the landing page. */
function readHash(): Screen {
  const h = location.hash.slice(1);
  if (h.startsWith('app=')) return { kind: 'app', token: h.slice(4) };
  if (h.startsWith('embed=')) return { kind: 'embed', token: h.slice(6) };
  if (h.startsWith('fork=')) return { kind: 'build', fork: h.slice(5), q: null, station: null };
  if (h === 'build' || h.startsWith('build?') || h.startsWith('build/')) {
    const params = new URLSearchParams(h.split('?')[1] ?? '');
    return { kind: 'build', fork: null, q: params.get('q'), station: params.get('station') };
  }
  return { kind: 'landing' };
}

function Published({ token }: { token: string }) {
  const spec = decodeSpec(token);
  if (!spec) {
    return (
      <main style={{ padding: 24, maxWidth: 560 }}>
        <h1>This app link is damaged</h1>
        <p>The link may have been cut off when it was copied. Ask for it again, or <a href="./">build your own</a>.</p>
      </main>
    );
  }
  document.title = `${spec.title} | Interchange`;
  return (
    <div className="shell">
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
      <main className="view">
        <AppRuntime spec={spec} mode="published" onFork={() => (location.hash = `fork=${token}`)} />
      </main>
    </div>
  );
}

function Embedded({ token }: { token: string }) {
  const spec = decodeSpec(token);
  if (!spec) return <p style={{ padding: 16 }}>This embedded map's link is damaged.</p>;
  document.title = `${spec.title} | Interchange`;
  return <AppRuntime spec={spec} mode="embed" openUrl={`${location.origin}${location.pathname}#app=${token}`} />;
}

function Root() {
  const [screen, setScreen] = useState(readHash);
  useEffect(() => {
    const on = () => {
      const next = readHash();
      setScreen((prev) => {
        // In-page anchors on the landing page keep their scroll; switching screens starts at the top.
        if (prev.kind !== next.kind) window.scrollTo(0, 0);
        return prev.kind === 'landing' && next.kind === 'landing' ? prev : next;
      });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const key = screen.kind === 'app' || screen.kind === 'embed' ? `${screen.kind}|${screen.token}` : screen.kind === 'build' ? `build|${screen.fork}|${screen.q}|${screen.station}` : 'landing';
  let body;
  if (screen.kind === 'app') body = <Published token={screen.token} />;
  else if (screen.kind === 'embed') body = <Embedded token={screen.token} />;
  else if (screen.kind === 'build') {
    document.title = 'Interchange studio';
    body = <Studio forkToken={screen.fork} initialGoal={screen.q} initialStation={screen.station} />;
  } else body = <Landing />;
  return (
    <Swap id={key} className="swap-screen">
      {body}
    </Swap>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
