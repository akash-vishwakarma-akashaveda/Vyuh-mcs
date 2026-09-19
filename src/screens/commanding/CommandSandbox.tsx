import { FLEET } from '../../data/fleet';
import React, { useState } from 'react';
import { Button } from '../../components/atoms/Button';
import { InputField } from '../../components/molecules/InputField';
import { Terminal, ShieldAlert, Send, CheckCircle2, AlertCircle } from 'lucide-react';

interface CommandSandboxProps {
  onNavigate: (path: string) => void;
}

const COMMAND_DEFS = {
  'TC_ADCS_SET_MODE': { apid: '0x01A', apidNum: 26, defaultParam: 'SUN_POINTING', validValues: ['SUN_POINTING', 'EARTH_POINTING', 'SAFE', 'DETUMBLE'], byteBase: '1801C000000B0200' },
  'TC_PAYLOAD_POWER_ON': { apid: '0x02C', apidNum: 44, defaultParam: 'PAYLOAD_PRIMARY', validValues: ['PAYLOAD_PRIMARY', 'PAYLOAD_SECONDARY', 'PAYLOAD_ALL'], byteBase: '182CC000000C0100' },
  'TC_HEATER_ENABLE': { apid: '0x014', apidNum: 20, defaultParam: 'ZONE_BATTERY_1', validValues: ['ZONE_BATTERY_1', 'ZONE_BATTERY_2', 'ZONE_OPTICAL'], byteBase: '1814C000000A0400' },
  'TC_COMMS_SET_BAUD': { apid: '0x032', apidNum: 50, defaultParam: '115200', validValues: ['9600', '38400', '115200', '921600'], byteBase: '1832C00000080200' },
};

export const CommandSandbox: React.FC<CommandSandboxProps> = ({ onNavigate }) => {
  const [targetSat, setTargetSat] = useState('AKV-03');
  const [mnemonic, setMnemonic] = useState<keyof typeof COMMAND_DEFS>('TC_ADCS_SET_MODE');
  const [paramVal, setParamVal] = useState(COMMAND_DEFS['TC_ADCS_SET_MODE'].defaultParam);
  const [showModal, setShowModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const currentDef = COMMAND_DEFS[mnemonic] || COMMAND_DEFS['TC_ADCS_SET_MODE'];
  const isValidParam = currentDef.validValues.includes(paramVal.trim());

  // Dynamic hex frame calculation
  const paramHex = Array.from(paramVal).map(c => c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')).join('');
  const ccsdsHex = `${currentDef.byteBase}${paramHex.substring(0, 16).padEnd(8, '0')}`;

  const handleMnemonicChange = (m: keyof typeof COMMAND_DEFS) => {
    setMnemonic(m);
    setParamVal(COMMAND_DEFS[m].defaultParam);
  };

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto">
      <div className="flex flex-col gap-1 rounded-xl border border-[#23272F] bg-gradient-to-r from-[#0F6E56]/20 via-[#161A20] to-[#14161B] px-5 py-4 border-l-4 border-l-[#3CB992]">
        <h1 className="text-[22px] leading-[1.15] font-bold">Command console</h1>
        <p className="text-[13px] text-[var(--color-text-secondary)]">Build and uplink individual raw telecommands with byte transparency</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Command Form */}
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] p-4 rounded-md flex flex-col gap-4 font-mono-code text-xs">
          <span className="font-bold text-[var(--color-text-primary)] border-b border-[var(--color-border)] pb-2">
            TELECOMMAND PARAMETER BUILDER
          </span>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-[var(--color-text-secondary)] uppercase font-bold">Target Spacecraft</label>
            <select
              value={targetSat}
              onChange={(e) => setTargetSat(e.target.value)}
              className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded px-3 py-2 text-xs text-[var(--color-text-primary)]"
            >
              {FLEET.map((s) => <option key={s.sat_id} value={s.sat_id}>{s.sat_id} ({s.name})</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-[var(--color-text-secondary)] uppercase font-bold">Command Mnemonic</label>
            <select
              value={mnemonic}
              onChange={(e) => handleMnemonicChange(e.target.value as keyof typeof COMMAND_DEFS)}
              className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded px-3 py-2 text-xs text-[var(--color-text-primary)]"
            >
              <option value="TC_ADCS_SET_MODE">TC_ADCS_SET_MODE (APID 0x01A)</option>
              <option value="TC_PAYLOAD_POWER_ON">TC_PAYLOAD_POWER_ON (APID 0x02C)</option>
              <option value="TC_HEATER_ENABLE">TC_HEATER_ENABLE (APID 0x014)</option>
              <option value="TC_COMMS_SET_BAUD">TC_COMMS_SET_BAUD (APID 0x032)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-[var(--color-text-secondary)] uppercase font-bold">Command Argument / Payload</label>
            <input
              value={paramVal}
              onChange={(e) => setParamVal(e.target.value)}
              className={`bg-[var(--color-bg-elevated)] border rounded px-3 py-2 text-xs font-mono-code text-[var(--color-text-primary)] focus:outline-none ${
                isValidParam ? 'border-[var(--color-border)] focus:border-[var(--info)]' : 'border-[var(--danger)] text-[var(--danger-text)]'
              }`}
            />
            <div className="flex items-center justify-between text-[10px] pt-1">
              <span className="text-[var(--color-text-secondary)]">Valid values: {currentDef.validValues.join(', ')}</span>
              {!isValidParam && (
                <span className="text-[var(--danger-text)] flex items-center gap-1 font-bold">
                  <AlertCircle size={12} /> Invalid value
                </span>
              )}
            </div>
          </div>

          <Button 
            variant="primary" 
            size="lg" 
            onClick={() => setShowModal(true)} 
            className="mt-4 justify-center"
            disabled={!isValidParam}
          >
            <Send size={16} className="mr-1.5" /> Uplink Command Frame
          </Button>
        </div>

        {/* Byte Transparency Preview Panel */}
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] p-4 rounded-md flex flex-col gap-4 font-mono-code text-xs">
          <span className="font-bold text-[var(--color-text-primary)] border-b border-[var(--color-border)] pb-2">
            CCSDS TC PACKET HEX PREVIEW (COP-1)
          </span>

          <div className="bg-[var(--color-bg-canvas)] border border-[var(--color-border)] p-4 rounded text-xs text-[var(--action-primary)] font-bold tracking-widest break-all font-mono-code leading-relaxed">
            {ccsdsHex}
          </div>

          <div className="text-xs text-[var(--color-text-secondary)] space-y-2.5 bg-[var(--color-bg-elevated)] p-4 rounded-lg border border-[var(--color-border)]">
            <div className="flex justify-between"><span>APID:</span><strong className="text-[var(--color-text-primary)]">{currentDef.apid} ({currentDef.apidNum})</strong></div>
            <div className="flex justify-between"><span>Sequence Count:</span><strong className="text-[var(--color-text-primary)]">1042</strong></div>
            <div className="flex justify-between"><span>Frame Byte Length:</span><strong className="text-[var(--color-text-primary)]">{ccsdsHex.length / 2} Bytes</strong></div>
            <div className="flex justify-between"><span>Uplink Security:</span><strong className="text-[var(--success)]">AES-256-GCM Active (CRC-16 OK)</strong></div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal requiring "CONFIRM" */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--color-bg-canvas)_80%,transparent)] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--color-bg-surface)] border border-[var(--danger)] p-6 rounded-md max-w-md w-full flex flex-col gap-4 font-mono-code">
            <div className="flex items-center gap-3 text-[var(--danger-text)]">
              <ShieldAlert size={28} />
              <h2 className="text-[16px] font-bold">Confirm Manual Command Uplink</h2>
            </div>

            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              You are preparing to execute <strong className="text-white">{mnemonic}</strong> ({paramVal}) on <strong className="text-[var(--action-primary)]">{targetSat}</strong>.
            </p>

            <InputField
              label="Type CONFIRM to authorize"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="CONFIRM"
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => { setShowModal(false); setConfirmText(''); }}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={confirmText !== 'CONFIRM'}
                onClick={() => {
                  setShowModal(false);
                  onNavigate('/commanding/queue');
                }}
              >
                Uplink Now
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
