import React from 'react';
import { BotMessageSquare, X } from 'lucide-react';
import { CopilotChat } from './CopilotChat';
import { useUIStore } from '../../store/useUIStore';

/** Ops Copilot in the shared right-hand drawer slot (opened from the top bar only). */
export const CopilotPanel: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const copilotOpen = useUIStore((s) => s.copilotOpen);
  const toggleCopilot = useUIStore((s) => s.toggleCopilot);
  if (!copilotOpen) return null;

  return (
    <aside className="absolute top-2 right-2 bottom-2 w-[410px] max-w-[calc(100%-16px)] z-40 flex flex-col overflow-hidden rounded-2xl bg-[#11141B] border border-[#1A1E27]"
      style={{ boxShadow: 'var(--lift-3)' }} aria-label="Ops Copilot">
      <header className="flex items-center gap-3 px-4 h-14 shrink-0 border-b border-[#1A1E27]">
        <span className="w-9 h-9 rounded-xl bg-[#1B2130] flex items-center justify-center text-[#8CC8FF]"><BotMessageSquare size={18} /></span>
        <div className="flex flex-col leading-tight">
          <h2 className="text-[15px] font-semibold">Ops Copilot</h2>
          <span className="text-[12px] text-[#7C8594]">An assistant, not an authority · cites its sources</span>
        </div>
        <button onClick={toggleCopilot} aria-label="Close Ops Copilot"
          className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-[#9AA3B2] hover:text-[#E9ECF1] hover:bg-[#1B2130]"><X size={17} /></button>
      </header>
      <CopilotChat onNavigate={(to) => { onNavigate(to); }} compact />
    </aside>
  );
};
