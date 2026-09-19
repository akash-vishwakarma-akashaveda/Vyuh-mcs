import React from 'react';
import { X } from 'lucide-react';
import { CONSTRAINTS, FLOWS, ScreenSpec } from '../../data/screens';
import { useUIStore } from '../../store/useUIStore';

/** ⓘ specification overlay — SRS §1.3: design reviews can check modules and constraints in place. */
export const SpecOverlay: React.FC<{ screen: ScreenSpec }> = ({ screen }) => {
  const specOpen = useUIStore((s) => s.specOpen);
  const toggleSpec = useUIStore((s) => s.toggleSpec);
  if (!specOpen) return null;

  const flow = FLOWS.find((f) => f.id === screen.flow)?.label ?? screen.flow;

  const List = ({ label, items, mono }: { label: string; items: string[]; mono?: boolean }) => (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#A1A7B3]">{label}</span>
      <ul className="flex flex-col gap-1">
        {items.map((t, i) => (
          <li key={i} className={`text-[13px] text-[#F3F4F6] ${mono ? 'font-mono-code text-[12.5px]' : ''}`}>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <aside
      className="absolute top-0 right-0 h-full w-[460px] max-w-full bg-[#22262F] border-l border-[#2B303B] shadow-[-20px_0_50px_rgba(0,0,0,.5)] z-40 flex flex-col"
      role="complementary"
      aria-label={`${screen.id} specification`}
    >
      <header className="flex items-start justify-between gap-3 px-[18px] h-[52px] shrink-0 border-b border-[#2B303B]">
        <div className="flex items-center gap-2 h-full">
          <span className="font-mono-code text-[10.5px] font-bold tracking-[0.03em] text-[#3CB992] border border-[#3CB992]/50 bg-[#0F6E56]/12 rounded-full px-2 py-0.5">
            {screen.id}
          </span>
          <h2 className="text-[16px] font-bold leading-none">{screen.name}</h2>
        </div>
        <button onClick={toggleSpec} aria-label="Close specification" className="mt-3.5 text-[#A1A7B3] hover:text-[#F3F4F6]">
          <X size={18} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-[18px] py-[18px] flex flex-col gap-[14px]">
        <p className="text-[13px] text-[#A1A7B3] leading-[1.5]">{screen.purpose}</p>

        <div className="grid grid-cols-2 gap-3 text-[12px]">
          <div><span className="text-[#A1A7B3]">Route</span><div className="font-mono-code text-[#3CB992]">#/{screen.route}</div></div>
          <div><span className="text-[#A1A7B3]">Flow</span><div>{flow}</div></div>
        </div>

        <List label="Roles" items={screen.roles} />
        <List label="Modules" items={screen.modules} />
        <List label="Data sources" items={screen.dataSources} mono />

        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#A1A7B3]">Constraints</span>
          {screen.constraints.map((id) => (
            <div key={id} className="flex gap-2.5 items-start">
              <span className="font-mono-code text-[10.5px] font-bold rounded-[3px] px-1.5 py-1 shrink-0 bg-[#E8943A]/16 text-[#F2B26B]">{id}</span>
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] text-[#F3F4F6]">{CONSTRAINTS[id]?.target}</span>
                <span className="text-[12px] text-[#A1A7B3]">{CONSTRAINTS[id]?.acceptance}</span>
              </div>
            </div>
          ))}
        </div>

        <List label="Regions" items={screen.regions} />
        <List label="States" items={screen.states} />
        <List label="Business rules" items={screen.rules} />
      </div>
    </aside>
  );
};
