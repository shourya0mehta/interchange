import { useEffect, useRef } from 'react';
import { LINE_BY_ID, STATION_BY_ID } from '../network/network';

export function Dossier({ id, onClose, onPlan }: { id: string; onClose: () => void; onPlan: (id: string) => void }) {
  const s = STATION_BY_ID[id];
  const closeRef = useRef<HTMLButtonElement>(null);
  // Remember what opened the dossier so focus goes back there when it closes.
  useEffect(() => {
    const opener = document.activeElement;
    return () => {
      if (opener && opener.isConnected && 'focus' in opener) (opener as HTMLElement).focus();
    };
  }, []);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, onClose]);
  if (!s) return null;
  const status = s.live ? 'Runs live in your browser' : s.temporal === 'in-situ' ? 'Ground network: start from the Python tools below' : 'Export to Earth Engine';
  return (
    <aside className="dossier" role="dialog" aria-modal="false" aria-labelledby="dossier-name">
      <div className="sign">
        <div className="bullets" aria-label={`Lines: ${s.lines.map((l) => LINE_BY_ID[l].name).join(', ')}`}>
          {s.lines.map((l) => (
            <span key={l} className="bullet" style={{ background: LINE_BY_ID[l].color }} title={LINE_BY_ID[l].name}>
              {LINE_BY_ID[l].name[0]}
            </span>
          ))}
        </div>
        <div className="sign-name" id="dossier-name">
          {s.name}
        </div>
        <div className="sign-family">{s.family}</div>
        <button ref={closeRef} className="sign-close" onClick={onClose} aria-label="Close station">
          ×
        </button>
      </div>
      <div className="dossier-body">
        <p style={{ marginTop: 0 }}>{s.measures}</p>
        <div className="status">{status}</div>
        <dl className="specs">
          <dt>Detail</dt>
          <dd>{s.specs.resolution}</dd>
          <dt>Looks</dt>
          <dd>{s.specs.revisit}</dd>
          <dt>Years</dt>
          <dd>{s.specs.years}</dd>
          <dt>License</dt>
          <dd>{s.specs.license}</dd>
        </dl>
        <h3>Good at</h3>
        <ul className="plain-list">
          {s.goodAt.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
        <h3>Watch out for</h3>
        <ul className="plain-list">
          {s.badAt.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
        <h3>Where to get it</h3>
        <ul className="plain-list">
          {s.access.earthEngine && (
            <li>
              Earth Engine <span className="id">{s.access.earthEngine}</span>
            </li>
          )}
          {s.access.stac && (
            <li>
              STAC <span className="id">{s.access.stac}</span>
            </li>
          )}
          {s.access.other && (
            <li>
              <span className="id">{s.access.other}</span>
            </li>
          )}
        </ul>
        <h3>Tools that work with it</h3>
        <ul className="plain-list">
          {s.tools.map((t) => (
            <li key={t.name}>
              <a href={t.url} target="_blank" rel="noreferrer">
                {t.name}
              </a>
              : {t.what}
            </li>
          ))}
        </ul>
        {s.temporal !== 'in-situ' && (
          <div className="route-actions">
            <button className="btn btn-primary" onClick={() => onPlan(s.id)}>
              Plan a route from {s.name}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
