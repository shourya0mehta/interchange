import { useEffect, useRef, useState } from 'react';
import { STATION_BY_ID } from '../network/network';
import type { Place } from '../planner/plan';
import { Globe, type Emphasis, type GlobeFocus } from '../globe/Globe';
import { ReadBackSign } from './ReadBackSign';
import { useLiveIntent, type ReadBack } from './readback';
import type { Intent } from '../planner/intent';
import { shortName } from './NetworkMap';

/** How wide each satellite's strip of ground is, for the globe's swath. */
const SWATH_KM: Record<string, number> = {
  'sentinel-2': 290,
  landsat: 185,
  'sentinel-1': 250,
  'modis-vi': 2330,
  'modis-lst': 2330,
  'modis-snow': 2330,
  'active-fire': 2330,
  oisst: 2900,
  'usda-cdl': 185,
  'esa-cci-lc': 1150,
  'io-lulc': 290,
  'esa-worldcover': 290,
  'jrc-water': 185,
  'cop-dem': 100,
};

export function emphasisFor(intent: Intent | null): Emphasis {
  if (!intent) return 'none';
  switch (intent.theme) {
    case 'ocean':
      return 'ocean';
    case 'vegetation':
    case 'cover-crop':
    case 'moisture':
    case 'forest-loss':
    case 'canopy-height':
      return 'green';
    case 'crop-type':
      return 'crops';
    case 'snow':
      return 'snow';
    case 'water':
    case 'flood':
      return 'water';
    case 'built':
    case 'night-lights':
      return 'built';
    case 'fire':
    case 'soil-moisture':
      return 'dry';
    default:
      return 'none';
  }
}

export function globeProps(intent: Intent | null, back: ReadBack | null, place: Place | null) {
  const focus: GlobeFocus | null = place
    ? { lat: (place.bbox[1] + place.bbox[3]) / 2, lon: (place.bbox[0] + place.bbox[2]) / 2, bbox: place.bbox, label: place.name }
    : null;
  const station = back?.via?.id ?? null;
  return {
    focus,
    emphasis: emphasisFor(intent),
    swathKm: station ? (SWATH_KM[station] ?? 290) : 290,
    satelliteName: station ? shortName(STATION_BY_ID[station]) : 'Sentinel-2',
  };
}

/**
 * The question box with its read-back sign. Shared by the landing page and the studio, so the
 * two behave the same: as you type, the sign says what it heard and the globe turns to it.
 */
export function AskBox({
  id,
  heading,
  sub,
  submitLabel,
  onSubmit,
  busy = false,
  pinned,
  onUnpin,
  autoFocus,
  withGlobe,
  placeholder,
  onLive,
  value,
  onValue,
}: {
  id: string;
  heading?: string;
  sub?: string;
  submitLabel: string;
  onSubmit: (text: string, place: Place | null) => void;
  busy?: boolean;
  pinned?: string | null;
  onUnpin?: () => void;
  autoFocus?: boolean;
  withGlobe?: boolean;
  placeholder?: string;
  onLive?: (l: { intent: Intent | null; back: ReadBack | null; place: Place | null }) => void;
  value?: string;
  onValue?: (v: string) => void;
}) {
  const [own, setOwn] = useState('');
  const goal = value ?? own;
  const setGoal = onValue ?? setOwn;
  const [picked, setPicked] = useState<Place | null>(null);
  const live = useLiveIntent(goal, picked);
  const [hover, setHover] = useState<string>('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    onLive?.({ intent: live.intent, back: live.back, place: live.place });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.intent, live.back, live.place]);

  const submit = () => {
    const t = goal.trim();
    if (!t) {
      ref.current?.focus();
      return;
    }
    onSubmit(t, live.place);
  };
  const g = globeProps(live.intent, live.back, live.place);

  return (
    <div className={`askbox ${withGlobe ? 'askbox-globe' : ''}`}>
      <div className="askbox-main">
        {heading && <h1 className="askbox-title">{heading}</h1>}
        {sub && <p className="askbox-sub">{sub}</p>}
        <form
          className="ask-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="sr-only" htmlFor={id}>
            Your question
          </label>
          <textarea
            id={id}
            ref={ref}
            rows={2}
            value={goal}
            onChange={(e) => {
              setGoal(e.target.value.replace(/\n/g, ' '));
              setPicked(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={pinned ? `Riding ${STATION_BY_ID[pinned].name}. What should the map show, and where?` : (placeholder ?? 'For example: snow cover in the Alps, winter 2020 vs 2024')}
            autoComplete="off"
            autoFocus={autoFocus}
          />
          <button className="btn btn-primary btn-go" type="submit" disabled={busy} aria-busy={busy}>
            <span>{busy ? 'Building' : submitLabel}</span>
          </button>
        </form>
        <ReadBackSign back={live.back} status={live.status} layout="compact" idPrefix={`${id}-rb`} />
        {pinned && (
          <p className="hint">
            Riding {STATION_BY_ID[pinned].name}.{' '}
            <button className="btn-link" onClick={onUnpin}>
              Let Interchange choose
            </button>
          </p>
        )}
      </div>
      {withGlobe && (
        <figure className="askbox-figure">
          <Globe
            {...g}
            onHover={(h) => setHover(h ? `${h.text}. ${h.where}` : '')}
            onPick={(lat, lon) => {
              const p: Place = { name: `${lat.toFixed(2)}, ${lon.toFixed(2)}`, bbox: [lon - 0.25, lat - 0.2, lon + 0.25, lat + 0.2] };
              setPicked(p);
              if (!goal.trim()) setGoal(`Greenness near ${lat.toFixed(2)}, ${lon.toFixed(2)} this summer`);
            }}
          />
          <figcaption className="globe-readout" aria-live="off">
            {hover || 'Drag to turn the planet. Click a spot to ask about it.'}
          </figcaption>
        </figure>
      )}
    </div>
  );
}
