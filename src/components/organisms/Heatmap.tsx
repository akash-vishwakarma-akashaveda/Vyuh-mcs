import React from 'react';
import type { Param, Satellite } from '../../types';
import { PARAMETERS } from '../../data/fleet';
import { tileState, TileState } from './ParameterCard';

const SUBS = Object.keys(PARAMETERS);
const SHORT: Record<string, string> = { POWER: 'Pwr', ADCS: 'ADCS', THERMAL: 'Thm', COMMS: 'Com', PAYLOAD: 'PL', OBC: 'OBC' };
const RANK: Record<TileState, number> = { crit: 4, warn: 3, stale: 2, nodata: 1, ok: 0 };
const CELL: Record<TileState, { bg: string; fg: string; glyph: string; label: string }> = {
  crit: { bg: 'rgba(255,107,107,0.22)', fg: '#FF7A7A', glyph: '■', label: 'critical' },
  warn: { bg: 'rgba(245,196,81,0.18)', fg: '#F5C451', glyph: '▲', label: 'warning' },
  ok: { bg: 'rgba(74,222,154,0.10)', fg: '#4ADE9A', glyph: '', label: 'nominal' },
  stale: { bg: '#1A1E27', fg: '#7C8594', glyph: '◆', label: 'stale' },
  nodata: { bg: '#141821', fg: '#6B7383', glyph: '○', label: 'no data' },
};

/** Worst state of each subsystem's parameters in the CVT. A subsystem with no readings at all is "no data", never nominal. */
export function subsystemState(cvt: Record<string, Param> | undefined, sub: string): TileState {
  if (!cvt) return 'nodata';
  const defs = PARAMETERS[sub];
  if (!defs.some((d) => cvt[d.param_id])) return 'nodata';
  return defs.reduce<TileState>((w, d) => {
    const p = cvt[d.param_id];
    if (!p) return w;
    // The alarm level wins over staleness: a stale critical is still critical.
    const t: TileState = p.alarm_state === 2 ? 'crit' : p.alarm_state === 1 ? 'warn' : tileState(p);
    return RANK[t] > RANK[w] ? t : w;
  }, 'ok');
}

/** Satellites × subsystems, each cell the worst alarm state of that subsystem right now. */
export const Heatmap: React.FC<{ satellites: Satellite[]; cvt: Record<string, Record<string, Param>>; onSelectSat?: (satId: string, sub: string) => void }> = ({ satellites, cvt, onSelectSat }) => (
  <div className="overflow-auto max-h-[460px]">
    <table className="w-full text-[12px] border-separate border-spacing-[3px]">
      <thead className="sticky top-0 bg-[#11141B]">
        <tr className="text-[#6B7383]">
          <th className="text-left font-normal px-1">Satellite</th>
          {SUBS.map((s) => <th key={s} className="font-normal px-0.5" title={s.charAt(0) + s.slice(1).toLowerCase()}>{SHORT[s]}</th>)}
        </tr>
      </thead>
      <tbody>
        {satellites.map((sat) => (
          <tr key={sat.sat_id}>
            <td className="font-mono-code text-[12px] text-[#C9CED6] px-1 whitespace-nowrap">{sat.sat_id}</td>
            {SUBS.map((sub) => {
              const st = subsystemState(cvt[sat.sat_id], sub);
              const c = CELL[st];
              const label = `${sat.sat_id} ${sub.toLowerCase()}: ${c.label}`;
              return (
                <td key={sub} className="p-0">
                  {onSelectSat ? (
                    <button type="button" onClick={() => onSelectSat(sat.sat_id, sub)} aria-label={label} title={label}
                      className="w-full h-6 min-w-[30px] rounded-md text-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F28C28]" style={{ background: c.bg, color: c.fg }}>{c.glyph}</button>
                  ) : (
                    <span role="img" aria-label={label} title={label} className="flex items-center justify-center h-6 min-w-[30px] rounded-md text-[10px]" style={{ background: c.bg, color: c.fg }}>{c.glyph}</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
