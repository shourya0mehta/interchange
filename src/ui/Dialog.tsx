import { useEffect, useRef, useState, type ReactNode } from 'react';

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A native modal dialog: focus moves in, Escape closes it, the page behind is inert, and focus
 * returns to whatever opened it. Fades in, and out before it unmounts. Children get a `close`
 * that runs the exit.
 */
export function Dialog({
  labelledBy,
  onClose,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    opener.current = document.activeElement;
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => {
      const o = opener.current;
      if (o && o.isConnected && 'focus' in o) (o as HTMLElement).focus();
    };
  }, []);

  const close = () => {
    if (closing) return;
    if (reducedMotion()) onClose();
    else setClosing(true);
  };

  return (
    <dialog
      ref={ref}
      className="modal"
      data-closing={closing ? 'true' : undefined}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => e.target === e.currentTarget && close()}
      onAnimationEnd={(e) => e.target === e.currentTarget && closing && onClose()}
    >
      <div className="modal-card">{children(close)}</div>
    </dialog>
  );
}
