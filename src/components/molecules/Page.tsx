import React from 'react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import { drawer as drawerVariants, overlay, panel } from '../../lib/motion';

/**
 * Page furniture. The look is carried here rather than in each screen, so
 * twenty-nine screens read as one product instead of twenty-nine opinions.
 */

/** Page head: flat, the title leads, actions sit beside it, a single rule underneath. */
export const PageHead: React.FC<{ title: string; sub?: string; actions?: React.ReactNode }> = ({ title, sub, actions }) => (
  <div className="flex items-end justify-between gap-6 mb-5 pb-3 border-b border-[#213044]">
    <div className="flex flex-col gap-1 min-w-0">
      <h1 className="font-display-title text-[20px] leading-[1.2] font-medium tracking-[0.01em] text-[#E6EDF3]">{title}</h1>
      {sub && <p className="text-[12.5px] leading-[1.5] text-[#8496AB] max-w-[80ch]">{sub}</p>}
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
      <header className="flex items-center justify-between gap-3 px-4 h-11 border-b border-[#213044]">
        {title && <h2 className="label-caps truncate">{title}</h2>}
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </header>
    )}
    <div className="p-4">{children}</div>
  </motion.section>
);

const TONE: Record<string, { text: string; accent: string }> = {
  ok:       { text: 'text-[#56F000]', accent: '#56F000' },
  warn:     { text: 'text-[#FCE83A]', accent: '#FCE83A' },
  crit:     { text: 'text-[#FF3838]', accent: '#D42C2C' },
  info:     { text: 'text-[#2DCCFF]', accent: '#2DCCFF' },
  pending:  { text: 'text-[#9C9AEC]', accent: '#9C9AEC' },
  advisory: { text: 'text-[#C77DDB]', accent: '#C77DDB' },
  plain:    { text: 'text-[#E6EDF3]', accent: 'transparent' },
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
        <span className="text-[12.5px] text-[#A3B1C2] leading-tight">{label}</span>
        {sub && <span className="text-[11px] text-[#8496AB] leading-tight">{sub}</span>}
      </Tag>
    </motion.div>
  );
};

export const Th: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <th className={clsx('label-caps text-left px-3 py-2.5 border-b border-[#213044] bg-[#111A25]/60 sticky top-0 backdrop-blur-sm', className)}>
    {children}
  </th>
);

export const Td: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <td className={clsx('px-3 py-2.5 text-[13px] border-b border-[#1A2738] text-[#C9D4E0]', className)}>{children}</td>
);

const BANNER_TONE = {
  info:     { ring: '#2DCCFF', wash: 'rgba(45,204,255,.06)',  lead: 'text-[#2DCCFF]' },
  warn:     { ring: '#FCE83A', wash: 'rgba(252,232,58,.05)',  lead: 'text-[#FCE83A]' },
  crit:     { ring: '#FF3838', wash: 'rgba(255,56,56,.08)',   lead: 'text-[#FF3838]' },
  ok:       { ring: '#56F000', wash: 'rgba(86,240,0,.05)',    lead: 'text-[#56F000]' },
  advisory: { ring: '#C77DDB', wash: 'rgba(199,125,219,.06)', lead: 'text-[#C77DDB]' },
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
      className="flex items-center justify-between gap-4 px-4 py-2.5 mb-4 border-l-[3px]"
      style={{ background: t.wash, borderLeftColor: t.ring, borderRadius: 0 }}
    >
      <p className="text-[13px] leading-[1.5] text-[#C9D4E0]">
        {lead && <strong className={clsx('font-medium mr-1.5', t.lead)}>{lead}</strong>}
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
      className="fixed inset-0 bg-[#1A2738]/55 backdrop-blur-[2px] z-40"
    />
    <motion.aside
      variants={drawerVariants} initial="hidden" animate="show" exit="exit"
      className="fixed top-0 right-0 h-full w-[460px] max-w-full z-50 flex flex-col bg-[#16222F] border-l border-[#30435B]"
      style={{ boxShadow: 'var(--lift-3)' }}
      aria-label={title}
    >
      <header className="flex items-center justify-between px-5 h-14 shrink-0 border-b border-[#213044]">
        <h2 className="text-[15px] font-bold tracking-[-0.01em]">{title}</h2>
        <button onClick={onClose} aria-label="Close"
          className="w-7 h-7 rounded flex items-center justify-center text-[#8496AB] hover:text-[#E6EDF3] hover:bg-[#1A2738] transition-colors">
          ✕
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">{children}</div>
      {footer && <footer className="px-5 py-4 border-t border-[#213044] flex justify-end gap-2 shrink-0">{footer}</footer>}
    </motion.aside>
  </>
);

/** Content that has not arrived yet takes the shape it will have. */
export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={clsx('skeleton', className)} />
);
