import React, { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useTheme } from '../../lib/theme';
import { bandsPlugin } from './uPlotChart';
import { fmtNum } from '../../ops/history';

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
  /** A vertical marker (playback position), in the same seconds as `timestamps`. */
  cursorTs?: number;
  /** Hide the value legend (compact chart tiles). */
  compact?: boolean;
  /** Event markers (alarms, commands) on the shared time axis, in the same seconds as `timestamps`. */
  markers?: { t: number; color: string; label: string }[];
}

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

/** One uPlot chart with any number of series; series with different units get their own y axis. */
export const MultiPlot: React.FC<Props> = ({ timestamps, series, height, syncKey, onReady, onXRange, cursorTs, compact, markers }) => {
  const box = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const theme = useTheme();
  const units = [...new Set(series.map((s) => s.unit))];
  const scaleOf = (unit: string) => (units.indexOf(unit) === 0 ? 'y' : `y${units.indexOf(unit)}`);

  const cursorRef = useRef<number | undefined>(cursorTs);
  cursorRef.current = cursorTs;
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const structure = JSON.stringify([series.map((s) => [s.label, s.color, s.unit]), height, theme, compact]);

  useEffect(() => {
    if (!box.current) return;
    const single = series.length === 1 ? series[0].limits : undefined;
    const axisBase = { stroke: css('--neutral-300'), grid: { stroke: css('--neutral-600'), width: 1 }, ticks: { stroke: css('--neutral-500'), width: 1 } };

    const opts: uPlot.Options = {
      width: box.current.clientWidth || 800,
      height,
      legend: { show: !compact },
      plugins: [
        ...(single ? [bandsPlugin(single.lowSoft, single.hiSoft, single.lowHard, single.hiHard)] : []),
        { hooks: { draw: [(u: uPlot) => {
          const t = cursorRef.current;
          if (t === undefined) return;
          const x = u.valToPos(t, 'x', true);
          if (x < u.bbox.left || x > u.bbox.left + u.bbox.width) return;
          u.ctx.save(); u.ctx.strokeStyle = css('--neutral-50') || '#E9ECF1'; u.ctx.lineWidth = 1.5;
          u.ctx.beginPath(); u.ctx.moveTo(x, u.bbox.top); u.ctx.lineTo(x, u.bbox.top + u.bbox.height); u.ctx.stroke(); u.ctx.restore();
        }] } } as uPlot.Plugin,
        { hooks: { draw: [(u: uPlot) => {
          const dpr = window.devicePixelRatio || 1;
          for (const m of markersRef.current ?? []) {
            const x = u.valToPos(m.t, 'x', true);
            if (x < u.bbox.left || x > u.bbox.left + u.bbox.width) continue;
            const c = u.ctx;
            c.save(); c.strokeStyle = m.color; c.globalAlpha = 0.85; c.lineWidth = 1 * dpr; c.setLineDash([2 * dpr, 4 * dpr]);
            c.beginPath(); c.moveTo(x, u.bbox.top); c.lineTo(x, u.bbox.top + u.bbox.height); c.stroke();
            c.setLineDash([]); c.globalAlpha = 1; c.fillStyle = m.color; c.font = `${11 * dpr}px Geist, system-ui, sans-serif`;
            c.fillText(m.label, Math.min(x + 4 * dpr, u.bbox.left + u.bbox.width - c.measureText(m.label).width), u.bbox.top + 12 * dpr);
            c.restore();
          }
        }] } } as uPlot.Plugin,
      ],
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
          value: (_, v) => (v != null ? `${fmtNum(v)}${s.unit ? ` ${s.unit}` : ''}` : '-'),
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

  useEffect(() => { plot.current?.redraw(false); }, [cursorTs, markers]);

  return <div ref={box} className="w-full overflow-hidden" />;
};
