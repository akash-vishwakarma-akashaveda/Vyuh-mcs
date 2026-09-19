import { PASS_REPORTS, STATIONS } from '../../data/fleet';
import React, { useState, useEffect } from 'react';
import { Button } from '../../components/atoms/Button';
import { Play, Pause, RotateCcw, FastForward } from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';

interface PassPlaybackProps {
  onNavigate: (path: string) => void;
}

export const PassPlayback: React.FC<PassPlaybackProps> = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<'1x' | '5x' | '10x' | '50x'>('1x');
  const [scrubPos, setScrubPos] = useState(25);
  const [selectedPass, setSelectedPass] = useState(PASS_REPORTS[0].report_id);
  const setPlaybackMode = useUIStore((s) => s.setPlaybackMode);

  useEffect(() => {
    setPlaybackMode(true);
    return () => setPlaybackMode(false);
  }, [setPlaybackMode]);

  // Live playback timer loop
  useEffect(() => {
    if (!isPlaying) return;

    const speedMultipliers = { '1x': 1000, '5x': 200, '10x': 100, '50x': 20 };
    const intervalTime = speedMultipliers[speed] || 1000;

    const interval = setInterval(() => {
      setScrubPos((prev) => {
        if (prev >= 100) {
          setIsPlaying(false);
          return 100;
        }
        return prev + 1;
      });
    }, intervalTime);

    return () => clearInterval(interval);
  }, [isPlaying, speed]);

  const calcCurrentTime = (pos: number) => {
    const totalSeconds = 12 * 60; // 12 minute pass
    const currentSeconds = Math.round((pos / 100) * totalSeconds);
    const m = Math.floor(currentSeconds / 60);
    const s = currentSeconds % 60;
    return `14:${(12 + m).toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Mock live values based on scrubPos
  const busVoltage = (28.4 + Math.sin(scrubPos * 0.1) * 0.5).toFixed(2);
  const battTemp = (22.0 + Math.cos(scrubPos * 0.15) * 3.2).toFixed(1);
  const rxPower = (-85 + Math.sin(scrubPos * 0.05) * 12).toFixed(1);

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto">
      <div className="flex flex-col gap-1 rounded-xl border border-[#23272F] bg-gradient-to-r from-[#0F6E56]/20 via-[#161A20] to-[#14161B] px-5 py-4 border-l-4 border-l-[#3CB992]">
        <h1 className="text-[22px] leading-[1.15] font-bold">Pass playback</h1>
        <p className="text-[13px] text-[var(--color-text-secondary)]">Replay a past pass at variable speed · commanding is disabled in playback</p>
      </div>
      {/* Pass Selector Header */}
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] p-4 rounded-lg flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="font-mono-code font-bold text-sm text-[var(--warning)]">HISTORICAL PASS SELECTION</span>
          <select 
            value={selectedPass}
            onChange={(e) => {
              setSelectedPass(e.target.value);
              setScrubPos(0);
              setIsPlaying(false);
            }}
            className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded px-3 py-1.5 text-xs font-mono-code text-[var(--color-text-primary)]"
          >
            {PASS_REPORTS.map((r) => (
              <option key={r.report_id} value={r.report_id}>
                {r.sat_id} · {STATIONS.find((st) => st.id === r.station_id)?.name} · {r.aos_utc.slice(11, 16)} UTC
              </option>
            ))}
          </select>
        </div>

        {/* Speed Controls */}
        <div className="flex items-center gap-2 font-mono-code text-xs">
          <span className="text-[var(--color-text-secondary)]">PLAYBACK SPEED:</span>
          {(['1x', '5x', '10x', '50x'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-2 py-1 rounded transition-colors ${
                speed === s ? 'bg-[var(--warning)] text-black font-bold' : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline Scrubber */}
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] p-6 rounded-lg flex flex-col gap-4">
        <div className="flex justify-between text-xs font-mono-code text-[var(--color-text-secondary)]">
          <span>AOS: 14:12:00 UTC</span>
          <span className="text-[var(--warning)] font-bold">CURRENT: {calcCurrentTime(scrubPos)} UTC ({scrubPos}%)</span>
          <span>LOS: 14:24:00 UTC</span>
        </div>

        {/* Scrubber track */}
        <div className="relative w-full h-4 bg-[var(--color-bg-elevated)] rounded-full overflow-hidden border border-[var(--color-border)]">
          <div className="absolute left-[10%] right-[10%] h-full bg-[color-mix(in_srgb,var(--action-primary)_20%,transparent)] border-x border-[var(--action-primary)]" />
          <div className="h-full bg-[var(--warning)] transition-all duration-75" style={{ width: `${scrubPos}%` }} />
          <input
            type="range"
            min="0"
            max="100"
            value={scrubPos}
            onChange={(e) => setScrubPos(Number(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="Pass playback timeline position"
          />
        </div>

        {/* Transport buttons */}
        <div className="flex justify-center items-center gap-4 pt-2">
          <Button variant="secondary" size="sm" onClick={() => { setScrubPos(0); setIsPlaying(false); }}>
            <RotateCcw size={14} /> Reset
          </Button>
          <Button variant="warning" size="md" onClick={() => setIsPlaying(!isPlaying)}>
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            {isPlaying ? 'Pause Playback' : 'Play Pass'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setScrubPos(p => Math.min(100, p + 2))}>
            <FastForward size={14} /> Step +1s
          </Button>
        </div>
      </div>

      {/* Replayed Telemetry Overlay Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono-code">
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] p-4 rounded-md flex flex-col gap-1">
          <span className="text-[10px] text-[var(--color-text-secondary)]">BUS VOLTAGE (REPLAY)</span>
          <span className="text-3xl font-bold text-[var(--color-text-primary)]">{busVoltage} V</span>
          <span className="text-[10px] text-[var(--success)]">Nominal 28.0–29.0V</span>
        </div>
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] p-4 rounded-md flex flex-col gap-1">
          <span className="text-[10px] text-[var(--color-text-secondary)]">BATTERY TEMPERATURE</span>
          <span className="text-3xl font-bold text-[var(--color-text-primary)]">{battTemp} °C</span>
          <span className="text-[10px] text-[var(--success)]">Thermal Zone Nominal</span>
        </div>
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] p-4 rounded-md flex flex-col gap-1">
          <span className="text-[10px] text-[var(--color-text-secondary)]">GROUND RX CARRIER POWER</span>
          <span className="text-3xl font-bold text-[var(--info)]">{rxPower} dBm</span>
          <span className="text-[10px] text-[var(--info)]">S-Band Link Locked</span>
        </div>
      </div>
    </div>
  );
};
