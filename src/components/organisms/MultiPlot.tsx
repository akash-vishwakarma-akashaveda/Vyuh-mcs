import React, { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useTheme } from '../../lib/theme';
import { bandsPlugin } from './uPlotChart';

export interface PlotSeries {
  label: string;
  color: string;
  unit: string;
  values: number[];
  /** Limit bands are drawn only when the chart holds this one series. */
  limits?: { lowSoft: number; hiSoft: number; lowHard: number; hiHard: number };
}

interface Props {
  timestamps: number[];
  series: PlotSeries[];
  height: number;
  /** Charts sharing a key share cursor position and x zoom. */
  syncKey: string;
  onReady: (u: uPlot | null) => void;
  onXRange: (min: number, max: number) => void;
}

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

/** One uPlot chart with any number of series; series with different units get their own y axis. */
export const MultiPlot: React.FC<Props> = ({ timestamps, series, height, syncKey, onReady, onXRange }) => {
  const box = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const theme = useTheme();
  const units = [...new Set(series.map((s) => s.unit))];
  const scaleOf = (unit: string) => (units.indexOf(unit) === 0 ? 'y' : `y${units.indexOf(unit)}`);

  const structure = JSON.stringify([series.map((s) => [s.label, s.color, s.unit]), height, theme]);

  useEffect(() => {
    if (!box.current) return;
    const single = series.length === 1 ? series[0].limits : undefined;
    const axisBase = { stroke: css('--neutral-300'), grid: { stroke: css('--neutral-600'), width: 1 }, ticks: { stroke: css('--neutral-500'), width: 1 } };

    const opts: uPlot.Options = {
      width: box.current.clientWidth || 800,
      height,
      plugins: single ? [bandsPlugin(single.lowSoft, single.hiSoft, single.lowHard, single.hiHard)] : [],
      cursor: { sync: { key: syncKey, scales: ['x', null] }, drag: { x: true, y: false, setScale: true } },
      scales: { x: { time: true } },
      hooks: {
        setScale: [(u, key) => {
          if (key === 'x' && u.scales.x.min != null && u.scales.x.max != null) onXRange(u.scales.x.min, u.scales.x.max);
        }],
      },
      series: [
        { label: 'UTC', value: (_, v) => (v ? new Date(v * 1000).toISOString().slice(11, 19) : '-') },
        ...series.map((s): uPlot.Series => ({
          label: s.label, stroke: s.color, width: 2, scale: scaleOf(s.unit),
          value: (_, v) => (v != null ? `${v.toFixed(2)}${s.unit ? ` ${s.unit}` : ''}` : '-'),
        })),
      ],
      axes: [
        {
          ...axisBase,
          values: (u, t) => {
            const span = (u.scales.x.max ?? 0) - (u.scales.x.min ?? 0);
            return t.map((x) => {
              const iso = new Date(x * 1000).toISOString();
              return span > 2 * 86400 ? iso.slice(5, 10) : span > 86400 ? `${iso.slice(8, 10)} ${iso.slice(11, 16)}` : iso.slice(11, 16);
            });
          },
        },
        ...units.slice(0, 2).map((unit, i): uPlot.Axis => ({
          ...axisBase, scale: scaleOf(unit), side: i === 0 ? 3 : 1, label: unit || undefined, labelSize: 14,
          grid: i === 0 ? axisBase.grid : { show: false },
        })),
      ],
    };
    // Scales for the third+ unit exist but get no axis (kept readable); the legend still shows every value.
    plot.current = new uPlot(opts, [timestamps, ...series.map((s) => s.values)] as uPlot.AlignedData, box.current);
    onReady(plot.current);

    const ro = new ResizeObserver(() => {
      if (box.current && plot.current) plot.current.setSize({ width: box.current.clientWidth, height });
    });
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      onReady(null);
      plot.current?.destroy();
      plot.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structure, syncKey]);

  useEffect(() => {
    // resetScales=false keeps the user's zoom while new data arrives.
    plot.current?.setData([timestamps, ...series.map((s) => s.values)] as uPlot.AlignedData, false);
  }, [timestamps, series]);

  return <div ref={box} className="w-full overflow-hidden" />;
};
