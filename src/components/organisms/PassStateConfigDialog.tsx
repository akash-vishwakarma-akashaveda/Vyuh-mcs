import React from 'react';
import { X } from 'lucide-react';
import type { PassState } from '../../types';
import { PASS_ACTIONS, PassActionId, usePassConfigStore } from '../../store/usePassConfigStore';
import { Button } from '../atoms/Button';

const ORDER: PassState[] = ['SCHEDULED', 'PREPARING', 'READY', 'ACTIVE', 'DRAINING', 'COMPLETE'];

/** Rename each pass state, describe it, and choose which actions it offers. Saved in this browser. */
export const PassStateConfigDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { config, set, reset } = usePassConfigStore();

  const toggle = (s: PassState, a: PassActionId) => {
    const has = config[s].actions.includes(a);
    set(s, { actions: has ? config[s].actions.filter((x) => x !== a) : [...config[s].actions, a] });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Configure pass states">
      <div className="w-full max-w-[980px] max-h-[88vh] overflow-y-auto rounded-2xl border border-[#2A3B52] bg-[#111A25] shadow-2xl">
        <div className="sticky top-0 bg-[#111A25] border-b border-[#213044] px-5 h-14 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold">Pass states</h2>
            <p className="text-[12px] text-[#8496AB]">Names, descriptions and the actions each state offers. The sequence itself is fixed.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={reset}>Reset to defaults</Button>
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded flex items-center justify-center text-[#A3B1C2] hover:bg-[#1F2D40]"><X size={16} /></button>
          </div>
        </div>

        <div className="p-5 grid md:grid-cols-2 gap-4">
          {ORDER.map((s, i) => (
            <section key={s} className="rounded-xl border border-[#213044] p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#1F2D40] text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                <span className="font-mono-code text-[11px] text-[#5F7087]">{s}</span>
              </div>
              <label className="flex flex-col gap-1 text-[12px] text-[#A3B1C2]">Name
                <input value={config[s].label} onChange={(e) => set(s, { label: e.target.value })}
                  className="h-9 rounded-md bg-[#0A1018] border border-[#2A3B52] px-2.5 text-[13px] text-[#E6EDF3] outline-none focus:border-[#2DCCFF]" />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-[#A3B1C2]">What it means
                <textarea value={config[s].description} onChange={(e) => set(s, { description: e.target.value })} rows={2}
                  className="rounded-md bg-[#0A1018] border border-[#2A3B52] px-2.5 py-1.5 text-[12.5px] text-[#E6EDF3] outline-none focus:border-[#2DCCFF] resize-none" />
              </label>
              <fieldset className="flex flex-col gap-1">
                <legend className="text-[12px] text-[#A3B1C2] mb-1">Actions offered</legend>
                {(Object.keys(PASS_ACTIONS) as PassActionId[]).map((a) => (
                  <label key={a} className="flex items-start gap-2 text-[12px] cursor-pointer">
                    <input type="checkbox" checked={config[s].actions.includes(a)} onChange={() => toggle(s, a)} className="accent-[#2E6FD8] mt-0.5" />
                    <span className={config[s].actions.includes(a) ? 'text-[#E6EDF3]' : 'text-[#8496AB]'}>{PASS_ACTIONS[a].label}</span>
                  </label>
                ))}
              </fieldset>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};
