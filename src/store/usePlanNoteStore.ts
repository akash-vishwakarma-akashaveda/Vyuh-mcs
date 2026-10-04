import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { demoKey, demoStorage } from '../demo/persist';
import { useMissionStore } from './useMissionStore';

/**
 * Notes raised for the mission plan from other screens (the health forecast first). The Mission
 * Planner sees them on the plan and closes them; whoever raised one sees it listed where they raised it.
 */
export interface PlanNote {
  id: string;
  sat_id: string;
  subject: string;
  text: string;
  /** Plan before this date (YYYY-MM-DD, UTC). */
  due: string;
  by: string;
  at: string;
  source: 'forecast';
  state: 'OPEN' | 'PLANNED' | 'CLOSED';
}

interface Store {
  notes: PlanNote[];
  add: (n: Omit<PlanNote, 'id' | 'at' | 'state'>, actorId: string) => PlanNote;
  setState: (id: string, state: PlanNote['state']) => void;
}


export const usePlanNoteStore = create<Store>()(persist((set, get) => ({
  notes: [],
  add: (n, actorId) => {
    const note: PlanNote = { ...n, id: `PN-${String(get().notes.length + 1).padStart(3, '0')}`, at: new Date().toISOString(), state: 'OPEN' };
    set((s) => ({ notes: [note, ...s.notes] }));
    useMissionStore.getState().appendAudit({
      timestamp_utc: note.at, operator_id: actorId, operator_name: n.by, sat_id: n.sat_id, command_mnemonic: 'PLAN_NOTE',
      procedure_id: '—', procedure_version: '—', sequence_count: 0, result: 'ACK', params_summary: `${note.id} ${n.subject}: plan before ${n.due}`,
    });
    return note;
  },
  setState: (id, state) => set((s) => ({ notes: s.notes.map((x) => (x.id === id ? { ...x, state } : x)) })),
}), { name: demoKey('planNotes'), storage: demoStorage, partialize: (s) => ({ notes: s.notes }) as unknown as Store }));
