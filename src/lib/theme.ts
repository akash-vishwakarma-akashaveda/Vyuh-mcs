import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';
const KEY = 'vyuh-theme';
const listeners = new Set<() => void>();

const read = (): Theme => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch { /* storage blocked */ }
  return 'dark';
};

let current: Theme = read();
const apply = () => { document.documentElement.dataset.theme = current; };

/** Call once before first render so there is no flash of the wrong theme. */
export const initTheme = apply;

export function setTheme(t: Theme) {
  current = t;
  apply();
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export const toggleTheme = () => setTheme(current === 'dark' ? 'light' : 'dark');

export function useTheme(): Theme {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => current);
}
