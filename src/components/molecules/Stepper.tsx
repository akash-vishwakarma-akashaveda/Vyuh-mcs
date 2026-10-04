import React from 'react';
import { Minus, Plus } from 'lucide-react';

/** − / + buttons beside a number field used for stepping (windows, counts, minutes). Clamps to min/max. */
export const Stepper: React.FC<{ value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; disabled?: boolean; label: string }> = ({
  value, onChange, step = 1, min = -Infinity, max = Infinity, disabled, label,
}) => {
  const set = (n: number) => onChange(Math.min(max, Math.max(min, n)));
  const btn = 'w-9 h-9 shrink-0 rounded-xl bg-[#161A22] border border-[#232936] text-[#C9CED6] flex items-center justify-center hover:text-white disabled:opacity-40';
  return (
    <span className="flex gap-1">
      <button type="button" className={btn} disabled={disabled || value - step < min} onClick={() => set(value - step)} aria-label={`Decrease ${label}`}><Minus size={14} /></button>
      <button type="button" className={btn} disabled={disabled || value + step > max} onClick={() => set(value + step)} aria-label={`Increase ${label}`}><Plus size={14} /></button>
    </span>
  );
};
