import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CalendarClock, FileText, History, ListChecks, RotateCcw, Send } from 'lucide-react';
import { COPILOT_SUGGESTIONS, COPILOT_SUGGESTIONS_CUSTOMER } from '../../data/fleet';
import { useAuthStore } from '../../store/useAuthStore';
import { answer, useCopilotStore } from './copilotEngine';

const KINDS = [
  { label: 'Procedure', icon: ListChecks },
  { label: 'Incident history', icon: History },
  { label: 'Schedule', icon: CalendarClock },
];
const CUSTOMER_KINDS = [
  { label: 'Schedule', icon: CalendarClock },
  { label: 'Status', icon: History },
  { label: 'Alarms', icon: ListChecks },
];

/**
 * Ops Copilot conversation (S22). Read-only by design: it retrieves and cites, it can never
 * send a command (BR-S22-01). Answers without a source are refused.
 */
export const CopilotChat: React.FC<{ onNavigate: (to: string) => void; compact?: boolean }> = ({ onNavigate, compact }) => {
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const owner = `${user.id}:${role}`;
  const store = useCopilotStore();
  const messages = store.owner === owner ? store.messages : [];
  const [input, setInput] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const customer = role === 'Customer User';
  const suggestions = customer ? COPILOT_SUGGESTIONS_CUSTOMER : COPILOT_SUGGESTIONS;
  const kinds = customer ? CUSTOMER_KINDS : KINDS;

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  const ask = (q: string) => {
    if (!q.trim()) return;
    store.set(owner, [...messages, { role: 'user', text: q.trim() }, answer(q.trim(), { user, role })]);
    setInput('');
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 min-h-0">
        {messages.length === 0 && (
          <>
            <div className="rounded-xl bg-[#161A22] p-4">
              <h3 className="text-[14px] font-medium">{customer ? 'Ask about your satellites' : 'Ask about your operations'}</h3>
              <p className="text-[12.5px] leading-[1.6] text-[#9AA3B2] mt-1">
                {customer
                  ? 'Answers come from your satellites\' current values, passes and alarms, with the source of each.'
                  : 'Answers come from current values, alarms, the contact schedule, advisories, the audit ledger and the procedure library, with the source of each.'}
                {' '}An assistant, not an authority: check the source before you act. It has no command permission.
              </p>
            </div>
            <span className="text-[12px] text-[#7C8594]">Suggested</span>
            {suggestions.map((s, i) => {
              const k = kinds[i % kinds.length];
              const Icon = k.icon;
              return (
                <button key={s} type="button" onClick={() => ask(s)} className="group text-left rounded-xl bg-[#161A22] hover:bg-[#1B2130] p-3 flex items-start gap-3">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[#6CB8FF]/12 text-[#8CC8FF]"><Icon size={16} /></span>
                  <span className="flex-1 min-w-0"><span className="block text-[12px] text-[#7C8594]">{k.label}</span><span className="block text-[13.5px] text-[#E9ECF1] leading-snug">{s}</span></span>
                  <ArrowUpRight size={16} className="text-[#6B7383] group-hover:text-[#E9ECF1] mt-0.5" />
                </button>
              );
            })}
          </>
        )}

        {messages.map((m, i) => (
          m.role === 'user' ? (
            <div key={i} className="self-end max-w-[88%] rounded-2xl rounded-br-md bg-[#232936] px-3.5 py-2.5 text-[13px] leading-[1.55]">{m.text}</div>
          ) : (
            <div key={i} className="flex flex-col gap-2">
              <div className="rounded-xl bg-[#161A22] p-3.5">
                <span className="text-[12px] text-[#7C8594]">{m.refused ? 'No source found' : 'Answer'}</span>
                <p className={`mt-1 text-[13.5px] leading-[1.6] whitespace-pre-line ${m.refused ? 'text-[#9AA3B2]' : 'text-[#E9ECF1]'}`}>{m.text}</p>
              </div>
              {m.citations?.map((c, j) => {
                const body = (
                  <>
                    <span className="w-7 h-7 rounded-lg bg-[#6CB8FF]/12 text-[#8CC8FF] flex items-center justify-center shrink-0"><FileText size={14} /></span>
                    <span className="flex-1 min-w-0"><span className="block text-[12px] text-[#7C8594]">Source{c.route ? '' : ' · screen not available to your role'}</span><span className="block font-mono-code text-[12px] text-[#E9ECF1] truncate">{c.doc} · {c.section}</span></span>
                  </>
                );
                return c.route ? (
                  <button key={j} type="button" onClick={() => onNavigate(c.route!)} className="group rounded-xl bg-[#161A22] hover:bg-[#1B2130] flex items-center gap-3 px-3 py-2 text-left">
                    {body}<ArrowUpRight size={15} className="text-[#6B7383] group-hover:text-[#F2A65A]" />
                  </button>
                ) : <div key={j} className="rounded-xl bg-[#161A22] flex items-center gap-3 px-3 py-2">{body}</div>;
              })}
            </div>
          )
        ))}
        <div ref={end} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="p-3 shrink-0">
        <div className="flex items-center gap-1 rounded-xl border border-[#232936] bg-[#161A22] pl-4 pr-1.5 h-12 focus-within:border-[#6CB8FF]">
          <input value={input} onChange={(e) => setInput(e.target.value)}
            placeholder={compact ? 'Ask a question…' : customer ? 'Ask about your satellites, passes or alarms…' : 'Ask about a satellite, alarm, pass or procedure…'} aria-label="Ask the copilot"
            className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-[#7C8594]" />
          {messages.length > 0 && (
            <button type="button" onClick={() => store.set(owner, [])} aria-label="Clear conversation" title="Clear conversation"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#7C8594] hover:text-[#E9ECF1] hover:bg-[#1B2130]"><RotateCcw size={15} /></button>
          )}
          <button type="submit" aria-label="Send" disabled={!input.trim()}
            className="w-9 h-9 rounded-[10px] bg-[#F28C28] hover:bg-[#F59A45] text-[#1A0E02] flex items-center justify-center disabled:bg-[#141821] disabled:text-[#6B7383]"><Send size={16} /></button>
        </div>
      </form>
    </div>
  );
};
