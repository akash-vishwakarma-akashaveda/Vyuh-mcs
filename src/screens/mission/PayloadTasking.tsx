import { FLEET } from '../../data/fleet';
import React, { useState } from 'react';
import { Button } from '../../components/atoms/Button';
import { InputField } from '../../components/molecules/InputField';
import { StatusBadge } from '../../components/atoms/Badge';
import { CheckCircle2, AlertTriangle, Layers, Plus, CheckCircle } from 'lucide-react';

interface PayloadTaskingProps {
  onNavigate: (path: string) => void;
}

export const PayloadTasking: React.FC<PayloadTaskingProps> = () => {
  const [lat, setLat] = useState('28.6139');
  const [lon, setLon] = useState('77.2090');
  const [cloudCover, setCloudCover] = useState('15');
  const [targetSat, setTargetSat] = useState('AKV-03');
  const [tasks, setTasks] = useState([
    { id: 'TASK-101', sat: 'AKV-03', target: 'New Delhi Area (28.61° N, 77.21° E)', cloudMax: '15%', score: 92.4, status: 'QUEUED', scheduledUtc: '14:32:00' },
    { id: 'TASK-102', sat: 'AKV-01', target: 'Svalbard Ground Station (78.22° N, 15.65° E)', cloudMax: '10%', score: 98.1, status: 'COMPLETE', scheduledUtc: '11:15:00' },
  ]);
  const [submittedMsg, setSubmittedMsg] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lat || !lon) return;

    const latNum = parseFloat(lat);
    const score = Math.max(65, Math.min(99, Math.round(95 - Math.abs(latNum > 70 ? 15 : 0) - (parseInt(cloudCover) > 20 ? 10 : 0))));
    
    const newTask = {
      id: `TASK-${Date.now().toString().slice(-3)}`,
      sat: targetSat,
      target: `Target Point (${parseFloat(lat).toFixed(2)}° N, ${parseFloat(lon).toFixed(2)}° E)`,
      cloudMax: `${cloudCover}%`,
      score: score,
      status: 'QUEUED',
      scheduledUtc: `${new Date().getHours()}:${(new Date().getMinutes() + 15).toString().padStart(2, '0')}:00`,
    };

    setTasks(prev => [newTask, ...prev]);
    setSubmittedMsg(`Observation Task ${newTask.id} successfully queued with ${score}% feasibility score.`);
    setTimeout(() => setSubmittedMsg(''), 5000);
  };

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto">
      <div className="flex flex-col gap-1 rounded-xl border border-[#23272F] bg-gradient-to-r from-[#0F6E56]/20 via-[#161A20] to-[#14161B] px-5 py-4 border-l-4 border-l-[#3CB992]">
        <h1 className="text-[22px] leading-[1.15] font-bold">Payload deliveries</h1>
        <p className="text-[13px] text-[var(--color-text-secondary)]">Schedule multispectral observation passes & feasibility checks</p>
      </div>

      {submittedMsg && (
        <div className="bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[var(--success)] p-3 rounded-lg flex items-center justify-between text-xs font-mono-code text-[var(--success)]">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>{submittedMsg}</span>
          </div>
          <button onClick={() => setSubmittedMsg('')} className="text-[var(--color-text-secondary)] hover:text-white">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <form onSubmit={handleSubmit} className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] p-4 rounded-md flex flex-col gap-4 font-mono-code">
          <span className="text-xs font-bold text-[var(--color-text-primary)] border-b border-[var(--color-border)] pb-2">
            NEW PAYLOAD TASK REQUEST
          </span>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[var(--color-text-secondary)] uppercase font-bold">Target Spacecraft</label>
            <select
              value={targetSat}
              onChange={(e) => setTargetSat(e.target.value)}
              className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded px-3 py-2 text-xs text-[var(--color-text-primary)]"
            >
              <option value="AKV-01">AKV-01 (High-Res Optical Imager)</option>
              <option value="AKV-02">AKV-02 (Hyperspectral Radiometer)</option>
              <option value="AKV-03">AKV-03 (SAR Radar Aperture)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <InputField 
              label="Target Latitude (°)" 
              value={lat} 
              onChange={(e) => setLat(e.target.value)} 
              placeholder="28.6139" 
              required 
            />
            <InputField 
              label="Target Longitude (°)" 
              value={lon} 
              onChange={(e) => setLon(e.target.value)} 
              placeholder="77.2090" 
              required 
            />
          </div>

          <InputField 
            label="Cloud Cover Max Threshold (%)" 
            value={cloudCover} 
            onChange={(e) => setCloudCover(e.target.value)} 
            placeholder="15" 
          />

          <Button type="submit" variant="primary" size="lg" className="mt-2 justify-center">
            <Plus size={16} className="mr-1" /> Submit Payload Task Request
          </Button>
        </form>

        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] p-4 rounded-md flex flex-col gap-4 font-mono-code text-xs">
          <span className="font-bold text-[var(--color-text-primary)] border-b border-[var(--color-border)] pb-2">
            AI FEASIBILITY ASSESSMENT PREVIEW
          </span>
          <div className="flex items-center gap-2 text-[var(--success)] font-bold text-sm">
            <CheckCircle size={18} /> 92.4% Feasibility Score (Nominal Pass)
          </div>
          <div className="text-[var(--color-text-secondary)] space-y-2 bg-[var(--color-bg-elevated)] p-4 rounded-lg border border-[var(--color-border)]">
            <div>• Target Spacecraft: <strong className="text-[var(--action-primary)]">{targetSat}</strong></div>
            <div>• Elevation Profile: <strong className="text-[var(--color-text-primary)]">64.2° Max Elevation (Good LOS)</strong></div>
            <div>• Thermal & Battery Budget: <strong className="text-[var(--success)]">PASS (32Wh margin available)</strong></div>
            <div>• Downlink Opportunity: <strong className="text-[var(--info)]">S-Band Svalbard Contact (14:55 UTC)</strong></div>
          </div>
        </div>
      </div>

      {/* Task Queue Table */}
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-xs font-mono-code font-bold text-[var(--color-text-primary)]">
            SCHEDULED PAYLOAD TASKS ({tasks.length})
          </span>
        </div>
        <table className="w-full text-left font-mono-code text-xs">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-text-secondary)] text-[10px]">
              <th className="py-2.5 px-3">TASK ID</th>
              <th className="py-2.5 px-3">SATELLITE</th>
              <th className="py-2.5 px-3">TARGET COORDINATES</th>
              <th className="py-2.5 px-3">CLOUD MAX</th>
              <th className="py-2.5 px-3">FEASIBILITY</th>
              <th className="py-2.5 px-3">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-b border-[var(--color-bg-overlay)] hover:bg-[var(--color-bg-elevated)]">
                <td className="py-2.5 px-3 font-bold text-[var(--action-primary)]">{t.id}</td>
                <td className="py-2.5 px-3 font-semibold text-[var(--color-text-primary)]">{t.sat}</td>
                <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{t.target}</td>
                <td className="py-2.5 px-3 text-[var(--color-text-primary)]">{t.cloudMax}</td>
                <td className="py-2.5 px-3 font-bold text-[var(--success)]">{t.score}%</td>
                <td className="py-2.5 px-3"><StatusBadge status={t.status} size="sm" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
