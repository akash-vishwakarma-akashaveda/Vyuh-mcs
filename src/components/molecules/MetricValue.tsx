import React from 'react';
import { clsx } from 'clsx';

interface MetricValueProps {
  value: string | number;
  unit?: string;
  label?: string;
  size?: 'sm' | 'md' | 'lg' | 'display';
  alarmState?: 0 | 1 | 2;
  isStale?: boolean;
  className?: string;
}

export const MetricValue: React.FC<MetricValueProps> = ({
  value,
  unit,
  label,
  size = 'md',
  alarmState = 0,
  isStale = false,
  className,
}) => {
  let textColor = 'text-[var(--color-text-primary)]';
  if (alarmState === 1) textColor = 'text-[var(--warning)]';
  if (alarmState === 2) textColor = 'text-[var(--danger-text)]';
  if (isStale) textColor = 'text-[var(--color-border-hover)]';

  const sizeClasses = {
    sm: 'text-sm font-semibold',
    md: 'text-lg font-semibold',
    lg: 'text-2xl font-bold',
    display: 'text-3xl font-display-title font-bold',
  };

  return (
    <div className={clsx('flex flex-col gap-0.5', className)}>
      {label && <span className="text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">{label}</span>}
      <div className="flex items-baseline gap-1 font-mono-code">
        <span className={clsx(sizeClasses[size], textColor)}>{value}</span>
        {unit && <span className="text-xs text-[var(--color-text-secondary)] font-normal">{unit}</span>}
      </div>
    </div>
  );
};
