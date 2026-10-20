import { useEffect } from 'react';

/** Press "/" anywhere outside a text field to jump to the question box. */
export function useSlashFocus(ids: string[]) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const el = ids.map((id) => document.getElementById(id)).find(Boolean) as HTMLInputElement | null;
      if (!el) return;
      e.preventDefault();
      el.focus();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join()]);
}
