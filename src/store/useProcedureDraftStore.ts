import { create } from 'zustand';

/**
 * Procedure drafts in the editor (S16): text, where it is in the flow, and the review.
 * Kept in a store so leaving the editor, or handing over to the reviewer (another person
 * signing in), does not lose the draft. Release needs one reviewer who is not the author.
 */
export type DraftStage = 0 | 1 | 2 | 3 | 4; // Draft, Validated, Test passed, In review, Released

export interface Draft {
  text: string;
  stage: DraftStage;
  author?: string;
  reviewer?: string;
  submittedUtc?: string;
  decidedBy?: string;
  decidedUtc?: string;
  returnedReason?: string;
  releasedVersion?: string;
}

interface Store {
  drafts: Record<string, Draft>;
  put: (procId: string, d: Partial<Draft>) => void;
}

export const useProcedureDraftStore = create<Store>((set) => ({
  drafts: {},
  put: (procId, d) => set((s) => ({ drafts: { ...s.drafts, [procId]: { ...(s.drafts[procId] ?? { text: '', stage: 0 }), ...d } } })),
}));
