import React from 'react';
import { X } from 'lucide-react';
import { CopilotChat } from './CopilotChat';
import { useUIStore } from '../../store/useUIStore';

/** Copilot side panel, 420 px (SRS §4.1 overlays). */
export const CopilotPanel: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const copilotOpen = useUIStore((s) => s.copilotOpen);
  const toggleCopilot = useUIStore((s) => s.toggleCopilot);
  if (!copilotOpen) return null;

  return (
    <aside
      className="absolute top-0 right-0 h-full w-[420px] max-w-full bg-[#22262F] border-l border-[#2B303B] shadow-[-20px_0_50px_rgba(0,0,0,.5)] z-40 flex flex-col"
      aria-label="Ops Copilot"
    >
      <header className="flex items-center justify-between px-[18px] h-[52px] shrink-0 border-b border-[#2B303B]">
        <h2 className="text-[16px] font-bold">Ops Copilot</h2>
        <button onClick={toggleCopilot} aria-label="Close Ops Copilot" className="text-[#A1A7B3] hover:text-[#F3F4F6]">
          <X size={18} />
        </button>
      </header>
      <CopilotChat onNavigate={onNavigate} compact />
    </aside>
  );
};
