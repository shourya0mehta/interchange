export type Step = 'ask' | 'route' | 'app';

const STEPS: { id: Step; label: string }[] = [
  { id: 'ask', label: 'Ask' },
  { id: 'route', label: 'Route' },
  { id: 'app', label: 'App' },
];

/**
 * The three steps as a line with stops: where you are is filled, where you've been can be
 * revisited, the stop ahead stays hollow until there is something there.
 */
export function JourneyNav({ current, reached, onGo }: { current: Step; reached: Record<Step, boolean>; onGo: (s: Step) => void }) {
  return (
    <nav className="journey" aria-label="Steps">
      <ol>
        {STEPS.map((s, i) => {
          const state = s.id === current ? 'current' : reached[s.id] ? 'reached' : 'ahead';
          return (
            <li key={s.id} data-state={state}>
              {i > 0 && <span className="journey-track" aria-hidden="true" />}
              {state === 'current' ? (
                <span className="journey-stop" aria-current="step">
                  <span className="journey-dot" aria-hidden="true" />
                  {s.label}
                </span>
              ) : (
                <button type="button" className="journey-stop" disabled={state === 'ahead'} onClick={() => onGo(s.id)}>
                  <span className="journey-dot" aria-hidden="true" />
                  {s.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
