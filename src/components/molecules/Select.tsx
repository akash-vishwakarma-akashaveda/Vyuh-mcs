import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { Check, ChevronDown, Search } from 'lucide-react';

/**
 * The console's dropdown. A drop-in for <select>: give it the same <option>/<optgroup>
 * children, `value` and `onChange(e)` (e.target.value is the chosen option's value, a
 * string, exactly like a native select). The menu is drawn by us, in the console's
 * style, in a portal so cards with overflow never clip it.
 */
interface Opt { value: string; label: React.ReactNode; text: string; disabled?: boolean; group?: string }

type ChangeLike = { target: { value: string; name?: string }; currentTarget: { value: string; name?: string } };

export interface SelectProps {
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: ChangeLike) => void;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  id?: string;
  name?: string;
  title?: string;
  placeholder?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

const textOf = (n: React.ReactNode): string =>
  typeof n === 'string' || typeof n === 'number' ? String(n)
    : Array.isArray(n) ? n.map(textOf).join('')
    : React.isValidElement(n) ? textOf((n.props as { children?: React.ReactNode }).children) : '';

function collect(children: React.ReactNode, group?: string, out: Opt[] = []): Opt[] {
  React.Children.forEach(children, (c) => {
    if (!React.isValidElement(c)) return;
    const p = c.props as { value?: string | number; children?: React.ReactNode; disabled?: boolean; label?: string };
    if (c.type === 'option') {
      const value = p.value !== undefined ? String(p.value) : textOf(p.children);
      out.push({ value, label: p.children, text: textOf(p.children), disabled: p.disabled, group });
    } else if (c.type === 'optgroup') {
      collect(p.children, p.label, out);
    } else if (c.type === React.Fragment) {
      collect(p.children, group, out);
    }
  });
  return out;
}

const DEFAULT_TRIGGER = 'h-9 rounded-xl bg-[#161A22] border border-[#232936] px-3 text-[13px] text-[#E9ECF1]';

export const Select: React.FC<SelectProps> = ({
  value, defaultValue, onChange, children, className, style, disabled, id, name, title, placeholder,
  'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby,
}) => {
  const options = useMemo(() => collect(children), [children]);
  const [inner, setInner] = useState<string | undefined>(defaultValue !== undefined ? String(defaultValue) : undefined);
  const current = value !== undefined ? String(value) : inner ?? options[0]?.value;
  const selected = options.find((o) => o.value === current);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean }>({ left: 0, top: 0, width: 0, up: false });
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const listId = useId();
  const searchable = options.length > 10;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.text.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const height = Math.min(340, shown.length * 36 + (searchable ? 52 : 8));
    const up = r.bottom + height + 8 > window.innerHeight && r.top > height + 8;
    setPos({ left: Math.min(r.left, window.innerWidth - Math.max(r.width, 200) - 8), top: up ? r.top - 6 : r.bottom + 6, width: Math.max(r.width, 200), up });
  };

  useLayoutEffect(() => { if (open) place(); }, [open, shown.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const reflow = () => place();
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(Math.max(0, options.findIndex((o) => o.value === current)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (o: Opt) => {
    if (o.disabled) return;
    setOpen(false);
    btn.current?.focus();
    if (value === undefined) setInner(o.value);
    if (o.value !== current) onChange?.({ target: { value: o.value, name }, currentTarget: { value: o.value, name } });
  };

  const move = (d: number) => {
    if (!shown.length) return;
    let i = active;
    for (let k = 0; k < shown.length; k++) {
      i = (i + d + shown.length) % shown.length;
      if (!shown[i].disabled) break;
    }
    setActive(i);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(shown.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) choose(shown[active]); }
    else if (e.key === 'Tab') setOpen(false);
    else if (!searchable && e.key.length === 1) {
      const i = shown.findIndex((o) => o.text.toLowerCase().startsWith(e.key.toLowerCase()));
      if (i >= 0) setActive(i);
    }
  };

  let lastGroup: string | undefined;
  return (
    <>
      <button
        ref={btn} type="button" id={id} title={title} disabled={disabled}
        role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
        aria-label={ariaLabel} aria-labelledby={ariaLabelledby}
        onClick={() => setOpen((o) => !o)} onKeyDown={onKey}
        className={clsx('inline-flex items-center justify-between gap-2 text-left min-w-0 outline-none',
          'disabled:opacity-50 disabled:cursor-not-allowed', className || DEFAULT_TRIGGER, open && 'ring-1 ring-[#F28C28]/60')}
        style={style}
      >
        <span className={clsx('truncate', !selected && 'text-[#6B7383]')}>{selected ? selected.label : placeholder ?? 'Choose…'}</span>
        <ChevronDown size={15} className={clsx('shrink-0 text-[#7C8594]', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {name && <input type="hidden" name={name} value={current ?? ''} />}
      {open && createPortal(
        <div
          ref={menu} onKeyDown={onKey}
          className="fixed z-[200] flex flex-col bg-[#11141B] border border-[#232936] rounded-xl p-1 shadow-[0_18px_44px_rgba(0,0,0,.55)] font-sans-body"
          style={{ left: pos.left, width: pos.width, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }), maxHeight: 340 }}
        >
          {searchable && (
            <label className="flex items-center gap-2 h-9 px-2.5 mb-1 rounded-lg bg-[#161A22] text-[#6B7383]">
              <Search size={14} aria-hidden="true" />
              <input autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                placeholder="Search" aria-label="Search options"
                className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-[#E9ECF1] placeholder:text-[#6B7383]" />
            </label>
          )}
          <div role="listbox" id={listId} aria-label={ariaLabel} className="overflow-y-auto">
            {shown.length === 0 && <div className="px-3 py-2 text-[13px] text-[#7C8594]">No matches</div>}
            {shown.map((o, i) => {
              const header = o.group && o.group !== lastGroup ? o.group : null;
              lastGroup = o.group;
              const isSel = o.value === current;
              return (
                <React.Fragment key={`${o.group ?? ''}:${o.value}`}>
                  {header && <div className="px-3 pt-2.5 pb-1 text-[12px] text-[#6B7383]">{header}</div>}
                  <div
                    role="option" aria-selected={isSel} aria-disabled={o.disabled || undefined} data-i={i}
                    onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)}
                    className={clsx('flex items-center justify-between gap-3 h-[34px] px-3 rounded-lg text-[13px] cursor-pointer select-none',
                      o.disabled ? 'text-[#4A5160] cursor-not-allowed' : isSel ? 'text-white' : 'text-[#C9CED6]',
                      i === active && !o.disabled && 'bg-[#1B2130]')}
                  >
                    <span className="truncate">{o.label}</span>
                    {isSel && <Check size={14} className="shrink-0 text-[#F28C28]" aria-hidden="true" />}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};
