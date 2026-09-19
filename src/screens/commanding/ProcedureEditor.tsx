import React, { useState } from 'react';
import { Button } from '../../components/atoms/Button';
import { MOCK_PROCEDURES } from '../../mocks/mockData';
import { ArrowLeft, Save, CheckCircle2, Code, Layers, FileCheck, Play } from 'lucide-react';

interface ProcedureEditorProps {
  procedureId?: string;
  onNavigate: (path: string) => void;
}

export const ProcedureEditor: React.FC<ProcedureEditorProps> = ({ procedureId, onNavigate }) => {
  const proc = MOCK_PROCEDURES.find((p) => p.id === procedureId) || MOCK_PROCEDURES[0];
  const [activeTab, setActiveTab] = useState<'script' | 'visual' | 'validation'>('script');
  const [code, setCode] = useState(proc.script_content);
  const [notification, setNotification] = useState('');

  const handleSaveDraft = () => {
    setNotification(`Draft saved successfully for ${proc.id} at ${new Date().toISOString().slice(11, 19)} UTC.`);
    setTimeout(() => setNotification(''), 4000);
  };

  const handlePublish = () => {
    setNotification(`Procedure ${proc.id} v${(parseFloat(proc.version) + 0.1).toFixed(1)} published to operational library!`);
    setTimeout(() => setNotification(''), 4000);
  };

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto">
      <div className="flex flex-col gap-1 rounded-xl border border-[#23272F] bg-gradient-to-r from-[#0F6E56]/20 via-[#161A20] to-[#14161B] px-5 py-4 border-l-4 border-l-[#3CB992]">
        <h1 className="text-[22px] leading-[1.15] font-bold">Procedure editor</h1>
        <p className="text-[13px] text-[var(--color-text-secondary)]">Author and validate procedures as reviewed, versioned definitions</p>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => onNavigate('/commanding')}>
            <ArrowLeft size={14} aria-hidden="true" /> Back to TC Dashboard
          </Button>
          <span className="font-mono-code font-bold text-sm text-[var(--action-primary)]">{proc.id}</span>
          <span className="text-[13px] text-[var(--color-text-secondary)]">v{proc.version}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleSaveDraft}>
            <Save size={14} aria-hidden="true" /> Save Draft
          </Button>
          <Button variant="primary" size="sm" onClick={handlePublish}>
            Publish Version
          </Button>
        </div>
      </div>

      {notification && (
        <div className="bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[var(--success)] p-3 rounded-lg flex items-center justify-between text-xs font-mono-code text-[var(--success)]">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification('')} className="text-[var(--color-text-secondary)] hover:text-white">✕</button>
        </div>
      )}

      {/* Editor Tabs */}
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] p-4 rounded-lg flex flex-col gap-4 flex-1">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2">
          <button
            onClick={() => setActiveTab('script')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono-code font-bold transition-colors ${
              activeTab === 'script' ? 'bg-[var(--action-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-elevated)]'
            }`}
          >
            <Code size={14} aria-hidden="true" /> Script DSL
          </button>
          <button
            onClick={() => setActiveTab('visual')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono-code font-bold transition-colors ${
              activeTab === 'visual' ? 'bg-[var(--action-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-elevated)]'
            }`}
          >
            <Layers size={14} aria-hidden="true" /> Flowchart Visual
          </button>
          <button
            onClick={() => setActiveTab('validation')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono-code font-bold transition-colors ${
              activeTab === 'validation' ? 'bg-[var(--action-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-elevated)]'
            }`}
          >
            <FileCheck size={14} aria-hidden="true" /> MIB Validation
          </button>
        </div>

        {/* Script Tab */}
        {activeTab === 'script' && (
          <div className="flex-1 flex flex-col gap-2 min-h-[350px]">
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full flex-1 bg-[var(--color-bg-canvas)] text-[var(--color-text-primary)] font-mono-code p-4 border border-[var(--color-border)] rounded-md text-xs leading-relaxed focus:outline-none focus:border-[var(--info)] resize-none"
              rows={16}
              aria-label="Procedure script DSL editor"
            />
          </div>
        )}

        {/* Visual Flowchart Preview */}
        {activeTab === 'visual' && (
          <div className="flex-1 bg-[var(--color-bg-canvas)] border border-[var(--color-border)] rounded-md p-6 flex flex-col items-center justify-center gap-4 text-xs font-mono-code min-h-[350px]">
            <div className="px-4 py-2 bg-[var(--action-primary)] text-white rounded border border-[var(--action-hover)]">START: Initiate Telecommand</div>
            <div className="w-0.5 h-6 bg-[var(--color-border)]" />
            <div className="px-4 py-2 bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] rounded border border-[var(--color-border)]">TC_EXEC(PAYLOAD_POWER_OFF)</div>
            <div className="w-0.5 h-6 bg-[var(--color-border)]" />
            <div className="px-4 py-2 bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-[var(--warning)] rounded border border-[var(--warning)]">WAIT_TELEMETRY(PAYLOAD_CURRENT == 0)</div>
            <div className="w-0.5 h-6 bg-[var(--color-border)]" />
            <div className="px-4 py-2 bg-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)] rounded border border-[var(--success)]">END: Procedure Complete</div>
          </div>
        )}

        {/* MIB Validation Results */}
        {activeTab === 'validation' && (
          <div className="flex-1 bg-[var(--color-bg-canvas)] border border-[var(--color-border)] rounded-md p-4 flex flex-col gap-3 text-xs font-mono-code min-h-[350px]">
            <div className="flex items-center gap-2 text-[var(--success)] font-bold">
              <CheckCircle2 size={18} aria-hidden="true" /> 0 Syntax Errors Found • Dictionary v2.3 Validated
            </div>
            <div className="text-[var(--color-text-secondary)] space-y-1">
              <div>• Command APID 0x01A verified against satellite dictionary</div>
              <div>• All parameter types match XTCE specifications</div>
              <div>• Pre-check precondition queries match active Redis CVT schema</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
