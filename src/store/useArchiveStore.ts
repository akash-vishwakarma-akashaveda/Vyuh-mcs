import { create } from 'zustand';

/** What to retrieve from the archive. Times are epoch ms (UTC). */
export interface ArchiveQuery {
  sats: string[];
  params: string[];
  preset: '1 h' | '6 h' | '24 h' | '7 d' | 'Custom';
  from: number;
  to: number;
  alarms: boolean;
  commands: boolean;
  events: boolean;
}

export interface SavedQuery { id: string; name: string; query: ArchiveQuery; savedBy: string; savedAt: number }

/** A generated report: a plain table, so it can be shown and exported the same way. */
export interface Report {
  id: string;
  kind: 'pass' | 'availability';
  title: string;
  note: string;
  generatedAt: number;
  generatedBy: string;
  columns: string[];
  rows: (string | number)[][];
  reconstructed: boolean;
}

interface ArchiveStore {
  query: ArchiveQuery;
  /** The query the results on screen were run for (null before the first run). */
  ran: { query: ArchiveQuery; at: number; by: string } | null;
  saved: SavedQuery[];
  reports: Report[];
  setQuery: (q: Partial<ArchiveQuery>) => void;
  run: (by: string) => void;
  saveQuery: (name: string, by: string) => void;
  deleteQuery: (id: string) => void;
  addReport: (r: Report) => void;
  deleteReport: (id: string) => void;
}

const HOUR = 3600_000;
export const PRESET_MS: Record<Exclude<ArchiveQuery['preset'], 'Custom'>, number> = { '1 h': HOUR, '6 h': 6 * HOUR, '24 h': 24 * HOUR, '7 d': 7 * 24 * HOUR };

/** Resolve a preset to concrete times at the moment it is run. */
export const resolve = (q: ArchiveQuery): ArchiveQuery =>
  q.preset === 'Custom' ? q : { ...q, to: Date.now(), from: Date.now() - PRESET_MS[q.preset] };

const id = () => Math.random().toString(36).slice(2, 10).toUpperCase();

export const useArchiveStore = create<ArchiveStore>((set, get) => ({
  query: { sats: ['AKV-03'], params: ['BAT_TEMP', 'HTR_A_DUTY'], preset: '6 h', from: Date.now() - 6 * HOUR, to: Date.now(), alarms: true, commands: true, events: true },
  ran: null,
  saved: [],
  reports: [],
  setQuery: (q) => set((s) => ({ query: { ...s.query, ...q } })),
  run: (by) => set((s) => ({ ran: { query: resolve(s.query), at: Date.now(), by } })),
  saveQuery: (name, by) => set((s) => ({ saved: [{ id: `Q-${id()}`, name, query: get().query, savedBy: by, savedAt: Date.now() }, ...s.saved] })),
  deleteQuery: (qid) => set((s) => ({ saved: s.saved.filter((x) => x.id !== qid) })),
  addReport: (r) => set((s) => ({ reports: [r, ...s.reports] })),
  deleteReport: (rid) => set((s) => ({ reports: s.reports.filter((x) => x.id !== rid) })),
}));

/** Real browser download of a CSV built from a header and rows. */
export function downloadCsv(name: string, columns: string[], rows: (string | number)[][], comment?: string) {
  const cell = (v: string | number) => { const t = String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const text = [...(comment ? [`# ${comment}`] : []), columns.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
