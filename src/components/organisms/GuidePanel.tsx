import React, { useEffect } from 'react';
import { ChevronLeft, ChevronUp, Compass, LayoutList, Minus, X } from 'lucide-react';
import { Button } from '../atoms/Button';
import { Pill } from '../atoms/Badge';
import { CHAPTER_START, DEMO_CHAPTERS, DEMO_STEPS, useDemoStore } from '../../store/useDemoStore';

const iconBtn = 'w-7 h-7 rounded-lg flex items-center justify-center text-[#7C8594] hover:text-[#E9ECF1] hover:bg-[#171B24]';

/**
 * Guided demo, a floating card fixed bottom left: over the lower sidebar, so it stays clear of page
 * actions (top right, card footers, drawer footers). With no chapter running it shows how VYUH works; in a chapter, Next runs the
 * step's action through the same store calls the screen's own buttons use, then moves on as the
 * next step's person. Escape collapses it.
 */
export const GuidePanel: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const { running, index, busy, collapsed, problem, stop, next, prev, startChapter, overview, setCollapsed } = useDemoStore();

  useEffect(() => {
    if (!running || collapsed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) setCollapsed(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, collapsed, setCollapsed]);

  if (!running) return null;
  const step = index >= 0 ? DEMO_STEPS[index] : undefined;
  const chapterSteps = step ? DEMO_STEPS.filter((s) => s.chapter === step.chapter) : [];
  const k = step ? chapterSteps.indexOf(step) : 0;

  if (collapsed) {
    return (
      <button type="button" onClick={() => setCollapsed(false)} aria-label="Expand guided demo"
        className="fixed bottom-4 left-4 z-[60] flex items-center gap-2 rounded-full bg-[#11141B] border border-[#232936] pl-3 pr-3.5 h-9 text-[12.5px] text-[#C9CED6] hover:border-[#2A303D]"
        style={{ boxShadow: 'var(--lift-3)' }}>
        <Compass size={15} className="text-[#F28C28]" />
        {step ? <>Chapter {step.chapter + 1} · step {k + 1} of {chapterSteps.length}</> : 'How VYUH works'}
        <ChevronUp size={14} />
      </button>
    );
  }

  return (
    <section aria-label="Guided demo" className="fixed bottom-4 left-4 w-[360px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-96px)] overflow-y-auto bg-[#11141B] border border-[#232936] rounded-2xl z-[60] p-4 flex flex-col gap-3"
      style={{ boxShadow: 'var(--lift-3)' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-[#7C8594]">Guided demo{step ? ` · as ${step.as.name}, ${step.as.role}` : ''}</span>
        <span className="flex gap-0.5">
          <button onClick={() => setCollapsed(true)} aria-label="Collapse guided demo" title="Collapse (Esc)" className={iconBtn}><Minus size={16} /></button>
          <button onClick={stop} aria-label="Close guided demo" className={iconBtn}><X size={16} /></button>
        </span>
      </div>

      {!step ? (
        <>
          <div className="flex flex-col gap-1">
            <h3 className="text-[15px] font-semibold">How VYUH works</h3>
            <p className="text-[13px] text-[#9AA3B2] leading-[1.5]">Four short chapters, each played by the people who do the work. Every chapter starts on its own; the screens are the real ones, running on the built-in simulator.</p>
          </div>
          <ol className="flex flex-col gap-2">
            {DEMO_CHAPTERS.map((c, i) => (
              <li key={c.title} className="bg-[#161A22] rounded-xl px-3.5 py-3 flex flex-col gap-1.5">
                <span className="flex items-center gap-2">
                  <Pill tone="neutral">{i + 1}</Pill>
                  <span className="text-[14px] font-medium mr-auto">{c.title}</span>
                  <Button size="sm" variant={i === 0 ? 'primary' : 'secondary'} onClick={() => startChapter(i, onNavigate)}>Start</Button>
                </span>
                <span className="text-[12.5px] text-[#9AA3B2] leading-[1.45]">{c.summary}</span>
                <span className="text-[12px] text-[#7C8594]">{c.who}</span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <button type="button" onClick={overview} aria-label="How VYUH works" title="How VYUH works" className={iconBtn}><LayoutList size={15} /></button>
            <select aria-label="Jump to a chapter" value={step.chapter} disabled={busy} onChange={(e) => startChapter(Number(e.target.value), onNavigate)}
              className="h-8 min-w-0 flex-1 rounded-[10px] bg-[#161A22] border border-[#232936] px-2.5 text-[13px] text-[#E9ECF1] outline-none focus:border-[#6CB8FF]">
              {DEMO_CHAPTERS.map((c, i) => <option key={c.title} value={i}>Chapter {i + 1}: {c.title.split(' ')[0]}</option>)}
            </select>
            <span className="text-[12px] text-[#7C8594] whitespace-nowrap">step {k + 1} of {chapterSteps.length}</span>
          </div>
          <div className="flex gap-1" aria-hidden="true">
            {chapterSteps.map((s) => <span key={s.n} className={`h-[3px] flex-1 rounded-full ${s.n <= step.n ? 'bg-[#F28C28]' : 'bg-[#232936]'}`} />)}
          </div>
          <h3 className="text-[15px] font-semibold">{step.title}</h3>
          <p className="text-[13px] text-[#9AA3B2] leading-[1.55]">{step.say}</p>
          {problem && <p role="alert" className="text-[12.5px] text-[#F5C451] leading-[1.45]">{problem}</p>}
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => prev(onNavigate)} disabled={index === CHAPTER_START[step.chapter] || busy} aria-label="Previous step"><ChevronLeft size={16} /></Button>
            <Button className="flex-1" onClick={() => next(onNavigate)} isLoading={busy}>{step.action}</Button>
          </div>
        </>
      )}
    </section>
  );
};
