import React from 'react';
import { Card, PageHead } from '../../components/molecules/Page';
import { CopilotChat } from '../../components/organisms/CopilotChat';

const SOURCES = [
  { name: 'Procedures (PDL)', count: 48 },
  { name: 'Spacecraft manuals', count: 12 },
  { name: 'Pass reports', count: 1840 },
  { name: 'Anomaly records', count: 226 },
];

const DRAFTS = [
  { title: 'Pass report note — AKV-03 heater A', state: 'For review' },
  { title: 'Shift handover summary — 15:00 UTC', state: 'For review' },
];

/** S22 · Ops Copilot — answers cite sources; it can never send a command. */
export const OpsCopilot: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => (
  <>
    <PageHead title="Ops Copilot" sub="Answers from procedures, manuals and pass reports — with citations" />

    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
      <Card className="h-[620px] flex flex-col overflow-hidden">
        <CopilotChat onNavigate={onNavigate} />
      </Card>

      <div className="flex flex-col gap-4">
        <Card title="Sources indexed">
          {SOURCES.map((s) => (
            <div key={s.name} className="flex items-center justify-between py-1.5 text-[13px]">
              <span>{s.name}</span>
              <span className="tabular-nums text-[#A1A7B3]">{s.count}</span>
            </div>
          ))}
          <p className="text-[12px] text-[#A1A7B3] mt-2">In-region inference only (C-06).</p>
        </Card>

        <Card title="Drafts for review">
          {DRAFTS.map((d) => (
            <div key={d.title} className="flex items-start justify-between gap-2 py-1.5">
              <span className="text-[13px]">{d.title}</span>
              <span className="shrink-0 font-mono-code text-[10.5px] font-bold rounded-full border border-[#9C9AEC]/60 bg-[#9C9AEC]/12 text-[#9C9AEC] px-2 h-5 flex items-center">
                {d.state}
              </span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  </>
);
