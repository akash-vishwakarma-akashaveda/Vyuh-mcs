import { create } from 'zustand';

export type ConsoleMode = 'LIVE' | 'PLAYBACK' | 'SIMULATION';

interface UIStore {
  sidebarCollapsed: boolean;
  activeModal: string | null;
  wsConnectionState: 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  /** SRS §4.1 — LIVE / PLAYBACK / SIMULATION can never be confused. */
  mode: ConsoleMode;
  tenant: string;
  specOpen: boolean;
  copilotOpen: boolean;
  commandPaletteOpen: boolean;

  toggleSidebar: () => void;
  openModal: (modalId: string) => void;
  closeModal: () => void;
  setWsConnectionState: (state: UIStore['wsConnectionState']) => void;
  setMode: (mode: ConsoleMode) => void;
  setTenant: (tenant: string) => void;
  toggleSpec: () => void;
  toggleCopilot: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  /** Legacy shim for screens written against the v1 playback flag. */
  playbackMode: boolean;
  setPlaybackMode: (active: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarCollapsed: false,
  activeModal: null,
  wsConnectionState: 'CONNECTED',
  mode: 'LIVE',
  tenant: 'Akashaveda',
  specOpen: false,
  copilotOpen: false,
  commandPaletteOpen: false,

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  openModal: (modalId) => set({ activeModal: modalId }),
  closeModal: () => set({ activeModal: null }),
  setWsConnectionState: (state) => set({ wsConnectionState: state }),
  setMode: (mode) => set({ mode, playbackMode: mode === 'PLAYBACK' }),
  setTenant: (tenant) => set({ tenant }),
  toggleSpec: () => set((s) => ({ specOpen: !s.specOpen })),
  toggleCopilot: () => set((s) => ({ copilotOpen: !s.copilotOpen })),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  playbackMode: false,
  setPlaybackMode: (active) => set({ mode: active ? 'PLAYBACK' : 'LIVE', playbackMode: active }),
}));
