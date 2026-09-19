import React, { useState } from 'react';
import { FLEET } from '../../data/fleet';
import { UPlotChart } from '../../components/organisms/uPlotChart';
import { Card } from '../../components/molecules/Page';
import { Cpu, CheckCircle2, AlertTriangle, Lightbulb } from 'lucide-react';

interface PredictiveHealthProps {
  satId: string;
  onNavigate: (path: string) => void;
}

export const PredictiveHealth: React.FC<PredictiveHealthProps> = ({ satId, onNavigate }) => {
  const [subsystem, setSubsystem] = useState<'Battery' | 'Reaction Wheels' | 'Solar Panels' | 'Propulsion'>('Battery');

  const nowSec = Math.floor(Date.now() / 1000);
  const timestamps = Array.from({ length: 50 }).map((_, i) => nowSec + i * 86400);
  const values = timestamps.map((_, i) => Number((94 - i * 0.3 + (Math.random() * 0.5 - 0.25)).toFixed(1)));
  const chartData: [number[], number[]] = [timestamps, values];

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto">
      <div className="flex  justify-between gap-4 items-center rounded-xl border border-[#23272F] bg-gradient-to-r from-[#0F6E56]/20 via-[#161A20] to-[#14161B] px-5 py-4 border-l-4 border-l-[#3CB992]">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] leading-[1.15] font-bold">Health forecast</h1>
          <p className="text-[13px] text-[var(--color-text-secondary)]">Remaining useful life per component, always with its uncertainty interval</p>
        </div>
        <select value={satId} onChange={(e) => onNavigate(`forecast?sat=${e.target.value}`)} aria-label="Satellite"
          className="h-9 bg-[var(--color-bg-canvas)] border border-[var(--color-border)] rounded-[2px] px-2.5 font-mono-code text-[13px] outline-none focus:border-[var(--info)]">
          {FLEET.map((s) => <option key={s.sat_id} value={s.sat_id}>{s.sat_id}</option>)}
        </select>
      </div>

      {/* Subsystem Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2">
        {(['Battery', 'Reaction Wheels', 'Solar Panels', 'Propulsion'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSubsystem(s)}
            className={`px-4 py-2 text-xs font-mono-code font-bold rounded ${
              subsystem === s ? 'bg-[var(--action-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]'
            }`}
          >
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      {/* RUL & Health Gauge Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono-code">
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] p-4 rounded-md flex flex-col justify-between">
          <span className="text-xs text-[var(--color-text-secondary)] font-bold">HEALTH SCORE GAUGE</span>
          <div className="flex items-baseline gap-2 my-4">
            <span className="text-5xl font-display-title font-bold text-[var(--success)]">91.4%</span>
            <span className="text-xs text-[var(--success)]">NOMINAL</span>
          </div>
          <span className="text-[10px] text-[var(--color-text-secondary)]">Degradation slope: -0.03%/month</span>
        </div>

        <div className="md:col-span-2 bg-[var(--color-bg-surface)] border border-[var(--color-border)] p-4 rounded-md flex flex-col justify-between">
          <span className="text-xs text-[var(--color-text-secondary)] font-bold">REMAINING USEFUL LIFE (RUL) FORECAST</span>
          <div className="flex flex-col my-2">
            <span className="text-4xl font-display-title font-bold text-[var(--color-text-primary)]">847 Days</span>
            <span className="text-xs text-[var(--action-primary)] mt-1">90% Confidence Interval: 720 – 980 Days</span>
          </div>
          <span className="text-[10px] text-[var(--color-text-secondary)]">Forecast model trained on 4,200 orbit cycles</span>
        </div>
      </div>

      {/* Forecast Chart */}
      <Card title="Projected degradation curve">
        <UPlotChart data={chartData} title={`${subsystem} RUL Forecast Curve`} unit="%" />
      </Card>

      {/* Plain-English AI Recommendation */}
      <div className="bg-[color-mix(in_srgb,var(--action-primary)_15%,transparent)] border border-[var(--action-primary)] p-4 rounded-lg flex items-start gap-3 text-xs font-mono-code">
        <Lightbulb size={20} className="text-[var(--action-hover)] shrink-0 mt-0.5" />
        <div className="flex flex-col gap-1">
          <span className="font-bold text-[var(--action-hover)]">AI PROSE RECOMMENDATION:</span>
          <p className="text-[var(--color-text-primary)] italic leading-relaxed">
            "Battery Array 1 depth of discharge (DoD) is performing 4% above baseline. Recommend adjusting eclipse heater setpoint by -1.5°C to extend total battery cycle life by an estimated +82 days."
          </p>
        </div>
      </div>
    </div>
  );
};
