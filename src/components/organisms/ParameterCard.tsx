import React from 'react';
import type { Param } from '../../types';
import type { ParamDef } from '../../data/fleet';
import { Sparkline } from '../molecules/Sparkline';
import { LimitBar } from '../molecules/LimitBar';
import { fmtNum, fmtUtc } from '../../ops/history';
import { isStale } from '../../utils/stalenessUtils';

export type TileState = 'crit' | 'warn' | 'ok' | 'stale' | 'nodata';

export const tileState = (live?: Param): TileState =>
  !live ? 'nodata' : isStale(live) ? 'stale' : live.alarm_state === 2 ? 'crit' : live.alarm_state === 1 ? 'warn' : 'ok';

const LOOK: Record<TileState, { label: string; c: string; stroke: string; bg: string; vc: string }> = {
  crit: { label: 'Critical', c: '#FF7A7A', stroke: '#FF7A7A', bg: 'rgba(255,107,107,0.05)', vc: '#FF7A7A' },
  warn: { label: 'Warning', c: '#F5C451', stroke: '#F5C451', bg: '#11141B', vc: '#F5C451' },
  ok: { label: 'Nominal', c: '#4ADE9A', stroke: '#6CB8FF', bg: '#11141B', vc: '#E9ECF1' },
  stale: { label: 'Stale', c: '#7C8594', stroke: '#3A4252', bg: '#11141B', vc: '#7C8594' },
  nodata: { label: 'No data', c: '#7C8594', stroke: '#3A4252', bg: '#11141B', vc: '#7C8594' },
};

/**
 * One parameter tile. The value never animates; a parameter with no reading says "No data" and
 * one that stopped updating says "Stale" with its last time, never a confident green zero.
 */
export const ParameterCard: React.FC<{ def: ParamDef; live?: Param; samples: number[]; onClick?: () => void }> = ({ def, live, samples, onClick }) => {
  const st = tileState(live);
  const l = LOOK[st];
  const glyph = st === 'crit' ? '■' : st === 'warn' ? '▲' : st === 'ok' ? '●' : st === 'stale' ? '◆' : '○';
  return (
    <button type="button" onClick={onClick}
      aria-label={`${def.param_id} ${live ? `${fmtNum(live.eu_value)} ${def.unit}` : 'no data'}, ${l.label}`}
      className="text-left rounded-[14px] border border-[#1A1E27] hover:border-[#2A303D] px-4 py-3.5 flex flex-col gap-1.5 min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F28C28]"
      style={{ background: l.bg }}>
      <span className="flex justify-between gap-2 text-[12px] text-[#9AA3B2]">
        <span className="truncate">{def.name}</span>
        <span className="shrink-0" style={{ color: l.c }}>{glyph} {l.label}</span>
      </span>
      <span className="flex items-baseline gap-1.5 min-w-0">
        <span className="font-mono-code text-[24px] font-semibold tracking-[-0.01em] tabular-nums truncate" style={{ color: l.vc }}>
          {live ? fmtNum(live.eu_value) : 'No data'}
        </span>
        {live && def.unit && <span className="text-[12px] text-[#7C8594]">{def.unit}</span>}
      </span>
      <Sparkline data={samples} color={l.stroke} label={`${def.param_id} recent samples`} />
      {live && def.critHi > def.critLo && <LimitBar val={live.eu_value} lowHard={def.critLo} lowSoft={def.warnLo} hiSoft={def.warnHi} hiHard={def.critHi} isStale={st === 'stale'} />}
      <span className="flex justify-between font-mono-code text-[11px] text-[#6B7383]">
        <span>{def.param_id}</span>
        <span>{live ? (st === 'stale' ? `last ${fmtUtc(Date.parse(live.timestamp_utc), true)}` : fmtUtc(Date.parse(live.timestamp_utc), true)) : 'never received'}</span>
      </span>
    </button>
  );
};
