import React from 'react';
import { clsx } from 'clsx';

interface LimitBarProps {
  val: number;
  lowHard?: number;
  lowSoft?: number;
  hiSoft?: number;
  hiHard?: number;
  unit?: string;
  isStale?: boolean;
}

export const LimitBar: React.FC<LimitBarProps> = ({
  val,
  lowHard = 0,
  lowSoft = 20,
  hiSoft = 80,
  hiHard = 100,
  unit = '',
  isStale = false,
}) => {
  // Normalize value position between lowHard and hiHard (0 to 100%)
  const range = hiHard - lowHard || 1;
  const clampedVal = Math.min(Math.max(val, lowHard), hiHard);
  const pct = ((clampedVal - lowHard) / range) * 100;

  const softLowPct = Math.max(0, ((lowSoft - lowHard) / range) * 100);
  const softHiPct = Math.min(100, ((hiSoft - lowHard) / range) * 100);

  let barColor = 'bg-[var(--success)]';
  if (val >= hiHard || val <= lowHard) barColor = 'bg-[var(--danger)]';
  else if (val >= hiSoft || val <= lowSoft) barColor = 'bg-[var(--warning)]';

  if (isStale) barColor = 'bg-[var(--color-border-hover)]';

  return (
    <div className="flex flex-col gap-1 w-full text-[10px] font-mono-code text-[var(--color-text-secondary)]">
      <div className="relative w-full h-2 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-full overflow-hidden">
        {/* Soft limit nominal zone highlight */}
        <div
          className="absolute h-full bg-[color-mix(in_srgb,var(--action-primary)_20%,transparent)] border-x border-[color-mix(in_srgb,var(--action-primary)_40%,transparent)]"
          style={{ left: `${softLowPct}%`, width: `${Math.max(0, softHiPct - softLowPct)}%` }}
        />
        {/* Current value indicator dot */}
        <div
          className={clsx('absolute top-0 bottom-0 w-2 -ml-1 rounded-full transition-all duration-180 ease-linear', barColor)}
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[9px] font-mono-code opacity-75">
        <span>{lowHard}</span>
        <span>{lowSoft}</span>
        <span>{hiSoft}</span>
        <span>{hiHard}</span>
      </div>
    </div>
  );
};
