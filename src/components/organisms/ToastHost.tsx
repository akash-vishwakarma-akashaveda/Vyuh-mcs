import React from 'react';
import { clsx } from 'clsx';
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { ToastKind, useToastStore } from '../../store/useToastStore';

const STYLE: Record<ToastKind, { icon: React.ElementType; bar: string; text: string }> = {
  critical: { icon: AlertOctagon, bar: 'bg-[#C62828]', text: 'text-[#FF6B6B]' },
  warning: { icon: AlertTriangle, bar: 'bg-[#E8943A]', text: 'text-[#E8943A]' },
  success: { icon: CheckCircle2, bar: 'bg-[#4CAF81]', text: 'text-[#4CAF81]' },
  info: { icon: Info, bar: 'bg-[#4A9EFF]', text: 'text-[#4A9EFF]' },
};

/** Bottom-right stack. Critical toasts use role=alert (announced at once); the rest are polite. */
export const ToastHost: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="fixed bottom-4 right-4 z-[80] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)]" aria-live="polite">
      {toasts.map((t) => {
        const s = STYLE[t.kind];
        const Icon = s.icon;
        return (
          <div key={t.id} role={t.kind === 'critical' ? 'alert' : 'status'}
            className="relative flex gap-3 rounded-lg border border-[#2B303B] bg-[#14161B] pl-4 pr-2 py-3 shadow-[0_12px_32px_rgba(0,0,0,.35)] overflow-hidden">
            <span className={clsx('absolute left-0 top-0 bottom-0 w-1', s.bar)} aria-hidden="true" />
            <Icon size={18} className={clsx('mt-0.5 shrink-0', s.text)} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[#F3F4F6] leading-snug">{t.title}</p>
              {t.body && <p className="text-[12px] text-[#A1A7B3] mt-0.5 leading-snug break-words">{t.body}</p>}
              {t.action && (
                <button onClick={() => { onNavigate(t.action!.route); dismiss(t.id); }}
                  className="mt-1.5 text-[12px] font-medium text-[#3CB992] hover:underline">
                  {t.action.label}
                </button>
              )}
            </div>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification"
              className="w-6 h-6 shrink-0 rounded flex items-center justify-center text-[#8B92A0] hover:text-[#F3F4F6] hover:bg-[#22262F]">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
