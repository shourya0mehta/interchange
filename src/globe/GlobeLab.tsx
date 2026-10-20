import { useState } from 'react';
import { Globe, type Emphasis } from './Globe';

/** A bench for the globe: #lab-globe. Not linked from anywhere. */
export function GlobeLab() {
  const [hover, setHover] = useState<string>('');
  const [emphasis, setEmphasis] = useState<Emphasis>('none');
  const [focus, setFocus] = useState<{ lat: number; lon: number; bbox?: [number, number, number, number] } | null>(null);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', height: '100vh', background: '#F3F2EE' }}>
      <Globe emphasis={emphasis} focus={focus} satelliteName="Sentinel-2" onHover={(h) => setHover(h ? `${h.text}, ${h.where}` : '')} onPick={(lat, lon) => setFocus({ lat, lon, bbox: [lon - 3, lat - 2, lon + 3, lat + 2] })} />
      <div style={{ padding: 16 }}>
        <p data-testid="hover">{hover}</p>
        {(['none', 'ocean', 'green', 'crops', 'snow', 'built', 'dry'] as Emphasis[]).map((e) => (
          <button key={e} onClick={() => setEmphasis(e)}>
            {e}
          </button>
        ))}
        <button onClick={() => setFocus({ lat: 36.8, lon: -119.8, bbox: [-120.9, 35.9, -118.4, 37.6] })}>Fresno</button>
        <button onClick={() => setFocus({ lat: 30, lon: -40, bbox: [-80, 0, -10, 60] })}>Atlantic</button>
      </div>
    </div>
  );
}
