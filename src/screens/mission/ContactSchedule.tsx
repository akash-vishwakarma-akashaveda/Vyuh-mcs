import { FLEET } from '../../data/fleet';
import React, { useState } from 'react';
import { MOCK_CONTACT_WINDOWS } from '../../mocks/mockData';
import { StatusBadge } from '../../components/atoms/Badge';
import { Button } from '../../components/atoms/Button';
import { Radio, ChevronRight, X, AlertTriangle, CheckCircle2, SlidersHorizontal, ShieldAlert } from 'lucide-react';
import { formatUTC } from '../../utils/formatUTC';
import { ContactWindow } from '../../types';

interface ContactScheduleProps {
  onNavigate: (path: string) => void;
}

export const ContactSchedule: React.FC<ContactScheduleProps> = ({ onNavigate }) => {
  const [windows, setWindows] = useState<ContactWindow[]>(MOCK_CONTACT_WINDOWS);
  const [selectedWin, setSelectedWin] = useState<ContactWindow | null>(null);
  const [satFilter, setSatFilter] = useState('ALL');
  const [gsFilter, setGsFilter] = useState('ALL');
  const [bandFilter, setBandFilter] = useState('ALL');
  const [toastMsg, setToastMsg] = useState('');

  const filtered = windows.filter(w => {
    if (satFilter !== 'ALL' && w.sat_id !== satFilter) return false;
    if (gsFilter !== 'ALL' && w.ground_station !== gsFilter) return false;
    if (bandFilter !== 'ALL' && w.frequency_band !== bandFilter) return false;
    return true;
  });

  const handleOverrideSchedule = (winId: string) => {
    setToastMsg(`Schedule override submitted for pass ${winId}. Ground station antenna reserved with P1 preemption.`);
    setTimeout(() => setToastMsg(''), 5000);
  };

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto">
      <div className="flex justify-between  items-center rounded-xl border border-[#23272F] bg-gradient-to-r from-[#0F6E56]/20 via-[#161A20] to-[#14161B] px-5 py-4 border-l-4 border-l-[#3CB992]">
        <div className="flex flex-col">
          <h1 className="text-[22px] leading-[1.15] font-bold">Contact schedule</h1>
          <p className="text-[13px] text-[var(--color-text-secondary)]">Predicted windows and bookings for every satellite and station</p>
        </div>
      </div>

      {toastMsg && (
        <div className="bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[var(--success)] p-3 rounded-lg flex items-center justify-between text-xs font-mono-code text-[var(--success)]">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>{toastMsg}</span>
          </div>
          <button onClick={() => setToastMsg('')} className="text-[var(--color-text-secondary)] hover:text-white">✕</button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] p-4 rounded-md flex flex-wrap gap-4 font-mono-code text-xs items-center">
        <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
          <SlidersHorizontal size={14} />
          <span>FILTERS:</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-secondary)]">Sat:</span>
          <select
            value={satFilter}
            onChange={(e) => setSatFilter(e.target.value)}
            className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded px-2.5 py-1 text-[var(--color-text-primary)]"
          >
            <option value="ALL">All Spacecraft</option>
            {FLEET.map((s) => <option key={s.sat_id} value={s.sat_id}>{s.sat_id}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-secondary)]">Ground Station:</span>
          <select
            value={gsFilter}
            onChange={(e) => setGsFilter(e.target.value)}
            className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded px-2.5 py-1 text-[var(--color-text-primary)]"
          >
            <option value="ALL">All Stations</option>
            <option value="KSAT-Svalbard">KSAT-Svalbard</option>
            <option value="Inuvik Station">Inuvik Station</option>
            <option value="SGS-Chile">SGS-Chile</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-secondary)]">Band:</span>
          <select
            value={bandFilter}
            onChange={(e) => setBandFilter(e.target.value)}
            className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded px-2.5 py-1 text-[var(--color-text-primary)]"
          >
            <option value="ALL">All Bands</option>
            <option value="S">S-Band</option>
            <option value="X">X-Band</option>
            <option value="Ka">Ka-Band</option>
          </select>
        </div>
      </div>

      {/* Main Table + Slideout Drawer Layout */}
      <div className="flex gap-4">
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-md flex-1 overflow-hidden">
          <table className="w-full text-left font-mono-code text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-secondary)] text-[10px]">
                <th className="py-2.5 px-3">WINDOW ID</th>
                <th className="py-2.5 px-3">SATELLITE</th>
                <th className="py-2.5 px-3">GROUND STATION</th>
                <th className="py-2.5 px-3">BAND</th>
                <th className="py-2.5 px-3">AOS UTC</th>
                <th className="py-2.5 px-3">LOS UTC</th>
                <th className="py-2.5 px-3">MAX ELEV</th>
                <th className="py-2.5 px-3">STATUS</th>
                <th className="py-2.5 px-3 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((win) => (
                <tr
                  key={win.window_id}
                  onClick={() => setSelectedWin(win)}
                  className={`border-b border-[var(--color-bg-overlay)] cursor-pointer transition-colors ${
                    selectedWin?.window_id === win.window_id ? 'bg-[color-mix(in_srgb,var(--action-primary)_15%,transparent)]' : 'hover:bg-[var(--color-bg-elevated)]'
                  }`}
                >
                  <td className="py-2.5 px-3 font-bold text-[var(--color-text-primary)]">{win.window_id}</td>
                  <td className="py-2.5 px-3 font-bold text-[var(--action-primary)]">{win.sat_id}</td>
                  <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{win.ground_station}</td>
                  <td className="py-2.5 px-3 font-bold text-[var(--info)]">{win.frequency_band}-Band</td>
                  <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{formatUTC(win.aos_utc, 'HH:mm:ss')}</td>
                  <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{formatUTC(win.los_utc, 'HH:mm:ss')}</td>
                  <td className="py-2.5 px-3 text-[var(--color-text-primary)]">{win.max_elevation_deg}°</td>
                  <td className="py-2.5 px-3"><StatusBadge status={win.status} size="sm" /></td>
                  <td className="py-2.5 px-3 text-right">
                    <ChevronRight size={14} className={selectedWin?.window_id === win.window_id ? 'text-[var(--action-primary)]' : 'text-[var(--color-text-disabled)]'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right 480px Detail Drawer per Section 6.5 */}
        {selectedWin && (
          <div className="w-[380px] bg-[var(--color-bg-surface)] border border-[color-mix(in_srgb,var(--action-primary)_40%,transparent)] rounded-md p-5 flex flex-col gap-4 font-mono-code text-xs shrink-0">
            <div className="flex justify-between items-center border-b border-[var(--color-border)] pb-3">
              <div className="flex flex-col">
                <span className="font-bold text-sm text-[var(--color-text-primary)]">{selectedWin.window_id}</span>
                <span className="text-[10px] text-[var(--action-primary)] font-bold">{selectedWin.sat_id} • {selectedWin.ground_station}</span>
              </div>
              <button onClick={() => setSelectedWin(null)} className="text-[var(--color-text-secondary)] hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2.5 bg-[var(--color-bg-elevated)] p-3.5 rounded-lg border border-[var(--color-border)]">
              <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">Frequency Band:</span><strong className="text-[var(--info)]">{selectedWin.frequency_band}-Band</strong></div>
              <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">AOS Time:</span><strong className="text-[var(--color-text-primary)]">{formatUTC(selectedWin.aos_utc, 'HH:mm:ss')} UTC</strong></div>
              <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">LOS Time:</span><strong className="text-[var(--color-text-primary)]">{formatUTC(selectedWin.los_utc, 'HH:mm:ss')} UTC</strong></div>
              <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">Duration:</span><strong className="text-[var(--color-text-primary)]">{selectedWin.duration_seconds} seconds</strong></div>
              <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">Max Elevation:</span><strong className="text-[var(--success)]">{selectedWin.max_elevation_deg}° Peak</strong></div>
              <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">Quality Score:</span><strong className="text-[var(--color-text-primary)]">{selectedWin.quality_score}% Optimal</strong></div>
            </div>

            <div className="flex flex-col gap-2 mt-auto">
              <Button 
                variant="primary" 
                size="sm" 
                onClick={() => handleOverrideSchedule(selectedWin.window_id)}
                className="w-full justify-center"
              >
                Override Pass Schedule
              </Button>
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={() => onNavigate(`/satellites/${selectedWin.sat_id}`)}
                className="w-full justify-center"
              >
                View {selectedWin.sat_id} Telemetry
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
