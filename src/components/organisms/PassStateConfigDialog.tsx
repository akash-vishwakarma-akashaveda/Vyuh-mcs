import React from 'react';
import type { PassState } from '../../types';
import { PASS_ACTIONS, PassActionId, usePassConfigStore } from '../../store/usePassConfigStore';
import { Button } from '../atoms/Button';
import { Modal } from '../molecules/Modal';

const ORDER: PassState[] = ['SCHEDULED', 'PREPARING', 'READY', 'ACTIVE', 'DRAINING', 'COMPLETE'];
const field = 'rounded-[10px] bg-[#161A22] border border-[#232936] px-3 text-[13px] text-[#E9ECF1] outline-none focus:border-[#6CB8FF]';

/** Rename each pass state, describe it, and choose which actions it offers. Saved in this browser. */
export const PassStateConfigDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { config, set, reset } = usePassConfigStore();

  const toggle = (s: PassState, a: PassActionId) => {
    const has = config[s].actions.includes(a);
    set(s, { actions: has ? config[s].actions.filter((x) => x !== a) : [...config[s].actions, a] });
  };

  return (
    <Modal title="Pass states" size="xl" onClose={onClose}
      sub="Names, descriptions and the actions each state offers. The sequence itself is fixed. Saved in this browser."
      footer={<>
        <Button variant="secondary" onClick={reset}>Reset to defaults</Button>
        <Button onClick={onClose}>Done</Button>
      </>}>
      <div className="grid md:grid-cols-2 gap-4">
        {ORDER.map((s, i) => (
          <section key={s} className="rounded-xl bg-[#161A22] p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#232936] text-[12px] flex items-center justify-center">{i + 1}</span>
              <span className="font-mono-code text-[12px] text-[#7C8594]">{s}</span>
            </div>
            <label className="flex flex-col gap-1 text-[12.5px] text-[#9AA3B2]">Name
              <input value={config[s].label} onChange={(e) => set(s, { label: e.target.value })} className={`${field} h-9`} />
            </label>
            <label className="flex flex-col gap-1 text-[12.5px] text-[#9AA3B2]">What it means
              <textarea value={config[s].description} onChange={(e) => set(s, { description: e.target.value })} rows={2} className={`${field} py-1.5 resize-none`} />
            </label>
            <fieldset className="flex flex-col gap-1">
              <legend className="text-[12.5px] text-[#9AA3B2] mb-1">Actions offered</legend>
              {(Object.keys(PASS_ACTIONS) as PassActionId[]).map((a) => (
                <label key={a} className="flex items-start gap-2 text-[12.5px] cursor-pointer">
                  <input type="checkbox" checked={config[s].actions.includes(a)} onChange={() => toggle(s, a)} className="mt-0.5" />
                  <span className={config[s].actions.includes(a) ? 'text-[#E9ECF1]' : 'text-[#7C8594]'}>{PASS_ACTIONS[a].label}</span>
                </label>
              ))}
            </fieldset>
          </section>
        ))}
      </div>
    </Modal>
  );
};
