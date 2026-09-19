import { FLEET } from '../../data/fleet';
import React, { useState, useRef } from 'react';
import { Button } from '../../components/atoms/Button';
import { Plus, Trash2, AlertTriangle, Clock } from 'lucide-react';

interface Activity {
  id: string;
  name: string;
  type: 'Housekeeping' | 'Payload Imaging' | 'S-Band Dump' | 'ADCS Maneuver' | 'Custom';
  startMin: number; // minutes from AOS
  durationMin: number;
}

interface ActivityPlannerProps {
  onNavigate: (path: string) => void;
}

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  'Housekeeping':    { bg: 'bg-[color-mix(in_srgb,var(--success)_20%,transparent)]', border: 'border-[var(--success)]', text: 'text-[var(--success)]' },
  'Payload Imaging': { bg: 'bg-[color-mix(in_srgb,var(--info)_20%,transparent)]', border: 'border-[var(--info)]', text: 'text-[var(--info)]' },
  'S-Band Dump':     { bg: 'bg-[color-mix(in_srgb,var(--warning)_20%,transparent)]', border: 'border-[var(--warning)]', text: 'text-[var(--warning)]' },
  'ADCS Maneuver':   { bg: 'bg-[color-mix(in_srgb,var(--sim)_20%,transparent)]', border: 'border-[var(--sim)]', text: 'text-[var(--sim)]' },
  'Custom':          { bg: 'bg-[color-mix(in_srgb,var(--color-text-secondary)_20%,transparent)]', border: 'border-[var(--color-text-secondary)]', text: 'text-[var(--color-text-secondary)]' },
};

const PASS_DURATION_MIN = 28; // ~28 min pass

export const ActivityPlanner: React.FC<ActivityPlannerProps> = () => {
  const [satellite, setSatellite] = useState('AKV-03');
  const [activities, setActivities] = useState<Activity[]>([
    { id: 'act-1', name: 'Housekeeping', type: 'Housekeeping', startMin: 0, durationMin: 5 },
    { id: 'act-2', name: 'Imaging Run Alpha', type: 'Payload Imaging', startMin: 6, durationMin: 8 },
    { id: 'act-3', name: 'S-Band Downlink', type: 'S-Band Dump', startMin: 16, durationMin: 9 },
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<Activity['type']>('Housekeeping');
  const [newStart, setNewStart] = useState(0);
  const [newDuration, setNewDuration] = useState(5);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Detect overlaps
  const hasConflict = (a: Activity, b: Activity) =>
    a.id !== b.id &&
    a.startMin < b.startMin + b.durationMin &&
    a.startMin + a.durationMin > b.startMin;

  const conflictIds = new Set<string>();
  activities.forEach((a) => {
    activities.forEach((b) => {
      if (hasConflict(a, b)) {
        conflictIds.add(a.id);
        conflictIds.add(b.id);
      }
    });
  });

  const addActivity = () => {
    if (!newName.trim()) return;
    setActivities((prev) => [
      ...prev,
      { id: `act-${Date.now()}`, name: newName, type: newType, startMin: newStart, durationMin: Math.max(1, newDuration) },
    ]);
    setNewName('');
  };

  const deleteSelected = () => {
    setActivities((prev) => prev.filter((a) => a.id !== selectedId));
    setSelectedId(null);
  };

  const pct = (min: number) => `${(min / PASS_DURATION_MIN) * 100}%`;

  const aosTime = '14:12:00';
  const losTime = '14:40:00';

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex justify-between  items-center rounded-xl border border-[#23272F] bg-gradient-to-r from-[#0F6E56]/20 via-[#161A20] to-[#14161B] px-5 py-4 border-l-4 border-l-[#3CB992]">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] leading-[1.15] font-bold">Mission plan</h1>
          <p className="text-[13px] text-[var(--color-text-secondary)]">Imaging, downlinks and maintenance that respect every resource rule</p>
        </div>
        <div className="flex items-center gap-2 font-mono-code text-xs">
          <span className="text-[var(--color-text-secondary)]">SATELLITE:</span>
          <select
            value={satellite}
            onChange={(e) => setSatellite(e.target.value)}
            className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded px-3 py-1.5 text-[var(--color-text-primary)]"
          >
            {FLEET.map((s) => <option key={s.sat_id}>{s.sat_id}</option>)}
          </select>
        </div>
      </div>

      {/* Conflict Warning */}
      {conflictIds.size > 0 && (
        <div className="flex items-center gap-3 bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] border border-[var(--warning)] rounded-lg px-4 py-2.5 text-xs font-mono-code text-[var(--warning)]">
          <AlertTriangle size={16} aria-hidden="true" />
          Resource conflict detected: {conflictIds.size} overlapping activities. Resolve before uplink.
        </div>
      )}

      {/* Main 2-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left: Timeline canvas */}
        <div className="lg:col-span-3 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-md p-4 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <span className="text-xs font-mono-code font-bold text-[var(--color-text-primary)]">TIMELINE WORKSPACE — {satellite}</span>
            <div className="flex items-center gap-3 text-[10px] font-mono-code text-[var(--color-text-secondary)]">
              <span className="flex items-center gap-1"><Clock size={11} aria-hidden="true" />AOS {aosTime} UTC</span>
              <span className="text-[var(--color-text-secondary)]">▶</span>
              <span className="flex items-center gap-1"><Clock size={11} aria-hidden="true" />LOS {losTime} UTC</span>
            </div>
          </div>

          {/* Timeline track */}
          <div
            ref={timelineRef}
            className="relative h-20 bg-[var(--color-bg-canvas)] border border-[var(--color-border)] rounded-lg overflow-hidden"
            role="region"
            aria-label="Mission timeline"
          >
            {/* Time axis ticks */}
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="absolute top-0 h-full border-l border-[var(--color-bg-overlay)]" style={{ left: `${(i / 6) * 100}%` }}>
                <span className="absolute bottom-1 left-1 text-[9px] font-mono-code text-[var(--color-text-disabled)]">
                  +{Math.round((i / 6) * PASS_DURATION_MIN)}m
                </span>
              </div>
            ))}

            {/* Activity blocks */}
            {activities.map((act) => {
              const colors = TYPE_COLORS[act.type] || TYPE_COLORS['Custom'];
              const isSelected = selectedId === act.id;
              const isConflict = conflictIds.has(act.id);
              return (
                <button
                  key={act.id}
                  onClick={() => setSelectedId(isSelected ? null : act.id)}
                  className={`absolute top-3 h-[56px] rounded border text-[10px] font-mono-code font-bold truncate px-2 flex items-center transition-all ${
                    colors.bg
                  } ${
                    isConflict ? 'border-[var(--danger)] border-2' : isSelected ? `${colors.border} border-2` : `${colors.border}`
                  } ${colors.text}`}
                  style={{ left: pct(act.startMin), width: pct(act.durationMin) }}
                  title={`${act.name} (${act.startMin}–${act.startMin + act.durationMin} min)`}
                  aria-label={`${act.name}, ${act.durationMin} minutes at +${act.startMin} minutes`}
                  aria-pressed={isSelected}
                >
                  {act.name}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 text-[10px] font-mono-code">
            {Object.entries(TYPE_COLORS).map(([type, c]) => (
              <span key={type} className={`flex items-center gap-1 ${c.text}`}>
                <span className={`w-2 h-2 rounded-sm ${c.bg} border ${c.border}`} aria-hidden="true" />
                {type}
              </span>
            ))}
            <span className="flex items-center gap-1 text-[var(--danger-text)]">
              <span className="w-2 h-2 rounded-sm bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] border border-[var(--danger)]" aria-hidden="true" />
              Conflict
            </span>
          </div>
        </div>

        {/* Right: Activity list + add form */}
        <div className="flex flex-col gap-3">
          {/* Activity list */}
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-md p-3 flex flex-col gap-2 min-h-[160px]">
            <span className="text-[10px] font-mono-code font-bold text-[var(--color-text-primary)] border-b border-[var(--color-border)] pb-1.5">ACTIVITIES</span>
            {activities.length === 0 && (
              <span className="text-[10px] text-[var(--color-text-secondary)] font-mono-code">No activities yet — add one below.</span>
            )}
            {activities.map((act) => {
              const colors = TYPE_COLORS[act.type] || TYPE_COLORS['Custom'];
              return (
                <button
                  key={act.id}
                  onClick={() => setSelectedId(act.id === selectedId ? null : act.id)}
                  className={`flex justify-between items-center p-2 rounded text-[10px] font-mono-code border transition-all ${
                    selectedId === act.id
                      ? 'bg-[color-mix(in_srgb,var(--action-primary)_15%,transparent)] border-[var(--action-primary)] text-[var(--color-text-primary)]'
                      : 'bg-[var(--color-bg-elevated)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)]'
                  }`}
                >
                  <span className={`truncate ${conflictIds.has(act.id) ? 'text-[var(--danger-text)]' : colors.text}`}>{act.name}</span>
                  <span className="text-[var(--color-text-disabled)] shrink-0 ml-1">{act.durationMin}m</span>
                </button>
              );
            })}
          </div>

          {/* Delete button */}
          {selectedId && (
            <Button variant="danger" size="sm" onClick={deleteSelected} className="w-full justify-center">
              <Trash2 size={13} aria-hidden="true" /> Delete Selected
            </Button>
          )}

          {/* Add activity form */}
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-md p-3 flex flex-col gap-2">
            <span className="text-[10px] font-mono-code font-bold text-[var(--color-text-primary)] border-b border-[var(--color-border)] pb-1.5">ADD ACTIVITY</span>
            <input
              className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs font-mono-code text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--info)]"
              placeholder="Activity name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              aria-label="Activity name"
            />
            <select
              className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs font-mono-code text-[var(--color-text-primary)]"
              value={newType}
              onChange={(e) => setNewType(e.target.value as Activity['type'])}
              aria-label="Activity type"
            >
              {Object.keys(TYPE_COLORS).map(t => <option key={t}>{t}</option>)}
            </select>
            <div className="flex gap-2">
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-[9px] font-mono-code text-[var(--color-text-secondary)] uppercase">Start (min)</label>
                <input type="number" min={0} max={PASS_DURATION_MIN - 1} value={newStart}
                  onChange={(e) => setNewStart(Number(e.target.value))}
                  className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs font-mono-code text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--info)] w-full"
                  aria-label="Start time in minutes from AOS"
                />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-[9px] font-mono-code text-[var(--color-text-secondary)] uppercase">Duration (min)</label>
                <input type="number" min={1} max={PASS_DURATION_MIN} value={newDuration}
                  onChange={(e) => setNewDuration(Number(e.target.value))}
                  className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs font-mono-code text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--info)] w-full"
                  aria-label="Duration in minutes"
                />
              </div>
            </div>
            <Button variant="primary" size="sm" onClick={addActivity} className="w-full justify-center">
              <Plus size={13} aria-hidden="true" /> Add to Timeline
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
