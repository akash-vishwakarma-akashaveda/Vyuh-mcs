import React from 'react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import { drawer as drawerVariants, overlay } from '../../lib/motion';

/**
 * Page furniture. The look lives here, not in each screen: soft filled cards,
 * one clear title per page, big numbers with small plain labels.
 */

/** Page head: title and context on the left, the page's actions on the right. */
export const PageHead: React.FC<{ title: string; sub?: React.ReactNode; actions?: React.ReactNode; crumb?: React.ReactNode }> = ({ title, sub, actions, crumb }) => (
  <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
    <div className="flex flex-col gap-1.5 min-w-0">
      {crumb && <div className="text-[13px] text-[#7C8594]">{crumb}</div>}
      <h1 className="text-[22px] leading-[1.2] font-semibold tracking-[-0.01em] text-[#E9ECF1]">{title}</h1>
      {sub && <div className="text-[13px] leading-[1.5] text-[#7C8594] max-w-[90ch]">{sub}</div>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

/** Card: a soft filled surface. The title is a quiet sentence-case label. */
export const Card: React.FC<{
  title?: React.ReactNode; actions?: React.ReactNode; className?: string; accent?: string; flush?: boolean; children: React.ReactNode;
}> = ({ title, actions, className, flush, children }) => (
  <section className={clsx('bg-[#11141B] border border-[#1A1E27] rounded-2xl relative overflow-hidden', className)}>
    {(title || actions) && (
      <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-1">
        {title && <h2 className="text-[14px] font-medium text-[#E9ECF1] truncate">{title}</h2>}
        {actions && <div className="flex items-center gap-2 shrink-0 text-[12.5px]">{actions}</div>}
      </header>
    )}
    <div className={flush ? '' : 'px-5 pb-5 pt-3'}>{children}</div>
  </section>
);

/** An inner tile inside a card. */
export const Tile: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <div className={clsx('bg-[#161A22] rounded-xl px-3.5 py-3', className)}>{children}</div>
);

const TONE: Record<string, string> = {
  ok: 'text-[#4ADE9A]', warn: 'text-[#F5C451]', crit: 'text-[#FF7A7A]', info: 'text-[#8CC8FF]',
  pending: 'text-[#B4A8FF]', advisory: 'text-[#C77DDB]', plain: 'text-[#E9ECF1]', action: 'text-[#F2A65A]',
};

/** KPI tile. The number is the object; the label is its caption. */
export const KpiTile: React.FC<{
  value: React.ReactNode; label: string; sub?: React.ReactNode; tone?: keyof typeof TONE; onClick?: () => void; children?: React.ReactNode;
}> = ({ value, label, sub, tone = 'plain', onClick, children }) => {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { onClick, type: 'button' as const } : {})}
      className={clsx(
        'bg-[#11141B] border border-[#1A1E27] rounded-2xl w-full text-left px-5 py-4 flex flex-col gap-2',
        onClick && 'hover:bg-[#141821] cursor-pointer'
      )}
    >
      <span className="text-[13px] text-[#9AA3B2] leading-tight">{label}</span>
      <span className={clsx('numeric text-[32px] font-semibold tracking-[-0.02em]', TONE[tone])}>{value}</span>
      {sub && <span className="text-[12.5px] text-[#7C8594] leading-snug">{sub}</span>}
      {children}
    </Tag>
  );
};

/** A row of KPI tiles that wraps on narrow screens. */
export const KpiRow: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={clsx('grid gap-4 mb-5', className)} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>{children}</div>
);

export const Th: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className }) => (
  <th className={clsx('text-left px-3 py-2.5 text-[12px] font-normal text-[#6B7383] bg-[#11141B] sticky top-0', className)}>
    {children}
  </th>
);

export const Td: React.FC<{ children?: React.ReactNode; className?: string; colSpan?: number }> = ({ children, className, colSpan }) => (
  <td colSpan={colSpan} className={clsx('px-3 py-2.5 text-[13px] border-t border-[#161A22] text-[#C9CED6]', className)}>{children}</td>
);

const BANNER_TONE = {
  info:     { wash: 'rgba(108,184,255,0.08)', lead: 'text-[#8CC8FF]' },
  warn:     { wash: 'rgba(245,196,81,0.08)',  lead: 'text-[#F5C451]' },
  crit:     { wash: 'rgba(255,107,107,0.09)', lead: 'text-[#FF7A7A]' },
  ok:       { wash: 'rgba(74,222,154,0.08)',  lead: 'text-[#4ADE9A]' },
  advisory: { wash: 'rgba(199,125,219,0.08)', lead: 'text-[#D9A2E8]' },
  action:   { wash: 'rgba(242,140,40,0.09)',  lead: 'text-[#F2A65A]' },
};

/** A soft tinted note across the page. */
export const Banner: React.FC<{
  kind?: keyof typeof BANNER_TONE; lead?: string; children: React.ReactNode; action?: React.ReactNode;
}> = ({ kind = 'info', lead, children, action }) => {
  const t = BANNER_TONE[kind];
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 mb-4 rounded-xl" style={{ background: t.wash }}>
      <p className="text-[13.5px] leading-[1.5] text-[#C9CED6]">
        {lead && <strong className={clsx('font-medium mr-1.5', t.lead)}>{lead}</strong>}
        {children}
      </p>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};

/** Right-hand drawer. Escape closes it. */
export const Drawer: React.FC<{ title: string; onClose: () => void; footer?: React.ReactNode; children: React.ReactNode }> = ({
  title, onClose, footer, children,
}) => {
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <motion.div
        variants={overlay} initial="hidden" animate="show" exit="exit"
        onClick={onClose}
        className="fixed inset-0 bg-[#05070A]/60 z-40"
      />
      <motion.aside
        variants={drawerVariants} initial="hidden" animate="show" exit="exit"
        role="dialog" aria-modal="true" aria-label={title}
        className="fixed top-2 right-2 bottom-2 w-[480px] max-w-[calc(100%-16px)] z-50 flex flex-col bg-[#11141B] border border-[#1A1E27] rounded-2xl"
        style={{ boxShadow: 'var(--lift-3)' }}
      >
        <header className="flex items-center justify-between px-5 h-14 shrink-0">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#7C8594] hover:text-[#E9ECF1] hover:bg-[#171B24]">
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 pb-5 flex flex-col gap-4">{children}</div>
        {footer && <footer className="px-5 py-4 border-t border-[#1A1E27] flex flex-wrap justify-end gap-2 shrink-0">{footer}</footer>}
      </motion.aside>
    </>
  );
};

/** Content that has not arrived yet takes the shape it will have. */
export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={clsx('skeleton', className)} />
);

/** Segmented control: a small group of mutually exclusive options. */
export function Segmented<T extends string>({ value, options, onChange, size = 'md', className }: {
  value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void; size?: 'sm' | 'md'; className?: string;
}) {
  return (
    <div role="group" className={clsx('inline-flex p-[3px] rounded-xl bg-[#11141B] border border-[#1A1E27]', className)}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          className={clsx('rounded-[9px] px-3 whitespace-nowrap', size === 'sm' ? 'h-7 text-[12.5px]' : 'h-8 text-[13px]',
            o.value === value ? 'bg-[#232936] text-white' : 'text-[#9AA3B2] hover:text-[#E9ECF1]')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Marks anything that is not from the backend. */
export const SampleTag: React.FC<{ className?: string; children?: React.ReactNode }> = ({ className, children }) => (
  <span className={clsx('inline-flex items-center rounded-full px-2 py-[2px] text-[11px] text-[#9AA3B2] bg-[#1A1E27]', className)} title="Not from the backend yet">
    {children ?? 'Sample data'}
  </span>
);

/** Progress ring for "4 of 9" style counts. */
export const Ring: React.FC<{ value: number; max: number; size?: number; color?: string; label?: React.ReactNode }> = ({ value, max, size = 64, color = '#F28C28', label }) => {
  const r = size / 2 - 6, c = 2 * Math.PI * r, f = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${value} of ${max}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1A1E27" strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${c * f} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="54%" textAnchor="middle" dominantBaseline="middle" fill="#E9ECF1" fontSize={size / 4.4} fontWeight={600}>{label ?? `${value}/${max}`}</text>
    </svg>
  );
};

/** Thin horizontal meter. */
export const Meter: React.FC<{ value: number; max?: number; color?: string; className?: string }> = ({ value, max = 100, color = '#6CB8FF', className }) => (
  <span className={clsx('block h-1.5 rounded-full bg-[#1A1E27] overflow-hidden', className)}>
    <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: color }} />
  </span>
);
