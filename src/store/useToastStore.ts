import { create } from 'zustand';

export type ToastKind = 'critical' | 'warning' | 'success' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  /** Screen route to open from the toast, e.g. 'alarms'. */
  action?: { label: string; route: string };
  /** Same key replaces the earlier toast instead of stacking (one toast per alarm, per link, ...). */
  key?: string;
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

const MAX = 5;
/** Critical toasts stay until dismissed — an operator must not miss them by looking away. */
const TTL: Record<ToastKind, number | null> = { critical: null, warning: 12_000, success: 5_000, info: 6_000 };
let seq = 0;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = ++seq;
    set((s) => {
      const rest = t.key ? s.toasts.filter((x) => x.key !== t.key) : s.toasts;
      return { toasts: [...rest, { ...t, id }].slice(-MAX) };
    });
    const ttl = TTL[t.kind];
    if (ttl) window.setTimeout(() => get().dismiss(id), ttl);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  critical: (title: string, o: Partial<Omit<Toast, 'id' | 'kind' | 'title'>> = {}) => useToastStore.getState().push({ kind: 'critical', title, ...o }),
  warning: (title: string, o: Partial<Omit<Toast, 'id' | 'kind' | 'title'>> = {}) => useToastStore.getState().push({ kind: 'warning', title, ...o }),
  success: (title: string, o: Partial<Omit<Toast, 'id' | 'kind' | 'title'>> = {}) => useToastStore.getState().push({ kind: 'success', title, ...o }),
  info: (title: string, o: Partial<Omit<Toast, 'id' | 'kind' | 'title'>> = {}) => useToastStore.getState().push({ kind: 'info', title, ...o }),
};
