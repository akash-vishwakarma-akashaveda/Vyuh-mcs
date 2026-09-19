import React from 'react';
import { useCommandStore } from '../../store/useCommandStore';

export const CLCWRegister: React.FC = () => {
  const reportVal = useCommandStore((s) => s.clcwReportValue);
  const flags = useCommandStore((s) => s.clcwFlags);

  const hexVal = '0x' + reportVal.toString(16).padStart(4, '0').toUpperCase();

  return (
    <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
        <span className="text-xs font-mono-code font-bold text-[var(--color-text-primary)]">CLCW REGISTER</span>
        <span className="text-xs font-mono-code text-[var(--action-primary)] font-bold">{hexVal}</span>
      </div>

      {/* Bit Indicators Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs font-mono-code">
        <div className="flex flex-col bg-[var(--color-bg-elevated)] p-2 rounded border border-[var(--color-border)]">
          <span className="text-[10px] text-[var(--color-text-secondary)]">FARM-B COUNTER</span>
          <span className="text-sm font-bold text-[var(--color-text-primary)]">{flags.farmBCounter}</span>
        </div>
        <div className={`flex flex-col p-2 rounded border ${flags.lockout ? 'bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] border-[var(--danger)] text-[var(--danger-text)]' : 'bg-[var(--color-bg-elevated)] border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}>
          <span className="text-[10px]">LOCKOUT</span>
          <span className="text-xs font-bold">{flags.lockout ? 'SET (ALERT)' : 'CLEAR'}</span>
        </div>
        <div className={`flex flex-col p-2 rounded border ${flags.wait ? 'bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] border-[var(--warning)] text-[var(--warning)]' : 'bg-[var(--color-bg-elevated)] border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}>
          <span className="text-[10px]">WAIT FLAG</span>
          <span className="text-xs font-bold">{flags.wait ? 'ACTIVE' : 'CLEAR'}</span>
        </div>
        <div className={`flex flex-col p-2 rounded border ${flags.retransmit ? 'bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] border-[var(--warning)] text-[var(--warning)]' : 'bg-[var(--color-bg-elevated)] border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}>
          <span className="text-[10px]">RETRANSMIT</span>
          <span className="text-xs font-bold">{flags.retransmit ? 'PENDING' : 'CLEAR'}</span>
        </div>
      </div>

      <div className="text-[10px] font-mono-code text-[var(--color-text-secondary)] flex justify-between pt-1 border-t border-[var(--color-bg-overlay)]">
        <span>UPLINK BUFFER: 0/16</span>
        <span>EST. RTT: 42ms</span>
      </div>
    </div>
  );
};
