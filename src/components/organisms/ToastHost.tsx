import React from 'react';
import { clsx } from 'clsx';
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { Toast, ToastKind, useToastStore } from '../../store/useToastStore';
import { useAuthStore } from '../../store/useAuthStore';
import { canOpenRoute, whoCanOpen } from '../../auth/policy';
import { inScope } from '../../store/govern';

const STYLE: Record<ToastKind, { icon: React.ElementType; text: string }> = {
  critical: { icon: AlertOctagon, text: 'text-[#FF7A7A]' },
  warning: { icon: AlertTriangle, text: 'text-[#F5C451]' },
  success: { icon: CheckCircle2, text: 'text-[#4ADE9A]' },
  info: { icon: Info, text: 'text-[#8CC8FF]' },
};

const SAT_ID = /\b[A-Z]{3}-\d{2}\b|\bOPSSAT-\d\b/g;
/**
 * Tenant isolation: a customer sees a toast only if every satellite it names is theirs.
 * ponytail: matches satellite ids in the text; carry satId on Toast to make this exact.
 */
const visibleTo = (t: Toast, role: string, scope: string[]) =>
  role !== 'Customer User' || (`${t.title} ${t.body ?? ''}`.match(SAT_ID) ?? []).every((id) => inScope(id, scope));

/** Bottom-right stack. Critical toasts use role=alert (announced at once); the rest are polite. */
export const ToastHost: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const role = useAuthStore((s) => s.activeRole);
  const scope = useAuthStore((s) => s.user.satellite_scope);

  return (
    <div className="fixed top-20 right-5 z-[80] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)]" aria-live="polite">
      {toasts.filter((t) => visibleTo(t, role, scope)).map((t) => {
        const s = STYLE[t.kind];
        const Icon = s.icon;
        const canGo = t.action && canOpenRoute(t.action.route, role);
        return (
          <div key={t.id} role={t.kind === 'critical' ? 'alert' : 'status'}
            className="flex gap-3 rounded-2xl border border-[#232936] bg-[#11141B] pl-4 pr-2 py-3" style={{ boxShadow: 'var(--lift-3)' }}>
            <Icon size={18} className={clsx('mt-0.5 shrink-0', s.text)} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[#E9ECF1] leading-snug">{t.title}</p>
              {t.body && <p className="text-[12.5px] text-[#9AA3B2] mt-0.5 leading-snug break-words">{t.body}</p>}
              {t.action && (canGo
                ? <button onClick={() => { onNavigate(t.action!.route); dismiss(t.id); }} className="mt-1.5 text-[12.5px] font-medium text-[#F2A65A] hover:text-[#FFC48A]">{t.action.label}</button>
                : <p className="mt-1.5 text-[12px] text-[#7C8594]">Handled by {whoCanOpen(t.action.route)}</p>)}
            </div>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification"
              className="w-6 h-6 shrink-0 rounded-lg flex items-center justify-center text-[#7C8594] hover:text-[#E9ECF1] hover:bg-[#1A1E27]">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
