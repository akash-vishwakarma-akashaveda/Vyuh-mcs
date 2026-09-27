import React from 'react';
import { BotMessageSquare, ShieldCheck, X } from 'lucide-react';
import { CopilotChat } from './CopilotChat';
import { useUIStore } from '../../store/useUIStore';

/** Floating launcher: always one click away, hidden while the panel is open. */
export const CopilotLauncher: React.FC = () => {
  const open = useUIStore((s) => s.copilotOpen);
  const toggle = useUIStore((s) => s.toggleCopilot);
  if (open) return null;
  return (
    <button onClick={toggle} aria-label="Open Ops Copilot" title="Ops Copilot"
      className="fixed bottom-5 right-5 z-[45] h-14 pl-4 pr-5 rounded-full flex items-center gap-2.5 text-[13px] font-semibold text-[#E6EDF3]
                 bg-[#111A25]/70 backdrop-blur-xl border border-[#E6EDF3]/15 shadow-[0_10px_30px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.08)] hover:bg-[#172434]/80 hover:border-[#4DACFF]/50">
      <span className="w-9 h-9 rounded-full bg-[#2E6FD8] flex items-center justify-center text-white shadow-[0_0_0_4px_rgba(46, 111, 216,.25)]">
        <BotMessageSquare size={18} />
      </span>
      Ask Copilot
    </button>
  );
};

/** Ops Copilot: a floating glass panel over the console (SRS §4.1 overlays). */
export const CopilotPanel: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const copilotOpen = useUIStore((s) => s.copilotOpen);
  const toggleCopilot = useUIStore((s) => s.toggleCopilot);
  if (!copilotOpen) return null;

  return (
    <aside
      className="absolute top-3 right-3 bottom-3 w-[410px] max-w-[calc(100%-24px)] z-40 flex flex-col overflow-hidden rounded-2xl
                 bg-[#111A25]/70 backdrop-blur-2xl backdrop-saturate-150 border border-[#E6EDF3]/12
                 shadow-[0_24px_60px_rgba(0,0,0,.5),inset_0_1px_0_rgba(255,255,255,.08)]"
      aria-label="Ops Copilot"
    >
      <header className="flex items-center gap-3 px-4 h-16 shrink-0 border-b border-[#E6EDF3]/10">
        <span className="w-10 h-10 rounded-xl bg-[#2E6FD8] flex items-center justify-center text-white"><BotMessageSquare size={20} /></span>
        <div className="flex flex-col leading-tight">
          <h2 className="text-[15px] font-semibold">Ops Copilot</h2>
          <span className="text-[11.5px] text-[#8496AB] flex items-center gap-1"><ShieldCheck size={12} className="text-[#4DACFF]" />Read-only · cites its sources</span>
        </div>
        <button onClick={toggleCopilot} aria-label="Close Ops Copilot"
          className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-[#A3B1C2] hover:text-[#E6EDF3] hover:bg-[#E6EDF3]/10">
          <X size={17} />
        </button>
      </header>
      <CopilotChat onNavigate={onNavigate} compact />
    </aside>
  );
};
