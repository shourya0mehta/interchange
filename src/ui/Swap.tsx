import { useRef, useState, type AnimationEvent, type ReactNode } from 'react';

/**
 * Switches between screens with a short fade: the old one fades out on the exit curve and is
 * removed when its animation ends, then the new one fades in. Under reduced motion the global
 * rule shortens both to a millisecond, so the swap is effectively instant.
 */
export function Swap({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) {
  const [shown, setShown] = useState(id);
  const last = useRef<ReactNode>(children);
  const leaving = shown !== id;
  if (!leaving) last.current = children;
  const onEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && leaving) setShown(id);
  };
  return (
    // Keyed by what's on screen, so the leaving view keeps its state (a live map) while it fades.
    <div key={shown} className={`swap ${leaving ? 'swap-leave' : 'swap-enter'} ${className}`} onAnimationEnd={onEnd} aria-busy={leaving || undefined}>
      {leaving ? last.current : children}
    </div>
  );
}
