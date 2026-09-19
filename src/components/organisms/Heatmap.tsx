import React from 'react';
import { Satellite } from '../../types';

interface HeatmapProps {
  satellites: Satellite[];
  onSelectSat?: (satId: string) => void;
}

export const Heatmap: React.FC<HeatmapProps> = ({ satellites, onSelectSat }) => {
  const subsystems = ['POWER', 'ADCS', 'THERMAL', 'COMMS', 'PAYLOAD', 'OBC'];

  return (
    <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-col gap-3 w-full overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
        <span className="text-xs font-mono-code font-bold text-[var(--color-text-primary)]">CONSTELLATION HEALTH MATRIX (D3 HEATMAP)</span>
        <span className="text-[10px] font-mono-code text-[var(--color-text-secondary)]">{satellites.length} SATELLITES IN VIEW</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono-code border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-text-secondary)] text-[10px]">
              <th className="py-1.5 px-2">SAT ID</th>
              {subsystems.map((s) => (
                <th key={s} className="py-1.5 px-2 text-center">{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {satellites.slice(0, 15).map((sat) => (
              <tr
                key={sat.sat_id}
                onClick={() => onSelectSat && onSelectSat(sat.sat_id)}
                className="border-b border-[var(--color-bg-overlay)] hover:bg-[var(--color-bg-elevated)] cursor-pointer transition-colors"
              >
                <td className="py-1.5 px-2 font-bold text-[var(--action-primary)]">{sat.sat_id}</td>
                {subsystems.map((sub, idx) => {
                  let color = 'bg-[color-mix(in_srgb,var(--success)_20%,transparent)] border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)]';
                  if (sat.health_state === 'CRITICAL' && idx === 0) {
                    color = 'bg-[var(--danger)] text-white font-bold pulse-critical';
                  } else if (sat.health_state === 'WARNING' && idx === 1) {
                    color = 'bg-[color-mix(in_srgb,var(--warning)_30%,transparent)] border-[var(--warning)] text-[var(--warning)]';
                  }
                  return (
                    <td key={sub} className="py-1 px-1 text-center">
                      <div className={`py-1 rounded text-[10px] border ${color}`}>
                        NOM
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
