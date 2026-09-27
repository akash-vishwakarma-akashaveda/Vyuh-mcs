import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/** Centred confirmation dialog. Escape closes it; put the safe choice first so it gets focus. */
export const Modal: React.FC<{ title: string; onClose: () => void; footer: React.ReactNode; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, footer, children, wide }) => {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`w-full ${wide ? 'max-w-[720px]' : 'max-w-[520px]'} rounded-2xl border border-[#2A3B52] bg-[#111A25] shadow-2xl flex flex-col max-h-[88vh]`}>
        <header className="flex items-center justify-between px-5 h-14 border-b border-[#213044] shrink-0">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded flex items-center justify-center text-[#A3B1C2] hover:bg-[#1F2D40]"><X size={16} /></button>
        </header>
        <div className="p-5 flex flex-col gap-4 overflow-y-auto">{children}</div>
        <footer className="px-5 py-4 border-t border-[#213044] flex justify-end gap-2 shrink-0">{footer}</footer>
      </div>
    </div>
  );
};
