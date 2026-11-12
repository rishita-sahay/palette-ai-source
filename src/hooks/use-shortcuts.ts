import { useEffect } from 'react';
import { useProjectStore } from '@/store/project-store';

/** Ctrl/⌘ Z = undo, Ctrl/⌘ Shift Z or Ctrl Y = redo. Text fields keep their own native undo. */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && !['range', 'color', 'checkbox'].includes((target as HTMLInputElement).type)))) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useProjectStore.getState().undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        useProjectStore.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
