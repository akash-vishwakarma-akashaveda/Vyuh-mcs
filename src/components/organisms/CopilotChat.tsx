import React, { useState } from 'react';
import { Send, FileText, ShieldOff } from 'lucide-react';
import { CopilotMessage } from '../../types';
import { COPILOT_ANSWERS, COPILOT_SUGGESTIONS } from '../../data/fleet';

/**
 * Ops Copilot conversation (S22). Read-only by design: it can draft and cite,
 * it can never send a command (BR-S22-01). Answers without a source are refused.
 */
export const CopilotChat: React.FC<{ onNavigate: (to: string) => void; compact?: boolean }> = ({ onNavigate, compact }) => {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);

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
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-[#C77DDB] bg-[#C77DDB]/10 border border-[#C77DDB]/40 rounded m-3 mb-0">
        <ShieldOff size={16} className="shrink-0" />
        <span><strong className="font-bold">Read-only by design.</strong> The copilot has no command permission; it drafts for human review.</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#A1A7B3]">Suggested questions</span>
            {COPILOT_SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => ask(s)} className="text-left text-[13px] text-[#F3F4F6] border border-[#2B303B] hover:bg-[#1A1D24] rounded px-3 py-2">
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'self-end max-w-[85%]' : 'max-w-[95%]'}>
            <div className={`rounded-md px-3 py-2 text-[13px] whitespace-pre-line ${
              m.role === 'user' ? 'bg-[#2B3140] text-[#F3F4F6]' : m.refused ? 'bg-[#1A1D24] text-[#A1A7B3] border border-[#2B303B]' : 'bg-[#1A1D24] text-[#F3F4F6] border border-[#C77DDB]/30'
            }`}>
              {m.text}
            </div>
            {m.citations && (
              <div className="flex flex-col gap-1 mt-1.5">
                {m.citations.map((c, j) => (
                  <button key={j} onClick={() => c.route && onNavigate(c.route)}
                    className="flex items-start gap-1.5 text-left text-[12px] text-[#3CB992] hover:underline">
                    <FileText size={13} className="mt-0.5 shrink-0" />
                    <span className="font-mono-code text-[11.5px]">{c.doc} · {c.section}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {thinking && <span className="text-[12px] text-[#A1A7B3]">Thinking…</span>}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); ask(input); }}
        className="flex gap-2 p-3 border-t border-[#2B303B] shrink-0"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={compact ? 'Ask the copilot…' : 'Ask about procedures, manuals or pass reports…'}
          aria-label="Ask the copilot"
          className="flex-1 h-9 bg-[#0C0D10] border border-[#2B303B] focus:border-[#4A9EFF] rounded-[2px] px-2.5 text-[14px] outline-none"
        />
        <button type="submit" aria-label="Send" className="h-9 px-3 rounded bg-[#0F6E56] hover:bg-[#3CB992] text-white">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
};
