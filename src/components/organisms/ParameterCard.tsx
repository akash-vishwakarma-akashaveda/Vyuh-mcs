import React from 'react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import { Param } from '../../types';
import { LimitBar } from '../molecules/LimitBar';
import { Sparkline } from '../molecules/Sparkline';
import { panel } from '../../lib/motion';
import { formatUTC } from '../../utils/formatUTC';
import { isStale } from '../../utils/stalenessUtils';

const STATE = {
  0: { label: 'NOMINAL', text: 'var(--neutral-50)', accent: 'var(--success)', spark: 'var(--success)' },
  1: { label: 'WARNING', text: 'var(--warning)', accent: 'var(--warning)', spark: 'var(--warning)' },
  2: { label: 'CRITICAL', text: 'var(--danger-text)', accent: 'var(--danger)', spark: 'var(--danger)' },
} as const;

/**
 * The most repeated object in the console, so it carries the most of its
 * character. Mnemonic identifies, value dominates, everything else recedes —
 * and the value never animates, whatever else does.
 */
export const ParameterCard: React.FC<{ param: Param; onClick?: () => void }> = ({ param, onClick }) => {
  const stale = isStale(param);
  const s = STATE[param.alarm_state ?? 0];

  return (
    <motion.button
      type="button"
      variants={panel}
      onClick={onClick}
      className={clsx(
        'surface surface-interactive accent-top group relative w-full text-left px-4 pt-3.5 pb-3 flex flex-col gap-3',
        param.alarm_state === 2 && !stale && 'sev-critical'
      )}
      style={{ ['--accent' as string]: stale ? '#3E5370' : s.accent }}
      aria-label={`${param.param_id} ${param.eu_value} ${param.unit} ${stale ? 'stale' : s.label}`}
    >
      {/* Identity */}
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="flex flex-col min-w-0">
          <span className="mono text-[12.5px] font-bold text-[#4DACFF] group-hover:text-[#4ED7AC] transition-colors">
            {param.param_id}
          </span>
          <span className="text-[11.5px] text-[#8496AB] truncate">{param.name}</span>
        </div>
        {(stale || param.alarm_state > 0) && (
          <span
            className="mono text-[9.5px] font-bold tracking-[0.08em] px-1.5 py-0.5 rounded-[3px] shrink-0"
            style={{
              color: stale ? 'var(--neutral-400)' : s.text,
              boxShadow: `inset 0 0 0 1px ${stale ? '#2A3B52' : s.accent}66`,
              background: stale ? 'transparent' : `${s.accent}1A`,
            }}
          >
            {stale ? 'STALE' : s.label}
          </span>
        )}
      </div>

      {/* Value — snaps, never tweens */}
      <div className={clsx('flex items-end justify-between gap-3', stale && 'opacity-45')}>
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="numeric text-[28px] font-bold" style={{ color: stale ? 'var(--neutral-400)' : s.text }}>
            {param.eu_value}
          </span>
          {param.unit && <span className="text-[12px] text-[#8496AB]">{param.unit}</span>}
        </div>
        <Sparkline color={stale ? '#3E5370' : s.spark} />
      </div>

      <LimitBar
        val={param.eu_value}
        lowSoft={param.limit_low_soft}
        hiSoft={param.limit_hi_soft}
        lowHard={param.limit_low_hard}
        hiHard={param.limit_hi_hard}
        isStale={stale}
      />

      {/* Provenance: where it came from and when */}
      <div className="flex justify-between items-center mono text-[10px] text-[#8496AB] pt-0.5">
        <span>
          {param.limit_low_soft ?? '—'} … {param.limit_hi_soft ?? '—'}{param.unit ? ` ${param.unit}` : ''}
        </span>
        <span className={stale ? 'text-[#8496AB]' : ''}>
          {stale ? `last ${formatUTC(param.timestamp_utc, 'HH:mm:ss')}` : formatUTC(param.timestamp_utc, 'HH:mm:ss')}
        </span>
      </div>
    </motion.button>
  );
};
