import React, { useEffect, useRef } from 'react';
import { useTheme } from '../../lib/theme';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

interface uPlotChartProps {
  data: [number[], number[]]; // [timestamps, values]
  title?: string;
  unit?: string;
  lowSoft?: number;
  hiSoft?: number;
  lowHard?: number;
  hiHard?: number;
}

/**
 * Paints the warning/critical bands behind the series (FR-S05-03) directly on
 * uPlot's canvas — cheaper and sharper than a second filled series, and it
 * follows the y-scale exactly instead of drifting from it.
 */
export function bandsPlugin(lowSoft?: number, hiSoft?: number, lowHard?: number, hiHard?: number): uPlot.Plugin {
  return {
    hooks: {
      draw: [(u) => {
        const { ctx } = u;
        const left = u.bbox.left, top = u.bbox.top, width = u.bbox.width, height = u.bbox.height;
        const y = (v: number) => top + height * (1 - (v - u.scales.y.min!) / (u.scales.y.max! - u.scales.y.min!));
        const clampY = (v: number) => Math.max(top, Math.min(top + height, v));

        ctx.save();
        // Critical zones: below lowHard, above hiHard.
        ctx.fillStyle = 'rgba(198, 40, 40, 0.10)';
        if (lowHard != null) ctx.fillRect(left, clampY(y(lowHard)), width, clampY(top + height) - clampY(y(lowHard)));
        if (hiHard != null) ctx.fillRect(left, clampY(top), width, clampY(y(hiHard)) - clampY(top));
        // Warning zones: between soft and hard on each side.
        ctx.fillStyle = 'rgba(232, 148, 58, 0.09)';
        if (lowSoft != null) ctx.fillRect(left, clampY(y(lowSoft)), width, clampY(y(lowHard ?? lowSoft)) - clampY(y(lowSoft)));
        if (hiSoft != null) ctx.fillRect(left, clampY(y(hiHard ?? hiSoft)), width, clampY(y(hiSoft)) - clampY(y(hiHard ?? hiSoft)));
        ctx.restore();
      }],
    },
  };
}

export const UPlotChart: React.FC<uPlotChartProps> = ({ data, title, unit = '', lowSoft, hiSoft, lowHard, hiHard }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const uplotInstance = useRef<uPlot | null>(null);
  const theme = useTheme();
  const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  // Structural options — title, unit, limit bands — need the instance rebuilt:
  // uPlot has no public API to rename a series label after construction, so a
  // partial update here would leave the chart showing the previous parameter's
  // title while plotting the new one's data. Only `data` gets the cheap path.
  useEffect(() => {
    if (!containerRef.current) return;

    const opts: uPlot.Options = {
      title: title || '',
      width: containerRef.current.clientWidth || 800,
      height: 320,
      plugins: [bandsPlugin(lowSoft, hiSoft, lowHard, hiHard)],
      series: [
        {
          label: 'UTC Time',
          value: (_, v) => (v ? new Date(v * 1000).toISOString().substr(11, 8) + ' UTC' : '-'),
        },
        {
          label: unit ? `Value (${unit})` : 'Value',
          stroke: '#4DACFF',
          width: 2,
          value: (_, v) => (v != null ? `${v.toFixed(2)}${unit ? ` ${unit}` : ''}` : '-'),
        },
      ],
      axes: [
        {
          stroke: css('--neutral-300'),
          grid: { stroke: css('--neutral-600'), width: 1 },
          ticks: { stroke: css('--neutral-500'), width: 1 },
          values: (_, ticks) => ticks.map((t) => new Date(t * 1000).toISOString().substr(11, 5)),
        },
        {
          stroke: css('--neutral-300'),
          grid: { stroke: css('--neutral-600'), width: 1 },
          ticks: { stroke: css('--neutral-500'), width: 1 },
        },
      ],
      scales: { x: { time: true } },
    };

    uplotInstance.current = new uPlot(opts, data as any, containerRef.current);

    const handleResize = () => {
      if (containerRef.current && uplotInstance.current) {
        uplotInstance.current.setSize({ width: containerRef.current.clientWidth, height: 320 });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      uplotInstance.current?.destroy();
      uplotInstance.current = null;
    };
  }, [title, unit, lowSoft, hiSoft, lowHard, hiHard, theme]);

  // Data-only updates (a tick landing, or the same parameter's range refreshing)
  // stay on the cheap path and never rebuild the chart.
  useEffect(() => {
    uplotInstance.current?.setData(data as any);
  }, [data]);

  return (
    <div className="w-full flex flex-col gap-2">
      <div ref={containerRef} className="w-full overflow-hidden" />
    </div>
  );
};
