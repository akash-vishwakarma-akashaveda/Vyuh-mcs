import { create } from 'zustand';
import { Command, CommandStep, StepStatus, Procedure } from '../types';

interface CommandStore {
  queue: Command[];
  history: Command[];
  activeCommand: Command | null;
  activeProcedure: Procedure | null;
  clcwReportValue: number;
  clcwFlags: {
    lockout: boolean;
    wait: boolean;
    retransmit: boolean;
    farmBCounter: number;
  };
  
  // Actions
  addCommand: (cmd: Command) => void;
  updateCommandStatus: (command_id: string, status: Command['status']) => void;
  updateStepStatus: (command_id: string, step_id: string, status: StepStatus) => void;
  setActiveCommand: (cmd: Command | null) => void;
  setActiveProcedure: (proc: Procedure | null) => void;
  updateCLCW: (val: number, flags?: Partial<CommandStore['clcwFlags']>) => void;
  abortCommand: (command_id: string) => void;
}

export const useCommandStore = create<CommandStore>((set) => ({
  queue: [],
  history: [],
  activeCommand: null,
  activeProcedure: null,
  clcwReportValue: 0x00A4,
  clcwFlags: {
    lockout: false,
    wait: false,
    retransmit: false,
    farmBCounter: 12,
  },

  addCommand: (cmd) =>
    set((state) => ({
      queue: [...state.queue, cmd],
      activeCommand: state.activeCommand || cmd,
    })),

  updateCommandStatus: (command_id, status) =>
    set((state) => {
      const updatedQueue = state.queue.map((c) =>
        c.command_id === command_id ? { ...c, status } : c
      );
      const active = state.activeCommand?.command_id === command_id
        ? { ...state.activeCommand, status }
        : state.activeCommand;
      
      let history = state.history;
      if (status === 'ACK' || status === 'NACK' || status === 'ABORTED' || status === 'COMPLETE') {
        const finishedCmd = updatedQueue.find((c) => c.command_id === command_id);
        if (finishedCmd) {
          history = [finishedCmd, ...history];
        }
      }

      return {
        queue: updatedQueue.filter((c) => c.status === 'QUEUED' || c.status === 'EXECUTING' || c.status === 'PENDING_ACK'),
        activeCommand: active,
        history,
      };
    }),

  updateStepStatus: (command_id, step_id, status) =>
    set((state) => {
      const updateSteps = (steps: CommandStep[]) =>
        steps.map((s) => (s.step_id === step_id ? { ...s, status, ack_utc: status === 'ACK' ? new Date().toISOString() : s.ack_utc } : s));

      const updatedQueue = state.queue.map((c) =>
        c.command_id === command_id ? { ...c, steps: updateSteps(c.steps) } : c
      );

      const active =
        state.activeCommand?.command_id === command_id
          ? { ...state.activeCommand, steps: updateSteps(state.activeCommand.steps) }
          : state.activeCommand;

      return { queue: updatedQueue, activeCommand: active };
    }),

  setActiveCommand: (cmd) => set({ activeCommand: cmd }),
  setActiveProcedure: (proc) => set({ activeProcedure: proc }),

  updateCLCW: (val, flags) =>
    set((state) => ({
      clcwReportValue: val,
      clcwFlags: { ...state.clcwFlags, ...flags },
    })),

  abortCommand: (command_id) =>
    set((state) => {
      const cmd = state.queue.find((c) => c.command_id === command_id) || state.activeCommand;
      if (!cmd) return state;
      const abortedCmd: Command = { ...cmd, status: 'ABORTED' };
      return {
        queue: state.queue.filter((c) => c.command_id !== command_id),
        activeCommand: state.activeCommand?.command_id === command_id ? null : state.activeCommand,
        history: [abortedCmd, ...state.history],
      };
    }),
}));
