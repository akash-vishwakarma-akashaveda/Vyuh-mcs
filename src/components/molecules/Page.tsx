import React from 'react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import { drawer as drawerVariants, overlay, panel } from '../../lib/motion';

/**
 * Page furniture. The look is carried here rather than in each screen, so
 * twenty-nine screens read as one product instead of twenty-nine opinions.
 */

/** Page head: the title leads, actions sit on the optical baseline beside it. */
export const PageHead: React.FC<{ title: string; sub?: string; actions?: React.ReactNode }> = ({ title, sub, actions }) => (
  <div className="flex items-center justify-between gap-6 mb-5 rounded-xl border border-[#23272F] bg-gradient-to-r from-[#0F6E56]/20 via-[#161A20] to-[#14161B] px-5 py-4 relative overflow-hidden">
    <span className="absolute left-0 top-0 bottom-0 w-1 bg-[#3CB992]" aria-hidden="true" />
    <div className="flex flex-col gap-1 min-w-0 pl-1">
      <h1 className="text-[22px] leading-[1.15] font-semibold tracking-[-0.01em] text-[#F3F4F6]">{title}</h1>
      {sub && <p className="text-[13px] leading-[1.5] text-[#8B92A0] max-w-[70ch]">{sub}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

/**
 * Card. The header is a quiet label strip, not a second title competing with
 * the page head — so a screen has exactly one thing shouting.
 */
export const Card: React.FC<{
  title?: string; actions?: React.ReactNode; className?: string; accent?: string; children: React.ReactNode;
}> = ({ title, actions, className, accent, children }) => (
  <motion.section
    variants={panel}
    className={clsx('surface relative overflow-hidden', accent && 'accent-top', className)}
    style={accent ? ({ ['--accent' as string]: accent }) : undefined}
  >
    {(title || actions) && (
      <header className="flex items-center justify-between gap-3 px-4 h-11 border-b border-[#23272F]">
        {title && <h2 className="label-caps truncate">{title}</h2>}
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </header>
    )}
    <div className="p-4">{children}</div>
  </motion.section>
);

const TONE: Record<string, { text: string; accent: string }> = {
  ok:       { text: 'text-[#4CAF81]', accent: '#4CAF81' },
  warn:     { text: 'text-[#E8943A]', accent: '#E8943A' },
  crit:     { text: 'text-[#FF6B6B]', accent: '#C62828' },
  info:     { text: 'text-[#4A9EFF]', accent: '#4A9EFF' },
  pending:  { text: 'text-[#9C9AEC]', accent: '#9C9AEC' },
  advisory: { text: 'text-[#C77DDB]', accent: '#C77DDB' },
  plain:    { text: 'text-[#F3F4F6]', accent: 'transparent' },
};

/** KPI tile. The number is the object; the label is its caption. */
export const KpiTile: React.FC<{
  value: React.ReactNode; label: string; sub?: string; tone?: keyof typeof TONE; onClick?: () => void;
}> = ({ value, label, sub, tone = 'plain', onClick }) => {
  const t = TONE[tone];
  const Tag = onClick ? 'button' : 'div';
  return (
    <motion.div variants={panel}>
      <Tag
        {...(onClick ? { onClick, type: 'button' as const } : {})}
        className={clsx(
          'surface accent-top relative w-full text-left px-4 py-3.5 flex flex-col gap-1',
          onClick && 'surface-interactive cursor-pointer'
        )}
        style={{ ['--accent' as string]: t.accent }}
      >
        <span className={clsx('numeric text-[28px] font-semibold', t.text)}>{value}</span>
        <span className="text-[12.5px] text-[#A1A7B3] leading-tight">{label}</span>
        {sub && <span className="text-[11px] text-[#8B92A0] leading-tight">{sub}</span>}
      </Tag>
    </motion.div>
  );
};

export const Th: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <th className={clsx('label-caps text-left px-3 py-2.5 border-b border-[#23272F] bg-[#14161B]/60 sticky top-0 backdrop-blur-sm', className)}>
    {children}
  </th>
);

export const Td: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <td className={clsx('px-3 py-2.5 text-[13px] border-b border-[#1B1F26] text-[#D1D5DB]', className)}>{children}</td>
);

const BANNER_TONE = {
  info:     { ring: 'rgba(74,158,255,.35)',  wash: 'rgba(74,158,255,.07)',  lead: 'text-[#4A9EFF]' },
  warn:     { ring: 'rgba(232,148,58,.35)',  wash: 'rgba(232,148,58,.07)',  lead: 'text-[#E8943A]' },
  crit:     { ring: 'rgba(198,40,40,.45)',   wash: 'rgba(198,40,40,.09)',   lead: 'text-[#FF6B6B]' },
  ok:       { ring: 'rgba(76,175,129,.35)',  wash: 'rgba(76,175,129,.07)',  lead: 'text-[#4CAF81]' },
  advisory: { ring: 'rgba(199,125,219,.35)', wash: 'rgba(199,125,219,.07)', lead: 'text-[#C77DDB]' },
};

export const Banner: React.FC<{
  kind?: keyof typeof BANNER_TONE; lead?: string; children: React.ReactNode; action?: React.ReactNode;
}> = ({ kind = 'info', lead, children, action }) => {
  const t = BANNER_TONE[kind];
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      role="status"
      className="flex items-center justify-between gap-4 rounded-lg px-4 py-3 mb-4"
      style={{ background: t.wash, boxShadow: `inset 0 0 0 1px ${t.ring}` }}
    >
      <p className="text-[13px] leading-[1.5] text-[#1A1D24]">
        {lead && <strong className={clsx('font-bold mr-1.5', t.lead)}>{lead}</strong>}
        {children}
      </p>
      {action && <div className="shrink-0">{action}</div>}
    </motion.div>
  );
};

/** Right-hand drawer, 460 px (SRS §7.5). Slides from where it comes from. */
export const Drawer: React.FC<{ title: string; onClose: () => void; footer?: React.ReactNode; children: React.ReactNode }> = ({
  title, onClose, footer, children,
}) => (
  <>
    <motion.div
      variants={overlay} initial="hidden" animate="show" exit="exit"
      onClick={onClose}
      className="fixed inset-0 bg-[#1B1F26]/55 backdrop-blur-[2px] z-40"
    />
    <motion.aside
      variants={drawerVariants} initial="hidden" animate="show" exit="exit"
      className="fixed top-0 right-0 h-full w-[460px] max-w-full z-50 flex flex-col bg-[#181B21] border-l border-[#2E3440]"
      style={{ boxShadow: 'var(--lift-3)' }}
      aria-label={title}
    >
      <header className="flex items-center justify-between px-5 h-14 shrink-0 border-b border-[#23272F]">
        <h2 className="text-[15px] font-bold tracking-[-0.01em]">{title}</h2>
        <button onClick={onClose} aria-label="Close"
          className="w-7 h-7 rounded flex items-center justify-center text-[#8B92A0] hover:text-[#F3F4F6] hover:bg-[#1B1F26] transition-colors">
          ✕
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">{children}</div>
      {footer && <footer className="px-5 py-4 border-t border-[#23272F] flex justify-end gap-2 shrink-0">{footer}</footer>}
    </motion.aside>
  </>
);

/** Content that has not arrived yet takes the shape it will have. */
export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={clsx('skeleton', className)} />
);
