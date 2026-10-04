import React from 'react';

/**
 * A small area sparkline drawn from real samples. With fewer than two samples it draws nothing
 * (and says so to screen readers) rather than inventing a shape.
 */
export const Sparkline: React.FC<{ data: number[]; color?: string; height?: number; className?: string; label?: string }> = ({
  data, color = '#6CB8FF', height = 34, className, label,
}) => {
  const W = 200, H = height;
  if (data.length < 2) {
    return <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className={className} role="img" aria-label={label ? `${label}: not enough samples yet` : undefined}>
      <line x1="0" y1={H - 2} x2={W} y2={H - 2} stroke="#1A1E27" strokeDasharray="3 4" />
    </svg>;
  }
  const lo = Math.min(...data), hi = Math.max(...data);
  const span = hi - lo || 1;
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * W).toFixed(1)} ${(H - 2 - ((v - lo) / span) * (H - 6)).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className={className} role="img" aria-label={label}>
      <path d={`${line} L${W} ${H} L0 ${H} Z`} fill={color} fillOpacity={0.1} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
};
