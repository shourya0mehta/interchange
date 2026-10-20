import { useState } from 'react';
import { encodeJourney, type Journey, type JourneyStop } from '../compiler/journey';
import { STATION_BY_ID } from '../network/network';
import { CopyButton } from './keys';
import { stationColor } from './colors';

/** Put the stops in order, caption them, and publish the journey as one link. */
export function JourneyEditor({
  title,
  stops,
  onTitle,
  onStops,
  onClose,
}: {
  title: string;
  stops: JourneyStop[];
  onTitle: (t: string) => void;
  onStops: (s: JourneyStop[]) => void;
  onClose: () => void;
}) {
  const [published, setPublished] = useState<string | null>(null);
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= stops.length) return;
    const next = stops.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onStops(next);
  };
  const publish = () => {
    const j: Journey = { v: 1, title: title.trim() || 'A journey', stops, createdAt: new Date().toISOString().slice(0, 10) };
    const url = `${location.origin}${location.pathname}#journey=${encodeJourney(j)}`;
    navigator.clipboard?.writeText(url).catch(() => undefined);
    setPublished(url);
  };
  return (
    <div className="journey-editor">
      <h2 id="modal-title">Your journey</h2>
      <p>Several maps in order, each with a caption, published as one scrolling story. Readers see each map as they reach its stop.</p>
      <label className="field">
        Title
        <input value={title} onChange={(e) => onTitle(e.target.value)} placeholder="Three summers in the Central Valley" />
      </label>
      <ol className="je-stops">
        {stops.map((s, i) => (
          <li key={`${s.spec.title}-${i}`} style={{ ['--route-color' as string]: stationColor(STATION_BY_ID[s.spec.station]) }}>
            <span className="journey-dot" aria-hidden="true">
              {i + 1}
            </span>
            <div className="je-body">
              <strong>{s.spec.title}</strong>
              <span className="hint">{s.spec.windows.map((w) => w.label).join(', ')}</span>
              <label className="sr-only" htmlFor={`cap-${i}`}>
                Caption for stop {i + 1}
              </label>
              <textarea id={`cap-${i}`} rows={2} value={s.caption} placeholder="What should readers see here?" onChange={(e) => onStops(stops.map((x, k) => (k === i ? { ...x, caption: e.target.value } : x)))} />
            </div>
            <div className="je-tools">
              <button className="chip" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move stop ${i + 1} up`}>
                Up
              </button>
              <button className="chip" onClick={() => move(i, 1)} disabled={i === stops.length - 1} aria-label={`Move stop ${i + 1} down`}>
                Down
              </button>
              <button className="chip" onClick={() => onStops(stops.filter((_, k) => k !== i))} aria-label={`Remove stop ${i + 1}`}>
                Remove
              </button>
            </div>
          </li>
        ))}
      </ol>
      {published ? (
        <>
          <p>Your journey is live, and the link is on your clipboard.</p>
          <pre className="share-code">{published}</pre>
          <div className="route-actions">
            <CopyButton text={published} label="Copy link" />
            <a className="btn" href={published} target="_blank" rel="noreferrer">
              Open the journey
            </a>
            <button className="btn" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      ) : (
        <div className="route-actions">
          <button className="btn btn-primary" onClick={publish} disabled={!stops.length}>
            <span>Publish the journey</span>
          </button>
          <button className="btn" onClick={onClose}>
            Keep building
          </button>
        </div>
      )}
    </div>
  );
}
