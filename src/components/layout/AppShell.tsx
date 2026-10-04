import React, { useEffect } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { page } from '../../lib/motion';
import { FlaskConical, History } from 'lucide-react';
import { Sidebar } from '../organisms/Sidebar';
import { TopBar } from '../organisms/TopBar';
import { SpecOverlay } from '../organisms/SpecOverlay';
import { CopilotPanel } from '../organisms/CopilotPanel';
import { GuidePanel } from '../organisms/GuidePanel';
import { ToastHost } from '../organisms/ToastHost';
import { CommandPalette } from '../organisms/CommandPalette';
import { useKeyboardShortcuts } from '../../hooks/useKeyboard';
import { useUIStore } from '../../store/useUIStore';
import { useDemoStore } from '../../store/useDemoStore';
import { ScreenSpec } from '../../data/screens';

interface AppShellProps {
  children: React.ReactNode;
  screen: ScreenSpec;
  onNavigate: (to: string) => void;
  /** A pop-out window: no sidebar, so the page gets the whole screen. */
  compact?: boolean;
}

// Slim rounded mode bar at the top of the page (the Simulator board's style), never a full-screen border.
const BANNER = {
  PLAYBACK: { cls: 'bg-[#F5C451]/[0.12] text-[#F5C451]', lead: 'Playback', text: 'not live data, commanding is off' },
  SIMULATION: { cls: 'bg-[#6CB8FF]/[0.12] text-[#8CC8FF]', lead: 'Simulation', text: 'simulated satellites only, commands never reach a live link' },
} as const;

/**
 * Spec overlay and Copilot share one right-hand drawer slot: opening one closes the
 * other, and Escape closes whichever is open (unless a dialog above it takes Escape).
 */
function useDrawerSlot() {
  useEffect(() => {
    const unsub = useUIStore.subscribe((s, p) => {
      if (s.specOpen && !p.specOpen && s.copilotOpen) useUIStore.setState({ copilotOpen: false });
      else if (s.copilotOpen && !p.copilotOpen && s.specOpen) useUIStore.setState({ specOpen: false });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[aria-modal="true"]')) return;
      const { specOpen, copilotOpen } = useUIStore.getState();
      if (specOpen || copilotOpen) useUIStore.setState({ specOpen: false, copilotOpen: false });
    };
    window.addEventListener('keydown', onKey);
    return () => { unsub(); window.removeEventListener('keydown', onKey); };
  }, []);
}

export const AppShell: React.FC<AppShellProps> = ({ children, screen, onNavigate, compact }) => {
  useKeyboardShortcuts(onNavigate);
  const mode = useUIStore((s) => s.mode);
  useDrawerSlot();
  const toggleGuide = () => { const d = useDemoStore.getState(); if (d.running) d.stop(); else d.start(onNavigate); };
  // The Simulator screen carries this bar itself (with the simulator's uptime), so the shell does not repeat it there.
  const banner = mode === 'LIVE' || (mode === 'SIMULATION' && screen.route === 'simulator') ? null : BANNER[mode];

  return (
    <MotionConfig reducedMotion="always">
    <div className="app-canvas flex flex-col h-screen w-screen overflow-hidden text-[#E9ECF1] font-sans-body">
      <div className="flex flex-1 overflow-hidden">
        {!compact && <Sidebar currentRoute={screen.route} onNavigate={onNavigate} />}

        <div className="flex flex-col flex-1 h-full overflow-hidden relative">
          <TopBar screen={screen} onNavigate={onNavigate} onToggleGuide={toggleGuide} />

          {/* Full-bleed content: the console fills the monitor it is shown on. */}
          <main className="flex-1 overflow-y-auto px-5 md:px-7 py-6">
            {/* Mode bar: cannot be dismissed while the mode is on (SRS §4.1). */}
            {banner && (
              <div role="status" className={`${banner.cls} flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-[13px] mb-4`}>
                {mode === 'PLAYBACK' ? <History size={16} aria-hidden="true" /> : <FlaskConical size={16} aria-hidden="true" />}
                <span><b className="font-semibold">{banner.lead}</b> · {banner.text}</span>
              </div>
            )}
            <AnimatePresence mode="wait">
              <motion.div key={screen.route} variants={page} initial="hidden" animate="show">
                {children}
              </motion.div>
            </AnimatePresence>
          </main>

          <SpecOverlay screen={screen} />
          <CopilotPanel onNavigate={onNavigate} />
          <GuidePanel onNavigate={onNavigate} />
        </div>
      </div>

      <CommandPalette onNavigate={onNavigate} />
      <ToastHost onNavigate={onNavigate} />
    </div>
    </MotionConfig>
  );
};
