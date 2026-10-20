import type { ReadBack, PlaceStatus } from './readback';

/**
 * The platform sign under the question: what Interchange heard, cell by cell. Empty, it shows
 * the shape of a good question, so it doubles as the instructions.
 */
export function ReadBackSign({
  back,
  status,
  onPickPlace,
  idPrefix = 'rb',
  layout = 'wide',
}: {
  back: ReadBack | null;
  status: PlaceStatus;
  onPickPlace?: () => void;
  idPrefix?: string;
  /** wide: five across; compact: three, then two, for narrow columns. */
  layout?: 'wide' | 'compact';
}) {
  const empty = !back;
  const whereNote =
    status.state === 'looking'
      ? 'Finding it on the map'
      : status.state === 'found'
        ? 'Found on the map'
        : status.state === 'missing'
          ? "Couldn't find that place"
          : status.state === 'unsure'
            ? 'Looked up when you plan'
            : back
            ? 'No place yet'
            : null;
  return (
    <dl className={`heard heard-${layout}`} data-empty={empty || undefined} aria-label="What Interchange heard">
      <div className="heard-cell">
        <dt>What</dt>
        <dd>{back ? back.what : 'Greenness, floods, fire, snow, heat, crops, ocean temperature'}</dd>
      </div>
      <div className="heard-cell heard-where" data-state={status.state}>
        <dt>Where</dt>
        <dd>
          {back ? (status.state === 'found' ? status.place.name : (back.where ?? 'Add a place')) : 'A county, city, lake, ocean or coordinates'}
          {whereNote && (
            <span className="heard-note" id={`${idPrefix}-where`} aria-live="polite">
              {whereNote}
              {onPickPlace && (status.state === 'missing' || status.state === 'none') && back && (
                <>
                  {' '}
                  <button type="button" className="heard-link" onClick={onPickPlace}>
                    Pick it on the map
                  </button>
                </>
              )}
            </span>
          )}
        </dd>
      </div>
      <div className="heard-cell">
        <dt>When</dt>
        <dd>{back ? back.when : 'A season, a year, 2019 vs 2025, since 1999'}</dd>
      </div>
      <div className="heard-cell">
        <dt>Via</dt>
        <dd>
          {back?.via ? (
            <>
              <span className="line-badge" style={{ background: back.via.color }} aria-hidden="true" />
              {back.via.name}
              {!back.via.live && <span className="heard-note">Exports to Earth Engine</span>}
            </>
          ) : back ? (
            'No dataset fits yet'
          ) : (
            'The dataset that fits, picked for you'
          )}
        </dd>
      </div>
      <div className="heard-cell">
        <dt>Shows</dt>
        <dd>{back ? back.shows : 'A swipe, a slider, a history chart or area totals'}</dd>
      </div>
    </dl>
  );
}
