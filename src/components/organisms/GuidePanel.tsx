import React from 'react';
import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { DEMO_STEPS, runCurrentStep, useDemoStore } from '../../store/useDemoStore';

/** Guided demo panel — overlay fill, 1 px teal border, 380 wide, bottom-left (SRS §7.5). */
export const GuidePanel: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const { running, index, stop, next, prev } = useDemoStore();
  if (!running) return null;

  const step = DEMO_STEPS[index];

  return (
    <div className="absolute bottom-5 left-5 w-[380px] max-w-[calc(100%-40px)] bg-[#1F2D40] border border-[#2E6FD8] rounded-lg shadow-[0_16px_40px_rgba(0,0,0,.5)] z-40 p-4 flex flex-col gap-3">
      <div className="flex gap-1" aria-hidden="true">
        {DEMO_STEPS.map((s) => (
          <span key={s.n} className={clsx('h-[3px] flex-1 rounded-full', s.n <= step.n ? 'bg-[#4DACFF]' : 'bg-[#2A3B52]')} />
        ))}
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#A3B1C2]">
            Guided demo · step {step.n} of {DEMO_STEPS.length} · {step.screen}
          </span>
          <h3 className="text-[15px] font-bold">{step.title}</h3>
        </div>
        <button onClick={stop} aria-label="Close guided demo" className="text-[#A3B1C2] hover:text-[#E6EDF3]">
          <X size={16} />
        </button>
      </div>

      <p className="text-[13px] text-[#A3B1C2] leading-[1.5]">{step.say}</p>

      <div className="flex items-center gap-2">
        <button onClick={prev} disabled={index === 0} aria-label="Previous step"
          className="h-8 px-2 rounded border border-[#2A3B52] text-[#A3B1C2] disabled:opacity-40 hover:bg-[#172434]">
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={() => runCurrentStep(onNavigate)}
          className="flex-1 h-9 rounded bg-[#B8570C] hover:bg-[#D9731A] active:bg-[#9A480A] text-white text-[13px] font-bold px-3.5"
        >
          {step.action}
        </button>
        <button onClick={next} disabled={index === DEMO_STEPS.length - 1} aria-label="Next step"
          className="h-8 px-2 rounded border border-[#2A3B52] text-[#A3B1C2] disabled:opacity-40 hover:bg-[#172434]">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};
