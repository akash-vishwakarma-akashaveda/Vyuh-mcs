import React, { useEffect, useRef, useState } from 'react';
import { Columns3, Search } from 'lucide-react';

export interface ChooserItem { id: string; label: string; group: string }

/** A popover checklist grouped by category, with search — for "which columns / parameters do I want". */
export const ColumnChooser: React.FC<{
  items: ChooserItem[];
  selected: string[];
  onChange: (ids: string[]) => void;
  onReset?: () => void;
  label?: string;
  locked?: string[];
}> = ({ items, selected, onChange, onReset, label = 'Columns', locked = [] }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, []);

  const groups = [...new Set(items.map((i) => i.group))];
  const on = new Set(selected);
  const toggle = (id: string) => {
    if (locked.includes(id)) return;
    onChange(on.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  const needle = q.trim().toLowerCase();

  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        className="h-8 px-3 rounded-[10px] bg-[#171B24] border border-[#232936] hover:bg-[#1D222D] flex items-center gap-1.5 text-[12px] text-[#E9ECF1]">
        <Columns3 size={14} /> {label} <span className="text-[#7C8594] tabular-nums">{selected.length}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-40 w-[290px] max-h-[420px] overflow-y-auto rounded-xl border border-[#232936] bg-[#11141B] shadow-2xl p-2.5 text-[12px] flex flex-col gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#6B7383]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label={`Search ${label.toLowerCase()}`}
              className="w-full h-8 pl-7 pr-2 rounded-md bg-[#090B10] border border-[#232936] outline-none focus:border-[#6CB8FF]" />
          </div>
          {groups.map((g) => {
            const rows = items.filter((i) => i.group === g && (!needle || i.label.toLowerCase().includes(needle) || g.toLowerCase().includes(needle)));
            if (!rows.length) return null;
            return (
              <div key={g} className="flex flex-col">
                <span className="text-[12px] text-[#7C8594] px-1 pb-1">{g}</span>
                {rows.map((i) => (
                  <label key={i.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-[#171B24] cursor-pointer">
                    <input type="checkbox" checked={on.has(i.id)} disabled={locked.includes(i.id)} onChange={() => toggle(i.id)}  />
                    <span className={on.has(i.id) ? '' : 'text-[#9AA3B2]'}>{i.label}</span>
                  </label>
                ))}
              </div>
            );
          })}
          {onReset && <button onClick={onReset} className="self-start text-[11.5px] text-[#6CB8FF] hover:underline px-1">Reset to default</button>}
        </div>
      )}
    </div>
  );
};
