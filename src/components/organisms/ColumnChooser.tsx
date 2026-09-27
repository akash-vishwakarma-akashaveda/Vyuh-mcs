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
        className="h-8 px-2.5 rounded-md border border-[#2A3B52] bg-[#111A25] hover:border-[#3E5370] flex items-center gap-1.5 text-[12px] text-[#E6EDF3]">
        <Columns3 size={14} /> {label} <span className="text-[#8496AB] tabular-nums">{selected.length}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-40 w-[290px] max-h-[420px] overflow-y-auto rounded-xl border border-[#2A3B52] bg-[#111A25] shadow-2xl p-2.5 text-[12px] flex flex-col gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#5F7087]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label={`Search ${label.toLowerCase()}`}
              className="w-full h-8 pl-7 pr-2 rounded-md bg-[#0A1018] border border-[#2A3B52] outline-none focus:border-[#2DCCFF]" />
          </div>
          {groups.map((g) => {
            const rows = items.filter((i) => i.group === g && (!needle || i.label.toLowerCase().includes(needle) || g.toLowerCase().includes(needle)));
            if (!rows.length) return null;
            return (
              <div key={g} className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#5F7087] px-1 pb-1">{g}</span>
                {rows.map((i) => (
                  <label key={i.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-[#172434] cursor-pointer">
                    <input type="checkbox" checked={on.has(i.id)} disabled={locked.includes(i.id)} onChange={() => toggle(i.id)} className="accent-[#2E6FD8]" />
                    <span className={on.has(i.id) ? '' : 'text-[#A3B1C2]'}>{i.label}</span>
                  </label>
                ))}
              </div>
            );
          })}
          {onReset && <button onClick={onReset} className="self-start text-[11.5px] text-[#4DACFF] hover:underline px-1">Reset to default</button>}
        </div>
      )}
    </div>
  );
};
