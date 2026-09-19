import React, { useState, useRef } from 'react';
import { Button } from '../../components/atoms/Button';
import { StatusBadge } from '../../components/atoms/Badge';
import { FileCode, Upload, CheckCircle2, ChevronRight, Database } from 'lucide-react';

interface MIBManagerProps {
  satId: string;
  onNavigate: (path: string) => void;
}

const INITIAL_VERSIONS = [
  { version: 'v2.3.1', uploaded: '2026-07-12 09:14 UTC', operator: 'Kavya Nair', status: 'NOMINAL', active: true },
  { version: 'v2.2.0', uploaded: '2026-05-03 14:32 UTC', operator: 'Akashaveda Controller', status: 'STALE', active: false },
  { version: 'v2.1.5', uploaded: '2026-02-18 11:05 UTC', operator: 'Siddharth Rao', status: 'STALE', active: false },
];

const PARAMS = [
  { param_id: 'BUS_VOLTAGE_1', apid: '0x01A', type: 'UINT16', unit: 'V', equation: 'EU = DN * 0.0125 + 0.10', softLow: 26.5, softHigh: 30.0, hardLow: 25.0, hardHigh: 32.0 },
  { param_id: 'BATT_TEMP_1', apid: '0x01A', type: 'INT16', unit: '°C', equation: 'EU = (DN / 1024) * 100 - 50', softLow: -10, softHigh: 45, hardLow: -20, hardHigh: 60 },
  { param_id: 'SOLAR_CURR_1', apid: '0x01B', type: 'UINT16', unit: 'A', equation: 'EU = DN * 0.002', softLow: 0.5, softHigh: 4.2, hardLow: 0.0, hardHigh: 5.0 },
  { param_id: 'RW_SPEED_1', apid: '0x02A', type: 'INT32', unit: 'RPM', equation: 'EU = DN * 0.5', softLow: -5500, softHigh: 5500, hardLow: -6000, hardHigh: 6000 },
  { param_id: 'ADCS_ANGLE_X', apid: '0x02B', type: 'FLOAT32', unit: '°', equation: 'EU = DN * (180.0 / π)', softLow: -5, softHigh: 5, hardLow: -10, hardHigh: 10 },
  { param_id: 'COMMS_RSSI', apid: '0x03A', type: 'INT16', unit: 'dBm', equation: 'EU = DN * 0.25 - 100', softLow: -95, softHigh: -30, hardLow: -105, hardHigh: -20 },
];

export const MIBManager: React.FC<MIBManagerProps> = ({ satId }) => {
  const [versions, setVersions] = useState(INITIAL_VERSIONS);
  const [selectedParam, setSelectedParam] = useState<typeof PARAMS[0] | null>(PARAMS[0]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (fileName = 'XTCE_Dictionary_v2.4.0.xml') => {
    setUploading(true);
    setTimeout(() => {
      setUploading(false);
      setUploadSuccess(true);
      const newVer = {
        version: `v2.4.0`,
        uploaded: `${new Date().toISOString().slice(0, 10)} ${new Date().toISOString().slice(11, 16)} UTC`,
        operator: 'Active Operator',
        status: 'NOMINAL',
        active: true,
      };
      setVersions(prev => [newVer, ...prev.map(v => ({ ...v, active: false }))]);
      setTimeout(() => setUploadSuccess(false), 4000);
    }, 1200);
  };

  const handleActivate = (ver: string) => {
    setVersions(prev => prev.map(v => ({
      ...v,
      active: v.version === ver,
    })));
  };

  const activeVersion = versions.find(v => v.active)?.version || 'v2.3.1';

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto">
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0].name)}
        accept=".xml,.xtce,.csv"
        className="hidden"
      />

      <div className="flex justify-between  items-center rounded-xl border border-[#23272F] bg-gradient-to-r from-[#0F6E56]/20 via-[#161A20] to-[#14161B] px-5 py-4 border-l-4 border-l-[#3CB992]">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] leading-[1.15] font-bold">Mission database</h1>
          <p className="text-[13px] text-[var(--color-text-secondary)]">Telemetry decommutation dictionary & calibration curves ({satId})</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => fileInputRef.current?.click()}>
          <Upload size={14} aria-hidden="true" /> Upload XTCE XML
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Upload + Version History */}
        <div className="flex flex-col gap-4">
          {/* Upload Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileUpload(); }}
            className={`border-2 border-dashed rounded-md p-6 flex flex-col items-center gap-3 text-center transition-colors cursor-pointer ${
              dragOver ? 'border-[var(--action-primary)] bg-[color-mix(in_srgb,var(--action-primary)_10%,transparent)]' : 'border-[var(--color-border)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-hover)]'
            }`}
            role="button"
            aria-label="Upload XTCE XML file. Drag and drop or click."
          >
            {uploadSuccess ? (
              <>
                <CheckCircle2 size={28} className="text-[var(--success)]" aria-hidden="true" />
                <span className="text-xs font-mono-code text-[var(--success)] font-bold">XTCE Uploaded & Activated!</span>
                <span className="text-[10px] text-[var(--color-text-secondary)]">Parameters updated across telemetry parser</span>
              </>
            ) : uploading ? (
              <>
                <div className="w-7 h-7 border-2 border-[var(--action-primary)] border-t-transparent rounded-full animate-spin" aria-label="Uploading" />
                <span className="text-xs font-mono-code text-[var(--color-text-secondary)]">Parsing XTCE XML…</span>
              </>
            ) : (
              <>
                <Upload size={28} className="text-[var(--color-text-secondary)]" aria-hidden="true" />
                <span className="text-xs font-mono-code font-bold text-[var(--color-text-primary)]">Upload XTCE XML</span>
                <span className="text-[10px] text-[var(--color-text-secondary)]">Drag & drop or click to select file</span>
                <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                  Browse File
                </Button>
              </>
            )}
          </div>

          {/* Version History */}
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-md p-3 flex flex-col gap-2">
            <span className="text-[10px] font-mono-code font-bold text-[var(--color-text-primary)] border-b border-[var(--color-border)] pb-1.5">DICTIONARY VERSION HISTORY</span>
            {versions.map((v) => (
              <div key={v.version} className={`p-2.5 rounded border text-[10px] font-mono-code flex flex-col gap-1.5 ${
                v.active ? 'bg-[color-mix(in_srgb,var(--action-primary)_10%,transparent)] border-[color-mix(in_srgb,var(--action-primary)_40%,transparent)]' : 'bg-[var(--color-bg-elevated)] border-[var(--color-border)]'
              }`}>
                <div className="flex justify-between items-center">
                  <span className={`font-bold ${v.active ? 'text-[var(--action-primary)]' : 'text-[var(--color-text-primary)]'}`}>{v.version}</span>
                  <StatusBadge status={v.active ? 'NOMINAL' : 'STALE'} size="sm" />
                </div>
                <span className="text-[var(--color-text-secondary)]">{v.uploaded}</span>
                <span className="text-[var(--color-text-secondary)]">By: {v.operator}</span>
                {!v.active && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-[10px] h-6 px-2 self-end text-[var(--action-primary)] hover:text-[var(--action-hover)]"
                    onClick={() => handleActivate(v.version)}
                  >
                    Activate {v.version}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Parameter Browser + Detail */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database size={14} className="text-[var(--action-primary)]" aria-hidden="true" />
                <span className="text-xs font-mono-code font-bold text-[var(--color-text-primary)]">ACTIVE DICTIONARY ({activeVersion}) — {PARAMS.length} Parameters</span>
              </div>
              <span className="text-[10px] font-mono-code text-[var(--success)]">● Telemetry Decom Hot Path Synced</span>
            </div>
            <table className="w-full text-left font-mono-code text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-secondary)] text-[10px]">
                  <th className="py-2.5 px-3">PARAMETER</th>
                  <th className="py-2.5 px-3">APID</th>
                  <th className="py-2.5 px-3">TYPE</th>
                  <th className="py-2.5 px-3">UNIT</th>
                  <th className="py-2.5 px-3">CALIBRATION</th>
                  <th className="py-2.5 px-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {PARAMS.map((p) => (
                  <tr
                    key={p.param_id}
                    className={`border-b border-[var(--color-bg-overlay)] cursor-pointer transition-colors ${
                      selectedParam?.param_id === p.param_id ? 'bg-[color-mix(in_srgb,var(--action-primary)_15%,transparent)]' : 'hover:bg-[var(--color-bg-elevated)]'
                    }`}
                    onClick={() => setSelectedParam(p)}
                  >
                    <td className="py-2.5 px-3 font-bold text-[var(--action-primary)]">{p.param_id}</td>
                    <td className="py-2.5 px-3 text-[var(--info)]">{p.apid}</td>
                    <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{p.type}</td>
                    <td className="py-2.5 px-3 text-[var(--color-text-primary)]">{p.unit}</td>
                    <td className="py-2.5 px-3 text-[var(--color-text-secondary)] truncate max-w-[140px]">{p.equation}</td>
                    <td className="py-2.5 px-3 text-right">
                      <ChevronRight size={14} className={selectedParam?.param_id === p.param_id ? 'text-[var(--action-primary)]' : 'text-[var(--color-text-disabled)]'} aria-hidden="true" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Calibration Detail Panel */}
          {selectedParam && (
            <div className="bg-[var(--color-bg-surface)] border border-[color-mix(in_srgb,var(--action-primary)_40%,transparent)] rounded-md p-4 flex flex-col gap-3 font-mono-code text-xs">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
                <span className="font-bold text-[var(--action-primary)] text-sm">{selectedParam.param_id}</span>
                <span className="text-[var(--color-text-secondary)]">APID {selectedParam.apid} • {selectedParam.type} • {selectedParam.unit}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wider">Calibration Equation</span>
                  <code className="text-[var(--action-primary)] font-bold text-sm bg-[var(--color-bg-canvas)] rounded px-3 py-2 border border-[var(--color-border)]">{selectedParam.equation}</code>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wider">Alarm Limits</span>
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    <span className="text-[var(--danger-text)]">Hard Low: {selectedParam.hardLow} {selectedParam.unit}</span>
                    <span className="text-[var(--danger-text)]">Hard High: {selectedParam.hardHigh} {selectedParam.unit}</span>
                    <span className="text-[var(--warning)]">Soft Low: {selectedParam.softLow} {selectedParam.unit}</span>
                    <span className="text-[var(--warning)]">Soft High: {selectedParam.softHigh} {selectedParam.unit}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
