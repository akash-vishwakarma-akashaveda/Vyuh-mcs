import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '../../components/atoms/Button';
import { Banner, Card, PageHead, Td, Th } from '../../components/molecules/Page';
import { SCENARIOS, SIM_FLEET } from '../../data/fleet';
import { useUIStore } from '../../store/useUIStore';

const FAULTS = ['Heater A failure', 'Reaction wheel stuck', 'Link dropout', 'CLCW lockout'];

/** S23 · Simulator — the SIMULATION banner is permanent while this screen is open. */
export const Simulator: React.FC = () => {
  const setMode = useUIStore((s) => s.setMode);
  const [selected, setSelected] = useState(SCENARIOS[0]);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [verdicts, setVerdicts] = useState<Record<string, string>>(
    Object.fromEntries(SCENARIOS.map((s) => [s.id, s.verdict]))
  );

  // Mode is owned by this screen: violet banner in, LIVE out (BR-S23-01 visibility).
  useEffect(() => {
    setMode('SIMULATION');
    return () => setMode('LIVE');
  }, [setMode]);

  const stamp = (text: string) => setLog((l) => [`${new Date().toISOString().slice(11, 19)}  ${text}`, ...l].slice(0, 40));

  const run = () => {
    setRunning(true);
    stamp(`Scenario ${selected.id} started on ${SIM_FLEET.join(', ')}`);
    window.setTimeout(() => {
      setRunning(false);
      setVerdicts((v) => ({ ...v, [selected.id]: 'PASSED' }));
      stamp(`Scenario ${selected.id} verdict PASSED`);
    }, 2500);
  };

  return (
    <>
      <PageHead
        title="Simulator"
        sub="Scenarios against simulated satellites for verification and training"
        actions={
          <>
            <Button variant="secondary" onClick={() => { setLog([]); stamp('Workspace reset'); }}>Reset</Button>
            <Button onClick={run} isLoading={running}>Run scenario</Button>
          </>
        }
      />

      <Banner kind="advisory" lead="Policy.">
        OPA forbids routing simulated commands to live links. Commands from this workspace carry <span className="font-mono-code">env=sim</span> and the Link Gateway rejects them on any live station.
      </Banner>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        <div className="flex flex-col gap-4">
          <Card title="Scenario catalogue">
            <table className="w-full border-collapse">
              <thead><tr><Th>ID</Th><Th>Scenario</Th><Th>Duration</Th><Th>Verdict</Th></tr></thead>
              <tbody>
                {SCENARIOS.map((s) => (
                  <tr key={s.id} onClick={() => setSelected(s)}
                    className={clsx('cursor-pointer', selected.id === s.id ? 'bg-[#0F6E56]/[0.14]' : 'hover:bg-[#1A1D24]')}>
                    <Td className="font-mono-code text-[12.5px] text-[#3CB992]">{s.id}</Td>
                    <Td>{s.name}</Td>
                    <Td className="tabular-nums text-[#A1A7B3]">{Math.round(s.duration_s / 60)} min</Td>
                    <Td className={clsx(verdicts[s.id] === 'PASSED' ? 'text-[#4CAF81]' : verdicts[s.id] === 'FAILED' ? 'text-[#FF6B6B]' : 'text-[#A1A7B3]')}>
                      {verdicts[s.id] === 'NOT_RUN' ? 'Not run' : verdicts[s.id]}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title={selected.name}>
            <p className="text-[13px] text-[#A1A7B3] mb-3">{selected.description}</p>
            <div className="grid grid-cols-4 gap-2">
              {SIM_FLEET.map((s) => (
                <div key={s} className="border border-[#2B303B] rounded px-3 py-2 flex items-center gap-2">
                  <span className={clsx('w-2 h-2 rounded-full', running ? 'bg-[#8B7CF6]' : 'bg-[#4CAF81]')} />
                  <span className="font-mono-code text-[12.5px]">{s}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Fault injection">
            <div className="flex flex-col gap-2">
              {FAULTS.map((f) => (
                <Button key={f} variant="warning" size="sm" onClick={() => stamp(`Injected: ${f}`)}>{f}</Button>
              ))}
            </div>
          </Card>

          <Card title="Event log">
            <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
              {log.length === 0 && <span className="text-[12px] text-[#A1A7B3]">Nothing yet.</span>}
              {log.map((l, i) => <span key={i} className="font-mono-code text-[12px] text-[#A1A7B3]">{l}</span>)}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
};
