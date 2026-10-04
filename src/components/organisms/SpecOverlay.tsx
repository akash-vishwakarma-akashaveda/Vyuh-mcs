import React from 'react';
import { X } from 'lucide-react';
import { CONSTRAINTS, FLOWS, ScreenSpec } from '../../data/screens';
import { useUIStore } from '../../store/useUIStore';
import { useAuthStore } from '../../store/useAuthStore';

/** Screen specification, in the right-hand drawer slot it shares with Copilot. Never shown to customers. */
export const SpecOverlay: React.FC<{ screen: ScreenSpec }> = ({ screen }) => {
  const specOpen = useUIStore((s) => s.specOpen);
  const toggleSpec = useUIStore((s) => s.toggleSpec);
  const role = useAuthStore((s) => s.activeRole);
  if (!specOpen || role === 'Customer User') return null;

  const flow = FLOWS.find((f) => f.id === screen.flow)?.label ?? screen.flow;
  const List = ({ label, items, mono }: { label: string; items: string[]; mono?: boolean }) => items.length ? (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-[12.5px] text-[#7C8594]">{label}</h3>
      <ul className="flex flex-col gap-1">
        {items.map((t, i) => <li key={i} className={mono ? 'font-mono-code text-[12px] text-[#C9CED6]' : 'text-[13px] text-[#C9CED6]'}>{t}</li>)}
      </ul>
    </section>
  ) : null;

  return (
    <aside role="complementary" aria-label={`${screen.name} specification`}
      className="absolute top-3 right-3 bottom-3 w-[440px] max-w-[calc(100%-24px)] z-40 flex flex-col bg-[#11141B] border border-[#1A1E27] rounded-2xl overflow-hidden"
      style={{ boxShadow: 'var(--lift-3)' }}>
      <header className="flex items-center justify-between gap-3 px-5 h-14 shrink-0 border-b border-[#1A1E27]">
        <span className="flex items-center gap-2 min-w-0">
          <span className="font-mono-code text-[11.5px] rounded-full px-2 py-[2px] bg-[#232936] text-[#C9CED6]">{screen.id}</span>
          <h2 className="text-[15px] font-semibold truncate">{screen.name}</h2>
        </span>
        <button onClick={toggleSpec} aria-label="Close specification" className="w-8 h-8 rounded-lg flex items-center justify-center text-[#7C8594] hover:text-[#E9ECF1] hover:bg-[#171B24]"><X size={17} /></button>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
        <p className="text-[13px] text-[#9AA3B2] leading-[1.55]">{screen.purpose}</p>
        <div className="grid grid-cols-2 gap-3 text-[12.5px]">
          <div><span className="text-[#7C8594]">Route</span><div className="font-mono-code text-[#C9CED6]">#/{screen.route}</div></div>
          <div><span className="text-[#7C8594]">Flow</span><div className="text-[#C9CED6]">{flow}</div></div>
        </div>
        <List label="Roles" items={screen.roles} />
        <List label="Modules" items={screen.modules} />
        <List label="Data sources" items={screen.dataSources} mono />
        {screen.constraints.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-[12.5px] text-[#7C8594]">Constraints</h3>
            {screen.constraints.map((id) => (
              <div key={id} className="flex gap-2.5 items-start">
                <span className="font-mono-code text-[11px] rounded-full px-2 py-[2px] shrink-0 bg-[#F5C451]/[0.14] text-[#F5C451]">{id}</span>
                <span className="flex flex-col gap-0.5"><span className="text-[13px] text-[#E9ECF1]">{CONSTRAINTS[id]?.target}</span><span className="text-[12px] text-[#9AA3B2]">{CONSTRAINTS[id]?.acceptance}</span></span>
              </div>
            ))}
          </section>
        )}
        <List label="Regions" items={screen.regions} />
        <List label="States" items={screen.states} />
        <List label="Business rules" items={screen.rules} />
      </div>
    </aside>
  );
};
