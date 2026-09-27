import React from 'react';
import { clsx } from 'clsx';
import { HealthState } from '../../types';

interface BadgeProps {
  status: HealthState | 'AOS' | 'LOS' | 'PENDING' | 'ACK' | 'NACK' | 'EXECUTING' | 'STALE' | 'QUEUED' | 'COMPLETE' | 'FAILED' | 'PENDING_ACK' | string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Status is shape and colour together (Astro ground-system convention), so it reads for
 * colour-blind operators and from across the room: ● normal, ○ standby, ▲ caution, ■ critical.
 */
export type Glyph = 'normal' | 'standby' | 'caution' | 'critical' | 'off';
export const StatusGlyph: React.FC<{ kind: Glyph; className?: string }> = ({ kind, className }) => {
  const base = clsx('inline-block shrink-0 bg-current', className);
  if (kind === 'caution') return <span aria-hidden="true" className={clsx('inline-block shrink-0 w-0 h-0 border-l-[4.5px] border-r-[4.5px] border-b-[8px] border-l-transparent border-r-transparent border-b-current', className)} />;
  if (kind === 'critical') return <span aria-hidden="true" className={clsx(base, 'w-[8px] h-[8px]')} />;
  if (kind === 'standby') return <span aria-hidden="true" className={clsx('inline-block shrink-0 w-[8px] h-[8px] rounded-full border-2 border-current', className)} />;
  if (kind === 'off') return <span aria-hidden="true" className={clsx('inline-block shrink-0 w-[8px] h-[2px] bg-current', className)} />;
  return <span aria-hidden="true" className={clsx(base, 'w-[8px] h-[8px] rounded-full')} />;
};

const GLYPH: Record<string, Glyph> = {
  NOMINAL: 'normal', ACK: 'normal', COMPLETE: 'normal', COMPLETED: 'normal', AOS: 'normal',
  WARNING: 'caution', PENDING: 'caution', PENDING_ACK: 'caution', DEGRADED: 'caution',
  CRITICAL: 'critical', NACK: 'critical', FAILED: 'critical', ABORTED: 'critical', SAFE: 'critical',
  EXECUTING: 'standby', QUEUED: 'standby', LOS: 'off', STALE: 'off', NO_DATA: 'off',
};

export const StatusBadge: React.FC<BadgeProps> = ({ status, size = 'md', className }) => {
  let colorStyle = 'bg-[color-mix(in_srgb,var(--color-border-hover)_20%,transparent)] text-[var(--color-text-secondary)] border-[color-mix(in_srgb,var(--color-border-hover)_40%,transparent)]';
  let pulse = '';

  switch (status) {
    case 'NOMINAL':
    case 'ACK':
    case 'COMPLETE':
      colorStyle = 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_30%,transparent)]';
      break;
    case 'WARNING':
      // WARNING is static — only CRITICAL and EXECUTING pulse
      colorStyle = 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)]';
      break;
    case 'PENDING':
    case 'PENDING_ACK':
      // Outline/dashed style for pending states
      colorStyle = 'bg-transparent text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_50%,transparent)] border-dashed';
      break;
    case 'CRITICAL':
    case 'NACK':
    case 'FAILED':
      colorStyle = 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger-text)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)]';
      pulse = 'pulse-critical';
      break;
    case 'AOS':
      // AOS = info blue (var(--info)) — teal is reserved for interactive actions only
      colorStyle = 'bg-[color-mix(in_srgb,var(--info)_15%,transparent)] text-[var(--info)] border-[color-mix(in_srgb,var(--info)_30%,transparent)]';
      break;
    case 'LOS':
      colorStyle = 'bg-[color-mix(in_srgb,var(--color-border-hover)_20%,transparent)] text-[var(--color-text-secondary)] border-[color-mix(in_srgb,var(--color-border-hover)_40%,transparent)]';
      break;
    case 'EXECUTING':
      colorStyle = 'bg-[color-mix(in_srgb,var(--info)_15%,transparent)] text-[var(--info)] border-[color-mix(in_srgb,var(--info)_30%,transparent)]';
      pulse = 'pulse-info';
      break;
    case 'STALE':
      colorStyle = 'bg-[color-mix(in_srgb,var(--color-border-hover)_30%,transparent)] text-[var(--color-text-secondary)] border-[color-mix(in_srgb,var(--color-border-hover)_50%,transparent)]';
      break;
    case 'QUEUED':
      colorStyle = 'bg-[color-mix(in_srgb,var(--color-border)_40%,transparent)] text-[var(--color-text-secondary)] border-[color-mix(in_srgb,var(--color-border)_60%,transparent)]';
      break;
    case 'ABORTED':
      colorStyle = 'bg-transparent text-[var(--danger-text)] border-[color-mix(in_srgb,var(--danger)_50%,transparent)] border-dashed';
      break;
  }

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 font-mono-code font-medium border rounded-[2px] uppercase tracking-[0.06em]',
        sizeClasses[size],
        colorStyle,
        pulse,
        className
      )}
    >
      <StatusGlyph kind={GLYPH[status] ?? 'standby'} />
      {status}
    </span>
  );
};
