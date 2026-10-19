import '@fontsource/overpass/400.css';
import '@fontsource/overpass/600.css';
import '@fontsource/overpass/700.css';
import '@fontsource/overpass/800.css';
import '@fontsource/overpass-mono/400.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { decodeSpec } from './compiler/spec';
import { setUrlSigner } from './runtime/cog';
import { signPlanetaryComputer } from './runtime/stac';
import { AppRuntime } from './ui/AppRuntime';
import { Builder } from './ui/Builder';

setUrlSigner(signPlanetaryComputer);

function readHash(): { app: string | null; fork: string | null } {
  const h = location.hash.slice(1);
  if (h.startsWith('app=')) return { app: h.slice(4), fork: null };
  if (h.startsWith('fork=')) return { app: null, fork: h.slice(5) };
  return { app: null, fork: null };
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
    <div className="shell" style={{ gridTemplateRows: '1fr' }}>
      <main className="view">
        <AppRuntime spec={spec} mode="published" onFork={() => (location.hash = `fork=${token}`)} />
      </main>
    </div>
  );
}

function Root() {
  const [hash, setHash] = useState(readHash);
  useEffect(() => {
    const on = () => setHash(readHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  if (hash.app) return <Published token={hash.app} />;
  return <Builder forkToken={hash.fork} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
