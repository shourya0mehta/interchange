import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { encodeSpec, type AppSpec } from '../compiler/spec';
import { BASEMAP_CREDIT, creditLine, methodsNote } from '../compiler/credit';
import { earthEngineScript } from '../compiler/export-ee';
import { STATION_BY_ID } from '../network/network';
import type { Route } from '../network/types';
import { download } from '../runtime/export';
import type { AppApi } from './AppRuntime';
import { CopyButton } from './keys';
import { stationColor } from './colors';
import type { ExportFormat } from './exportImage';

type Tab = 'link' | 'embed' | 'image' | 'ee';

const slug = (s: string) => s.replace(/\W+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60);

/** Everything a person does with a finished map: a link, an embed, an image, or the script. */
export function ShareDialog({ spec, route, apiRef, onClose }: { spec: AppSpec; route?: Route; apiRef: MutableRefObject<AppApi | null>; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('link');
  const clean: AppSpec = { ...spec, questions: spec.questions?.filter((q) => q.trim()), notes: spec.notes?.trim() || undefined };
  const token = encodeSpec(clean);
  const base = `${location.origin}${location.pathname}`;
  const url = `${base}#app=${token}`;
  const embedUrl = `${base}#embed=${token}`;
  const iframe = `<iframe src="${embedUrl}" title="${spec.title.replace(/"/g, '&quot;')}" width="100%" height="520" style="border:0" loading="lazy" allow="fullscreen"></iframe>\n<p style="font-size:12px">${creditLine(spec)} ${BASEMAP_CREDIT}.</p>`;
  const st = STATION_BY_ID[spec.station];
  const [torn, setTorn] = useState(false);

  useEffect(() => {
    navigator.clipboard?.writeText(url).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs: [Tab, string][] = [
    ['link', 'Link'],
    ['embed', 'Embed'],
    ['image', 'Image'],
    ['ee', 'Earth Engine'],
  ];

  return (
    <div className="share">
      <h2 id="modal-title">Publish</h2>
      <div className="share-tabs" role="tablist" aria-label="Ways to publish">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls={`panel-${k}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'link' && (
        <div role="tabpanel" id="panel-link" aria-labelledby="tab-link">
          <div className="ticket" data-torn={torn || undefined} style={{ ['--route-color' as string]: stationColor(st) }}>
            <div className="ticket-main">
              <span className="ticket-kicker">One app, no login</span>
              <strong className="ticket-title">{spec.title}</strong>
              <dl className="ticket-route">
                <div>
                  <dt>From</dt>
                  <dd>{st.name}</dd>
                </div>
                <div>
                  <dt>To</dt>
                  <dd>{spec.aoi.name}</dd>
                </div>
                <div>
                  <dt>When</dt>
                  <dd>{spec.windows.length > 2 ? `${spec.windows[0].label} to ${spec.windows[spec.windows.length - 1].label}` : spec.windows.map((w) => w.label).join(' vs ')}</dd>
                </div>
              </dl>
            </div>
            <div className="ticket-stub" aria-hidden="true">
              <span>Admit all</span>
            </div>
          </div>
          <p>The link holds the whole app, so it opens for anyone, with nothing stored on a server. It's on your clipboard.</p>
          <pre className="share-code">{url}</pre>
          <div className="route-actions">
            <span onClick={() => setTorn(true)}>
              <CopyButton text={url} label="Copy link" />
            </span>
            <a className="btn" href={url} target="_blank" rel="noreferrer">
              Open the app
            </a>
          </div>
        </div>
      )}

      {tab === 'embed' && (
        <div role="tabpanel" id="panel-embed" aria-labelledby="tab-embed">
          <p>Paste this into a story, a course page or a newsletter. The credit line underneath uses each data provider's own wording.</p>
          <pre className="share-code">{iframe}</pre>
          <div className="route-actions">
            <CopyButton text={iframe} label="Copy embed code" />
            <a className="btn" href={embedUrl} target="_blank" rel="noreferrer">
              Preview the embed
            </a>
          </div>
          <h3>How this map was made</h3>
          <p className="methods">{methodsNote(spec)}</p>
          <CopyButton text={methodsNote(spec)} label="Copy the methods note" primary={false} />
        </div>
      )}

      {tab === 'image' && <ImagePanel spec={spec} apiRef={apiRef} />}

      {tab === 'ee' && (
        <div role="tabpanel" id="panel-ee" aria-labelledby="tab-ee">
          <p>The same map as an Earth Engine script, for the full area and full resolution. Paste it into the Earth Engine Code Editor and press Run.</p>
          <pre className="share-code">{route ? earthEngineScript(route) : '// Open this app in the studio to get its script.'}</pre>
          {route && <CopyButton text={earthEngineScript(route)} label="Copy script" />}
        </div>
      )}

      <div className="route-actions share-done">
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

function ImagePanel({ spec, apiRef }: { spec: AppSpec; apiRef: MutableRefObject<AppApi | null> }) {
  const [format, setFormat] = useState<ExportFormat>('wide');
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [state, setState] = useState<'idle' | 'drawing' | 'error'>('idle');
  const last = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    const api = apiRef.current;
    if (!api) {
      setState('error');
      return;
    }
    setState('drawing');
    api
      .exportImage(format)
      .then((blob) => {
        if (!alive) return;
        if (last.current) URL.revokeObjectURL(last.current);
        const u = URL.createObjectURL(blob);
        last.current = u;
        setPreview({ url: u, blob });
        setState('idle');
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [format, apiRef]);

  useEffect(() => () => void (last.current && URL.revokeObjectURL(last.current)), []);

  return (
    <div role="tabpanel" id="panel-image" aria-labelledby="tab-image">
      <p>A picture of the map as it is on screen, with the title, dates, legend and credit line. Ready for a slide, a story or a post.</p>
      <div className="toggle" role="group" aria-label="Image shape">
        <button aria-pressed={format === 'wide'} onClick={() => setFormat('wide')}>
          16:9 for slides
        </button>
        <button aria-pressed={format === 'square'} onClick={() => setFormat('square')}>
          Square for posts
        </button>
      </div>
      <div className="image-preview" data-state={state}>
        {preview && <img src={preview.url} alt={`Preview of the image: ${spec.title}`} />}
        {state === 'drawing' && <span className="hint">Drawing</span>}
        {state === 'error' && <span className="error">Couldn't draw the image. Wait for the map to finish loading, then try again.</span>}
      </div>
      <div className="route-actions">
        <button className="btn btn-primary" disabled={!preview || state !== 'idle'} onClick={() => preview && download(`${slug(spec.title)}-${format === 'wide' ? '16x9' : 'square'}.png`, preview.blob, 'image/png')}>
          Download PNG
        </button>
      </div>
    </div>
  );
}
