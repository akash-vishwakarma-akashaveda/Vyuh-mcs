import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * The console's one dialog. Escape closes it, Tab stays inside it, and focus goes back to
 * whatever opened it. Put the safe choice first in the footer (with autoFocus) so it gets focus.
 */
export const Modal: React.FC<{
  title: string; onClose: () => void; footer?: React.ReactNode; children: React.ReactNode;
  wide?: boolean; size?: 'md' | 'lg' | 'xl'; sub?: React.ReactNode; headerActions?: React.ReactNode;
}> = ({ title, onClose, footer, children, wide, size, sub, headerActions }) => {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // Captured during the first render, before an autoFocus inside moves focus.
  const opener = useRef(typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null);

  useEffect(() => {
    const el = box.current;
    // Respect an autoFocus inside; otherwise focus the first control.
    if (el && !el.contains(document.activeElement)) (el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close.current(); return; }
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', k, true);
    return () => { window.removeEventListener('keydown', k, true); opener.current?.focus?.(); };
  }, []);

  const max = size === 'xl' ? 'max-w-[980px]' : size === 'lg' || wide ? 'max-w-[720px]' : 'max-w-[520px]';
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className={`w-full ${max} rounded-2xl border border-[#232936] bg-[#11141B] shadow-2xl flex flex-col max-h-[88vh] outline-none`}>
        <header className="flex items-center justify-between gap-3 px-5 min-h-14 py-3 border-b border-[#1A1E27] shrink-0">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            {sub && <p className="text-[12.5px] text-[#7C8594] mt-0.5">{sub}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerActions}
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9AA3B2] hover:bg-[#1A1E27]"><X size={16} /></button>
          </div>
        </header>
        <div className="p-5 flex flex-col gap-4 overflow-y-auto">{children}</div>
        {footer && <footer className="px-5 py-4 border-t border-[#1A1E27] flex flex-wrap justify-end gap-2 shrink-0">{footer}</footer>}
      </div>
    </div>
  );
};
