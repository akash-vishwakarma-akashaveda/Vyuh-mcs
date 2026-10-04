import React from 'react';
import { clsx } from 'clsx';
import { HealthState } from '../../types';

interface BadgeProps {
  status: HealthState | 'AOS' | 'LOS' | 'PENDING' | 'ACK' | 'NACK' | 'EXECUTING' | 'STALE' | 'QUEUED' | 'COMPLETE' | 'FAILED' | 'PENDING_ACK' | string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Override the shown text (the status still decides the colour and shape). */
  label?: string;
}

/**
 * Status is shape and colour together, so it reads for colour-blind operators:
 * ● normal, ○ standby, ▲ caution, ■ critical, – off.
 */
export type Glyph = 'normal' | 'standby' | 'caution' | 'critical' | 'off';
export const StatusGlyph: React.FC<{ kind: Glyph; className?: string }> = ({ kind, className }) => {
  const base = clsx('inline-block shrink-0 bg-current', className);
  if (kind === 'caution') return <span aria-hidden="true" className={clsx('inline-block shrink-0 w-0 h-0 border-l-[4px] border-r-[4px] border-b-[7px] border-l-transparent border-r-transparent border-b-current', className)} />;
  if (kind === 'critical') return <span aria-hidden="true" className={clsx(base, 'w-[7px] h-[7px] rounded-[1px]')} />;
  if (kind === 'standby') return <span aria-hidden="true" className={clsx('inline-block shrink-0 w-[7px] h-[7px] rounded-full border-[1.5px] border-current', className)} />;
  if (kind === 'off') return <span aria-hidden="true" className={clsx('inline-block shrink-0 w-[7px] h-[2px] bg-current', className)} />;
  return <span aria-hidden="true" className={clsx(base, 'w-[7px] h-[7px] rounded-full')} />;
};

const GLYPH: Record<string, Glyph> = {
  NOMINAL: 'normal', ACK: 'normal', COMPLETE: 'normal', COMPLETED: 'normal', AOS: 'normal', ACCEPTED: 'normal', DELIVERED: 'normal', ACTIVE: 'normal', BOOKED: 'normal', PASSED: 'normal', VERIFIED: 'normal',
  WARNING: 'caution', PENDING: 'caution', PENDING_ACK: 'caution', DEGRADED: 'caution', AWAITING_APPROVAL: 'caution', REQUESTED: 'caution', SHIFTED: 'caution',
  CRITICAL: 'critical', NACK: 'critical', FAILED: 'critical', ABORTED: 'critical', SAFE: 'critical', REJECTED: 'critical', EXECUTION_FAILED: 'critical', EXPIRED: 'critical',
  EXECUTING: 'standby', QUEUED: 'standby', SENT: 'standby', RELEASED: 'standby', STARTED: 'standby', ACKNOWLEDGED: 'standby', RUNNING: 'standby',
  LOS: 'off', STALE: 'off', NO_DATA: 'off', CANCELLED: 'off',
};

/** Tinted pill colours: background, text. */
export const TONES = {
  ok: ['rgba(74,222,154,0.12)', '#4ADE9A'],
  warn: ['rgba(245,196,81,0.14)', '#F5C451'],
  crit: ['rgba(255,107,107,0.15)', '#FF7A7A'],
  info: ['rgba(108,184,255,0.12)', '#8CC8FF'],
  action: ['rgba(242,140,40,0.14)', '#F2A65A'],
  violet: ['rgba(155,140,255,0.14)', '#B4A8FF'],
  neutral: ['#232936', '#C9CED6'],
} as const;
export type Tone = keyof typeof TONES;

const TONE_OF: Record<Glyph, Tone> = { normal: 'ok', caution: 'warn', critical: 'crit', standby: 'info', off: 'neutral' };

/** "AWAITING_APPROVAL" → "Awaiting approval". */
export const humanise = (s: string) => {
  const t = s.replace(/_/g, ' ').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** A tinted pill. Use for any short state, tag or count. */
export const Pill: React.FC<{ tone?: Tone; glyph?: Glyph; className?: string; children: React.ReactNode }> = ({ tone = 'neutral', glyph, className, children }) => {
  const [bg, fg] = TONES[tone];
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[12px] leading-[1.3] whitespace-nowrap', className)} style={{ background: bg, color: fg }}>
      {glyph && <StatusGlyph kind={glyph} />}
      {children}
    </span>
  );
};

export const StatusBadge: React.FC<BadgeProps> = ({ status, size = 'md', className, label }) => {
  const glyph = GLYPH[status] ?? 'standby';
  return (
    <Pill
      tone={TONE_OF[glyph]}
      glyph={glyph}
      className={clsx(size === 'sm' && 'text-[11px] px-2 py-[2px]', size === 'lg' && 'text-[13px] px-3 py-1', status === 'CRITICAL' && 'pulse-critical', className)}
    >
      {label ?? humanise(String(status))}
    </Pill>
  );
};
