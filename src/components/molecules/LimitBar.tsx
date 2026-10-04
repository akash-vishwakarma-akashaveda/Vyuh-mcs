import React from 'react';

/** Where a value sits between its critical limits; the nominal band is the lighter stretch. */
export const LimitBar: React.FC<{ val: number; lowHard: number; lowSoft: number; hiSoft: number; hiHard: number; isStale?: boolean }> = ({
  val, lowHard, lowSoft, hiSoft, hiHard, isStale = false,
}) => {
  const range = hiHard - lowHard || 1;
  const pos = (v: number) => Math.min(100, Math.max(0, ((v - lowHard) / range) * 100));
  const color = isStale ? '#3A4252' : val <= lowHard || val >= hiHard ? '#FF6B6B' : val <= lowSoft || val >= hiSoft ? '#F5C451' : '#4ADE9A';
  return (
    <span className="relative block w-full h-1.5 rounded-full bg-[#1A1E27]" aria-hidden="true">
      <span className="absolute h-full rounded-full bg-[#232936]" style={{ left: `${pos(lowSoft)}%`, width: `${Math.max(0, pos(hiSoft) - pos(lowSoft))}%` }} />
      <span className="absolute top-1/2 w-2 h-2 -mt-1 -ml-1 rounded-full" style={{ left: `${pos(val)}%`, background: color }} />
    </span>
  );
};
