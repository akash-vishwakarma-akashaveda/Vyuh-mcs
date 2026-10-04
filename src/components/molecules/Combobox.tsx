import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';

/**
 * Free-text input with suggestions, in the console's style — the replacement for
 * <input list=…> + <datalist>. Typing filters the suggestions; picking one fills the input.
 */
export interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when a suggestion is picked (after onChange). */
  onPick?: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

export const Combobox: React.FC<ComboboxProps> = ({ value, onChange, onPick, options, placeholder, className, id, 'aria-label': ariaLabel }) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 0 });
  const input = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => {
    const q = value.trim().toLowerCase();
    return (q ? options.filter((o) => o.toLowerCase().includes(q)) : options).slice(0, 50);
  }, [options, value]);

  useLayoutEffect(() => {
    if (!open) return;
    const r = input.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, top: r.bottom + 6, width: r.width });
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && e.target !== input.current) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const pick = (v: string) => { onChange(v); onPick?.(v); setOpen(false); input.current?.focus(); };

  return (
    <>
      <input
        ref={input} id={id} value={value} placeholder={placeholder} aria-label={ariaLabel} autoComplete="off"
        role="combobox" aria-expanded={open && shown.length > 0} aria-autocomplete="list"
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(shown.length - 1, a + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === 'Enter' && open && shown[active]) { e.preventDefault(); pick(shown[active]); }
          else if (e.key === 'Escape') { if (open) { e.stopPropagation(); setOpen(false); } }
        }}
        className={clsx(className || 'h-10 w-full rounded-xl bg-[#161A22] border border-[#232936] px-3 text-[14px] text-[#E9ECF1] outline-none')}
      />
      {open && shown.length > 0 && createPortal(
        <div ref={menu} role="listbox" aria-label={ariaLabel}
          className="fixed z-[200] max-h-[280px] overflow-y-auto bg-[#11141B] border border-[#232936] rounded-xl p-1 shadow-[0_18px_44px_rgba(0,0,0,.55)] font-sans-body"
          style={{ left: pos.left, top: pos.top, width: Math.max(pos.width, 220) }}>
          {shown.map((o, i) => (
            <div key={o} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}
              className={clsx('h-[34px] px-3 flex items-center rounded-lg text-[13px] cursor-pointer', i === active ? 'bg-[#1B2130] text-white' : 'text-[#C9CED6]')}>
              {o}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
};
