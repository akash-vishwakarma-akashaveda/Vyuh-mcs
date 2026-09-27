import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CalendarClock, FileText, History, ListChecks, RotateCcw, Send } from 'lucide-react';
import { CopilotMessage } from '../../types';
import { COPILOT_ANSWERS, COPILOT_SUGGESTIONS } from '../../data/fleet';

const KINDS = [
  { label: 'Procedure', icon: ListChecks, tone: 'text-[#4DACFF] bg-[#4DACFF]/12' },
  { label: 'Incident history', icon: History, tone: 'text-[#C77DDB] bg-[#C77DDB]/12' },
  { label: 'Schedule', icon: CalendarClock, tone: 'text-[#2DCCFF] bg-[#2DCCFF]/12' },
];

const glassCard = 'rounded-xl border border-[#E6EDF3]/10 bg-[#E6EDF3]/[0.05]';

/**
 * Ops Copilot conversation (S22). Read-only by design: it can draft and cite,
 * it can never send a command (BR-S22-01). Answers without a source are refused.
 */
export const CopilotChat: React.FC<{ onNavigate: (to: string) => void; compact?: boolean }> = ({ onNavigate, compact }) => {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages, thinking]);

  const ask = (q: string) => {
    if (!q.trim() || thinking) return;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    setThinking(true);
    window.setTimeout(() => {
      const hit = /heater|htr|thermal|bat_temp/i.test(q) ? COPILOT_ANSWERS.heater : null;
      setMessages((m) => [
        ...m,
        hit
          ? { role: 'assistant', text: hit.text, citations: hit.citations }
          : { role: 'assistant', refused: true, text: 'No source in the indexed procedures, manuals or pass reports answers that. I do not answer without a citation.' },
      ]);
      setThinking(false);
    }, 700);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 min-h-0">
        {messages.length === 0 && (
          <>
            <div className={`${glassCard} p-4`}>
              <h3 className="text-[14px] font-semibold">Ask about your operations</h3>
              <p className="text-[12.5px] leading-[1.6] text-[#A3B1C2] mt-1">
                Searches the indexed procedures, manuals and pass reports. It can draft for review, but it has no command permission.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {['Procedures', 'Manuals', 'Pass reports'].map((s) => (
                  <span key={s} className="text-[11px] rounded-full border border-[#E6EDF3]/12 px-2.5 py-0.5 text-[#A3B1C2]">{s}</span>
                ))}
              </div>
            </div>

            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8496AB] -mb-1">Suggested</span>
            {COPILOT_SUGGESTIONS.map((s, i) => {
              const k = KINDS[i % KINDS.length];
              const Icon = k.icon;
              return (
                <button key={s} onClick={() => ask(s)}
                  className={`${glassCard} group text-left p-3.5 flex items-start gap-3 hover:bg-[#E6EDF3]/[0.09] hover:border-[#E6EDF3]/20`}>
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${k.tone}`}><Icon size={17} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[11px] text-[#8496AB]">{k.label}</span>
                    <span className="block text-[13.5px] text-[#E6EDF3] leading-snug">{s}</span>
                  </span>
                  <ArrowUpRight size={16} className="text-[#5F7087] group-hover:text-[#E6EDF3] mt-0.5" />
                </button>
              );
            })}
          </>
        )}

        {messages.map((m, i) => (
          m.role === 'user' ? (
            <div key={i} className="self-end max-w-[88%] rounded-2xl rounded-br-md bg-[#2E6FD8] text-white px-3.5 py-2.5 text-[13px] leading-[1.55]">{m.text}</div>
          ) : (
            <div key={i} className="flex flex-col gap-2">
              <div className={`${glassCard} p-3.5`}>
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8496AB]">{m.refused ? 'No source found' : 'Answer'}</span>
                <p className={`mt-1.5 text-[13.5px] leading-[1.65] whitespace-pre-line ${m.refused ? 'text-[#A3B1C2]' : 'text-[#E6EDF3]'}`}>{m.text}</p>
              </div>
              {m.citations?.map((c, j) => (
                <button key={j} onClick={() => c.route && onNavigate(c.route)}
                  className={`${glassCard} group flex items-center gap-3 px-3 py-2.5 text-left hover:border-[#4DACFF]/40`}>
                  <span className="w-8 h-8 rounded-lg bg-[#4DACFF]/12 text-[#4DACFF] flex items-center justify-center shrink-0"><FileText size={15} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[11px] text-[#8496AB]">Source</span>
                    <span className="block font-mono-code text-[11.5px] text-[#E6EDF3] truncate">{c.doc} · {c.section}</span>
                  </span>
                  <ArrowUpRight size={15} className="text-[#5F7087] group-hover:text-[#4DACFF]" />
                </button>
              ))}
            </div>
          )
        ))}

        {thinking && <div className={`${glassCard} self-start px-3.5 py-2.5 text-[12px] text-[#A3B1C2]`}>Searching indexed sources…</div>}
        <div ref={end} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="p-3 shrink-0">
        <div className="flex items-center gap-1 rounded-2xl border border-[#E6EDF3]/15 bg-[#0A1018]/50 backdrop-blur-md pl-4 pr-1.5 h-12 focus-within:border-[#4DACFF]/70">
          <input value={input} onChange={(e) => setInput(e.target.value)}
            placeholder={compact ? 'Ask a question…' : 'Ask about procedures, manuals or pass reports…'} aria-label="Ask the copilot"
            className="flex-1 bg-transparent text-[13.5px] outline-none focus:outline-none focus-visible:outline-none placeholder:text-[#8496AB]" style={{ outline: 'none', boxShadow: 'none' }} />
          {messages.length > 0 && (
            <button type="button" onClick={() => setMessages([])} aria-label="Clear conversation" title="Clear conversation"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#8496AB] hover:text-[#E6EDF3] hover:bg-[#E6EDF3]/10"><RotateCcw size={15} /></button>
          )}
          <button type="submit" aria-label="Send" disabled={!input.trim() || thinking}
            className="w-9 h-9 rounded-xl bg-[#B8570C] hover:bg-[#D9731A] text-white flex items-center justify-center disabled:opacity-35"><Send size={16} /></button>
        </div>
      </form>
    </div>
  );
};
