import { useEffect, useRef, useState } from 'react';

const FLAPS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function reduced(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Text that changes like a departure board: each letter flips through a few others before it
 * settles, left to right. Screen readers get the final text only.
 */
export function SplitFlap({ text, className = '', speed = 1 }: { text: string; className?: string; speed?: number }) {
  const [shown, setShown] = useState(text);
  const from = useRef(text);
  const raf = useRef(0);

  useEffect(() => {
    if (text === from.current) return;
    const start = performance.now();
    const old = from.current;
    from.current = text;
    if (reduced()) {
      setShown(text);
      return;
    }
    const len = Math.max(old.length, text.length);
    const per = 22 / speed;
    const flips = 4;
    const tick = (now: number) => {
      const t = now - start;
      let out = '';
      let done = true;
      for (let i = 0; i < len; i++) {
        const settleAt = (i * per) / 2 + flips * per;
        const target = text[i] ?? '';
        if (t >= settleAt || target === ' ' || target === old[i]) out += target;
        else {
          done = false;
          const step = Math.floor(t / per) + i;
          out += /[A-Za-z0-9]/.test(target) ? FLAPS[(step * 7 + i * 3) % FLAPS.length] : target;
        }
      }
      setShown(out);
      if (!done) raf.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [text, speed]);

  return (
    <span className={`flap ${className}`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{shown}</span>
    </span>
  );
}
