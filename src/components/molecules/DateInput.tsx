import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Date or date-time picker in the console's style, a drop-in for
 * <input type="date"> ("YYYY-MM-DD") and <input type="datetime-local"> ("YYYY-MM-DDTHH:mm").
 * Values are plain strings, read as UTC everywhere in the console. onChange(e) gets
 * e.target.value like the native input.
 */
type ChangeLike = { target: { value: string }; currentTarget: { value: string } };

export interface DateInputProps {
  type?: 'date' | 'datetime-local';
  value?: string;
  onChange?: (e: ChangeLike) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  placeholder?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function parse(v: string | undefined) {
  const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  return m ? { y: +m[1], mo: +m[2] - 1, d: +m[3], h: m[4] ? +m[4] : 0, mi: m[5] ? +m[5] : 0 } : null;
}

export const DateInput: React.FC<DateInputProps> = ({ type = 'date', value, onChange, min, max, disabled, className, id, 'aria-label': ariaLabel, placeholder }) => {
  const withTime = type === 'datetime-local';
  const cur = parse(value);
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ y: cur?.y ?? now.getUTCFullYear(), mo: cur?.mo ?? now.getUTCMonth() });
  const [time, setTime] = useState({ h: cur?.h ?? now.getUTCHours(), mi: cur?.mi ?? now.getUTCMinutes() });
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open && cur) { setView({ y: cur.y, mo: cur.mo }); setTime({ h: cur.h, mi: cur.mi }); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!open) return;
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const h = withTime ? 380 : 330;
    setPos({ left: Math.min(r.left, window.innerWidth - 300), top: r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6 });
  }, [open, withTime]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc, true); };
  }, [open]);

  const emit = (v: string) => onChange?.({ target: { value: v }, currentTarget: { value: v } });
  const str = (y: number, mo: number, d: number, h = time.h, mi = time.mi) =>
    `${y}-${pad(mo + 1)}-${pad(d)}` + (withTime ? `T${pad(h)}:${pad(mi)}` : '');
  const out = (s: string) => (min && s < min) || (max && s > max);

  const first = new Date(Date.UTC(view.y, view.mo, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(view.y, view.mo + 1, 0)).getUTCDate();
  const cells = Array.from({ length: 42 }, (_, i) => i - lead + 1);
  const shift = (d: number) => setView((v) => { const t = new Date(Date.UTC(v.y, v.mo + d, 1)); return { y: t.getUTCFullYear(), mo: t.getUTCMonth() }; });
  const today = { y: now.getUTCFullYear(), mo: now.getUTCMonth(), d: now.getUTCDate() };

  const pick = (d: number) => {
    const s = str(view.y, view.mo, d);
    if (out(s)) return;
    emit(s);
    if (!withTime) { setOpen(false); btn.current?.focus(); }
  };
  const setT = (h: number, mi: number) => {
    const t = { h: (h + 24) % 24, mi: (mi + 60) % 60 };
    setTime(t);
    if (cur) emit(str(cur.y, cur.mo, cur.d, t.h, t.mi));
  };

  const label = cur ? `${cur.y}-${pad(cur.mo + 1)}-${pad(cur.d)}${withTime ? ` ${pad(cur.h)}:${pad(cur.mi)} UTC` : ''}` : placeholder ?? (withTime ? 'Pick date and time' : 'Pick a date');

  return (
    <>
      <button ref={btn} type="button" id={id} disabled={disabled} aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={clsx('inline-flex items-center gap-2 text-left whitespace-nowrap disabled:opacity-50',
          className || 'h-9 rounded-xl bg-[#161A22] border border-[#232936] px-3 text-[13px] text-[#E9ECF1]', open && 'ring-1 ring-[#F28C28]/60')}>
        <Calendar size={14} className="text-[#7C8594] shrink-0" aria-hidden="true" />
        <span className={clsx('font-mono-code', !cur && 'text-[#6B7383] font-sans-body')}>{label}</span>
      </button>
      {open && createPortal(
        <div ref={pop} role="dialog" aria-label={ariaLabel ?? 'Choose a date'}
          className="fixed z-[200] w-[284px] bg-[#11141B] border border-[#232936] rounded-2xl p-3 shadow-[0_18px_44px_rgba(0,0,0,.55)] font-sans-body text-[#E9ECF1]"
          style={{ left: pos.left, top: pos.top }}>
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9AA3B2] hover:bg-[#171B24]"><ChevronLeft size={16} /></button>
            <span className="text-[13.5px] font-medium">{MONTHS[view.mo]} {view.y}</span>
            <button type="button" onClick={() => shift(1)} aria-label="Next month" className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9AA3B2] hover:bg-[#171B24]"><ChevronRight size={16} /></button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {DAYS.map((d) => <span key={d} className="text-[11.5px] text-[#6B7383] h-7 leading-7">{d}</span>)}
            {cells.map((d, i) => {
              if (d < 1 || d > days) return <span key={i} />;
              const s = str(view.y, view.mo, d);
              const sel = cur && cur.y === view.y && cur.mo === view.mo && cur.d === d;
              const isToday = today.y === view.y && today.mo === view.mo && today.d === d;
              const dis = !!out(s);
              return (
                <button key={i} type="button" disabled={dis} onClick={() => pick(d)}
                  className={clsx('h-8 rounded-lg text-[12.5px] tabular-nums',
                    sel ? 'bg-[#F28C28] text-[#1A0E02] font-semibold' : dis ? 'text-[#3A404D]' : 'text-[#C9CED6] hover:bg-[#1B2130]',
                    isToday && !sel && 'ring-1 ring-[#343B4A]')}>
                  {d}
                </button>
              );
            })}
          </div>
          {withTime && (
            <div className="mt-3 pt-3 border-t border-[#1A1E27] flex items-center justify-between">
              <span className="text-[12.5px] text-[#9AA3B2]">Time (UTC)</span>
              <span className="flex items-center gap-1.5 font-mono-code text-[14px]">
                {(['h', 'mi'] as const).map((k, idx) => (
                  <React.Fragment key={k}>
                    {idx === 1 && <span className="text-[#6B7383]">:</span>}
                    <span className="flex flex-col items-center">
                      <button type="button" aria-label={k === 'h' ? 'Hour up' : 'Minute up'} onClick={() => setT(time.h + (k === 'h' ? 1 : 0), time.mi + (k === 'mi' ? 1 : 0))} className="w-9 h-5 rounded text-[#7C8594] hover:bg-[#171B24]">▴</button>
                      <span className="w-9 h-8 rounded-lg bg-[#161A22] flex items-center justify-center">{pad(k === 'h' ? time.h : time.mi)}</span>
                      <button type="button" aria-label={k === 'h' ? 'Hour down' : 'Minute down'} onClick={() => setT(time.h - (k === 'h' ? 1 : 0), time.mi - (k === 'mi' ? 1 : 0))} className="w-9 h-5 rounded text-[#7C8594] hover:bg-[#171B24]">▾</button>
                    </span>
                  </React.Fragment>
                ))}
              </span>
            </div>
          )}
          <div className="mt-3 flex justify-between">
            <button type="button" onClick={() => { const t = new Date(); emit(str(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes())); if (!withTime) setOpen(false); }}
              className="h-8 px-3 rounded-lg text-[12.5px] text-[#F2A65A] hover:bg-[#171B24]">{withTime ? 'Now' : 'Today'}</button>
            <button type="button" onClick={() => { setOpen(false); btn.current?.focus(); }} className="h-8 px-3 rounded-lg text-[12.5px] text-[#E9ECF1] bg-[#171B24] border border-[#232936]">Done</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};
