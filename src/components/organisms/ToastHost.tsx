import React from 'react';
import { clsx } from 'clsx';
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { ToastKind, useToastStore } from '../../store/useToastStore';

const STYLE: Record<ToastKind, { icon: React.ElementType; bar: string; text: string }> = {
  critical: { icon: AlertOctagon, bar: 'bg-[#D42C2C]', text: 'text-[#FF3838]' },
  warning: { icon: AlertTriangle, bar: 'bg-[#FCE83A]', text: 'text-[#FCE83A]' },
  success: { icon: CheckCircle2, bar: 'bg-[#56F000]', text: 'text-[#56F000]' },
  info: { icon: Info, bar: 'bg-[#2DCCFF]', text: 'text-[#2DCCFF]' },
};

/** Bottom-right stack. Critical toasts use role=alert (announced at once); the rest are polite. */
export const ToastHost: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="fixed bottom-24 right-5 z-[80] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)]" aria-live="polite">
      {toasts.map((t) => {
        const s = STYLE[t.kind];
        const Icon = s.icon;
        return (
          <div key={t.id} role={t.kind === 'critical' ? 'alert' : 'status'}
            className="relative flex gap-3 rounded-lg border border-[#2A3B52] bg-[#111A25] pl-4 pr-2 py-3 shadow-[0_12px_32px_rgba(0,0,0,.35)] overflow-hidden">
            <span className={clsx('absolute left-0 top-0 bottom-0 w-1', s.bar)} aria-hidden="true" />
            <Icon size={18} className={clsx('mt-0.5 shrink-0', s.text)} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[#E6EDF3] leading-snug">{t.title}</p>
              {t.body && <p className="text-[12px] text-[#A3B1C2] mt-0.5 leading-snug break-words">{t.body}</p>}
              {t.action && (
                <button onClick={() => { onNavigate(t.action!.route); dismiss(t.id); }}
                  className="mt-1.5 text-[12px] font-medium text-[#4DACFF] hover:underline">
                  {t.action.label}
                </button>
              )}
            </div>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification"
              className="w-6 h-6 shrink-0 rounded flex items-center justify-center text-[#8496AB] hover:text-[#E6EDF3] hover:bg-[#1F2D40]">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
