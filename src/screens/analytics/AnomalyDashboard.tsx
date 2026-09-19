import React, { useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '../../components/atoms/Button';
import { Banner, Card, PageHead } from '../../components/molecules/Page';
import { useMissionStore } from '../../store/useMissionStore';
import { useFleetStore } from '../../store/useFleetStore';
import { FLEET } from '../../data/fleet';
import { Advisory } from '../../types';

const SUBSYSTEMS = ['POWER', 'ADCS', 'THERMAL', 'COMMS', 'PAYLOAD', 'OBC'];

const TIER_CLS: Record<string, string> = {
  T1: 'border-[#C77DDB] bg-[#C77DDB]/16 text-[#C77DDB]',
  T2: 'border-[#C77DDB]/70 bg-[#C77DDB]/12 text-[#C77DDB]',
  T3: 'border-[#9C9AEC]/70 bg-[#9C9AEC]/12 text-[#9C9AEC]',
  T4: 'border-[#3D4452] bg-[#3D4452]/20 text-[#A1A7B3]',
};

/** S20 · Anomaly advisories — evidence first; advisories never raise CRITICAL alarms alone. */
export const AnomalyDashboard: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const { advisories, setAdvisoryState, injectHeaterFault, heaterFault } = useMissionStore();
  const cvt = useFleetStore((s) => s.cvt);
  const [filter, setFilter] = useState<'ALL' | Advisory['state']>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = advisories.filter((a) => filter === 'ALL' || a.state === filter);
  const selected = advisories.find((a) => a.advisory_id === (selectedId ?? rows[0]?.advisory_id));

  // Evidence chart: recent BAT_TEMP-style trace for the advisory's satellite.
  const live = selected ? cvt[selected.sat_id]?.[selected.contributors[0]?.param]?.eu_value : undefined;

  return (
    <>
      <PageHead
        title="Anomaly advisories"
        sub="AI advises, people decide (P-01)"
        actions={!heaterFault ? <Button variant="warning" onClick={injectHeaterFault}>Inject heater fault on AKV-03</Button> : undefined}
      />

      <Banner kind="advisory" lead="Advisory only.">
        Never auto-escalated. A person confirms or dismisses; feedback becomes training labels.
      </Banner>

      <div className="flex gap-1.5 mb-3">
        {(['ALL', 'NEW', 'CONFIRMED', 'DISMISSED'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={clsx('h-[26px] px-3 rounded-full border text-[12px]',
              filter === f ? 'border-[#0F6E56] text-white bg-[#0F6E56]' : 'border-[#2B303B] text-[#A1A7B3] hover:bg-[#1A1D24]')}>
            {f === 'ALL' ? 'All' : f[0] + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        <Card title={`Advisory feed · ${rows.length}`}>
          <div className="flex flex-col gap-2">
            {rows.length === 0 && <p className="text-[13px] text-[#A1A7B3]">No advisories in this filter.</p>}
            {rows.map((a) => (
              <button key={a.advisory_id} onClick={() => setSelectedId(a.advisory_id)}
                className={clsx('text-left border rounded p-3 flex flex-col gap-1',
                  selected?.advisory_id === a.advisory_id ? 'border-[#C77DDB] bg-[#C77DDB]/[0.08]' : 'border-[#2B303B] hover:bg-[#1A1D24]')}>
                <span className="flex items-center gap-2">
                  <span className={clsx('inline-flex items-center rounded-full border px-2 h-5 font-mono-code text-[10.5px] font-bold', TIER_CLS[a.tier])}>{a.tier}</span>
                  <span className="font-mono-code text-[12.5px] text-[#3CB992]">{a.advisory_id}</span>
                  <span className="font-mono-code text-[12.5px] ml-auto tabular-nums">{a.score.toFixed(2)}</span>
                </span>
                <span className="text-[13px]">{a.sat_id} · {a.title}</span>
                <span className="text-[11.5px] text-[#A1A7B3]">{a.state} · {a.detected_utc.slice(11, 19)} UTC</span>
              </button>
            ))}
          </div>
        </Card>

        {selected ? (
          <div className="flex flex-col gap-4">
            <Card title={`${selected.advisory_id} · ${selected.sat_id}`}
              actions={
                selected.state === 'NEW' ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setAdvisoryState(selected.advisory_id, 'DISMISSED')}>Dismiss</Button>
                    <Button size="sm" onClick={() => setAdvisoryState(selected.advisory_id, 'CONFIRMED')}>Confirm</Button>
                  </div>
                ) : (
                  <span className="font-mono-code text-[10.5px] font-bold text-[#A1A7B3]">{selected.state}</span>
                )
              }>
              <p className="text-[13px] mb-3">{selected.detail}</p>

              {/* Evidence: expected band vs observed */}
              <svg viewBox="0 0 400 120" className="w-full h-[130px]" role="img" aria-label="Evidence chart with expected band">
                <rect x="0" y="34" width="400" height="44" fill="#4CAF81" opacity="0.09" />
                <line x1="0" y1="34" x2="400" y2="34" stroke="#4CAF81" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
                <line x1="0" y1="78" x2="400" y2="78" stroke="#4CAF81" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
                <polyline
                  fill="none" stroke="#C77DDB" strokeWidth="1.6"
                  points={Array.from({ length: 40 }, (_, i) => {
                    const drift = selected.advisory_id === 'AN-401' ? Math.max(0, i - 18) * 2.6 : Math.max(0, i - 26) * 1.2;
                    return `${i * 10},${56 + Math.sin(i * 0.6) * 4 + drift}`;
                  }).join(' ')}
                />
                <text x="4" y="14" fill="#A1A7B3" fontSize="10">expected band</text>
              </svg>

              <div className="flex items-center justify-between text-[12px] text-[#A1A7B3] border-t border-[#23272F] pt-2.5 mt-2">
                <span>Model <span className="font-mono-code text-[#F3F4F6]">{selected.model}</span></span>
                {live !== undefined && <span>Live {selected.contributors[0].param} <span className="font-mono-code text-[#F3F4F6] tabular-nums">{live}</span></span>}
                <button className="text-[#3CB992] hover:underline" onClick={() => onNavigate(`parameter?sat=${selected.sat_id}&param=${selected.contributors[0].param}`)}>
                  Open parameter history
                </button>
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card title="Top contributing parameters">
                {selected.contributors.map((c) => (
                  <div key={c.param} className="mb-2.5">
                    <div className="flex justify-between text-[12.5px] mb-1">
                      <span className="font-mono-code text-[#3CB992]">{c.param}</span>
                      <span className="tabular-nums text-[#A1A7B3]">{(c.contribution * 100).toFixed(0)} %</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#1A1D24]">
                      <div className="h-full rounded-full bg-[#C77DDB]" style={{ width: `${c.contribution * 100}%` }} />
                    </div>
                  </div>
                ))}
                {selected.linked_alarm_id && (
                  <Button size="sm" variant="secondary" className="mt-2" onClick={() => onNavigate('alarms')}>
                    Open linked alarm {selected.linked_alarm_id}
                  </Button>
                )}
              </Card>

              <Card title="Satellite × subsystem">
                <div className="overflow-x-auto">
                  <table className="border-collapse">
                    <thead>
                      <tr>
                        <th />
                        {SUBSYSTEMS.map((s) => (
                          <th key={s} className="px-1 pb-1 text-[10px] font-bold text-[#A1A7B3] uppercase">{s.slice(0, 3)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {FLEET.slice(0, 8).map((sat) => (
                        <tr key={sat.sat_id}>
                          <td className="pr-2 font-mono-code text-[11.5px] text-[#A1A7B3]">{sat.sat_id}</td>
                          {SUBSYSTEMS.map((sub) => {
                            const hit = advisories.find((a) => a.sat_id === sat.sat_id);
                            const hot = hit && sub === 'POWER' && hit.sat_id === selected.sat_id;
                            return (
                              <td key={sub} className="p-[2px]">
                                <span className={clsx('block w-full h-[22px] min-w-[26px] rounded-[3px] border',
                                  hot ? 'bg-[#C77DDB]/60 border-[#C77DDB]' : hit ? 'bg-[#E8943A]/30 border-[#E8943A]/50' : 'bg-[#4CAF81]/[0.22] border-[#4CAF81]/40')} />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </div>
        ) : (
          <Card><p className="text-[13px] text-[#A1A7B3]">No advisory selected.</p></Card>
        )}
      </div>
    </>
  );
};
