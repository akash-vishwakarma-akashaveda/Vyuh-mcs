import { useUnifiedAlarms } from '../../ops/opsAlarms';
import React from 'react';
import { Banner, Card, PageHead } from '../../components/molecules/Page';
import { CopilotChat } from '../../components/organisms/CopilotChat';
import { scopeOf } from '../../components/organisms/copilotEngine';
import { PROCEDURES } from '../../data/mission';
import { useAuthStore } from '../../store/useAuthStore';
import { useAlarmStore } from '../../store/useAlarmStore';
import { useFleetStore } from '../../store/useFleetStore';
import { useMissionStore } from '../../store/useMissionStore';

/** S22 · Ops Copilot: answers from the console's own records, with citations; it can never send a command. */
export const OpsCopilot: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const scope = new Set(scopeOf({ user, role }));
  const customer = role === 'Customer User';
  // Same list the fleet and alarm console count: health, conjunction, payload, command and ground alarms.
  const alarms = useUnifiedAlarms().filter((a) => scope.has(a.sat_id)).length;
  const windows = useFleetStore((s) => s.contactWindows.filter((w) => scope.has(w.sat_id) && Date.parse(w.los_utc) > Date.now()).length);
  const advisories = useMissionStore((s) => s.advisories.length);
  const ledger = useMissionStore((s) => s.audit.length);

  const sources: [string, number, string][] = [
    ['Satellites in scope (current values)', scope.size, 'live'],
    ['Open alarms', alarms, 'live'],
    ['Upcoming contact windows', windows, 'schedule'],
    ...(customer ? [] : [
      ['Anomaly advisories', advisories, 'model'] as [string, number, string],
      ['Procedures', PROCEDURES.length, 'library'] as [string, number, string],
      ['Audit ledger entries', ledger, 'ledger'] as [string, number, string],
    ]),
  ];

  return (
    <>
      <PageHead title="Ops Copilot" sub={customer ? 'Answers about your satellites, with the source of each' : 'Answers from the console\'s own records, with the source of each'} />
      <Banner kind="info" lead="An assistant, not an authority.">It retrieves and cites; it never decides, approves or commands. Check the cited source before acting.</Banner>
      <div className="flex flex-wrap gap-4">
        <Card flush className="flex-[999_1_560px] min-w-0 h-[620px] flex flex-col [&>div]:flex [&>div]:flex-col [&>div]:flex-1 [&>div]:min-h-0">
          <CopilotChat onNavigate={onNavigate} />
        </Card>
        <Card className="flex-[1_1_320px] min-w-0 self-start" title="What it reads">
          {sources.map(([name, count, kind]) => (
            <div key={name} className="flex items-center justify-between py-1.5 text-[13px]">
              <span>{name}<span className="block text-[12px] text-[#7C8594]">{kind}</span></span>
              <span className="font-mono-code text-[#C9CED6]">{count}</span>
            </div>
          ))}
          <p className="text-[12px] text-[#7C8594] mt-2">{customer ? 'Only your organisation\'s satellites. Operator procedures and the audit ledger are never used in your answers.' : 'Retrieval runs in the console over these records; nothing leaves the region.'}</p>
        </Card>
      </div>
    </>
  );
};
