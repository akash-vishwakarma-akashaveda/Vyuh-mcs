import React from 'react';
import { Param } from '../../types';
import { StatusBadge } from '../atoms/Badge';
import { Sparkline } from './Sparkline';
import { formatUTC } from '../../utils/formatUTC';
import { isStale } from '../../utils/stalenessUtils';

interface ParameterRowProps {
  param: Param;
  onClick?: () => void;
}

export const ParameterRow: React.FC<ParameterRowProps> = ({ param, onClick }) => {
  const stale = isStale(param);
  const statusStr = stale ? 'STALE' : param.alarm_state === 2 ? 'CRITICAL' : param.alarm_state === 1 ? 'WARNING' : 'NOMINAL';

  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between p-3 bg-[var(--color-bg-surface)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-bg-elevated)] rounded-md transition-all duration-180 cursor-pointer group"
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-mono-code font-semibold text-xs text-[var(--action-primary)] group-hover:text-[var(--action-hover)]">
          {param.param_id}
        </span>
        <span className="text-xs text-[var(--color-text-secondary)] truncate max-w-[180px]">{param.name}</span>
      </div>

      <div className="flex items-center gap-4">
        <Sparkline color={param.alarm_state === 2 ? 'var(--danger-text)' : param.alarm_state === 1 ? 'var(--warning)' : 'var(--action-primary)'} />
        
        <div className="flex flex-col items-end min-w-[70px]">
          <span className={`font-mono-code font-bold text-sm ${stale ? 'text-[var(--color-border-hover)]' : 'text-[var(--color-text-primary)]'}`}>
            {param.eu_value} <span className="text-[10px] font-normal text-[var(--color-text-secondary)]">{param.unit}</span>
          </span>
          <span className="text-[9px] font-mono-code text-[var(--color-text-secondary)]">
            {stale ? `Last: ${formatUTC(param.timestamp_utc, 'HH:mm:ss')}` : 'LIVE'}
          </span>
        </div>

        <StatusBadge status={statusStr} size="sm" />
      </div>
    </div>
  );
};
