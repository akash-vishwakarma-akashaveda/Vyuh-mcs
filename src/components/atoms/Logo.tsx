import React from 'react';

/** Kesari: the brand colour. Used on the mark and the one primary action on a screen, never for status. */
export const KESARI = '#F28C28';

/** The Vyuh mark: satellites in formation (vyuh), leader ahead, wing behind. */
export const LogoMark: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = KESARI }) => (
  <svg width={size} height={Math.round(size * 0.78)} viewBox="0 0 18 14" aria-hidden="true" className="shrink-0">
    <circle cx="9" cy="2.5" r="2.3" fill={color} />
    <circle cx="4" cy="8" r="2.1" fill={color} />
    <circle cx="14" cy="8" r="2.1" fill={color} />
    <circle cx="1.8" cy="12.4" r="1.5" fill={color} opacity=".55" />
    <circle cx="16.2" cy="12.4" r="1.5" fill={color} opacity=".55" />
  </svg>
);

export const Logo: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <span className="flex items-center gap-2.5">
    <LogoMark size={size} />
    <span className="font-display-title text-[14px] font-medium tracking-[0.14em] text-[#E9ECF1]">
      VYUH<span className="font-mono-code text-[10.5px] tracking-[0.12em] text-[#7C8594] ml-1.5">MCS</span>
    </span>
  </span>
);
