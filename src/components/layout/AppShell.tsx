import React from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { page } from '../../lib/motion';
import { Sidebar } from '../organisms/Sidebar';
import { TopBar } from '../organisms/TopBar';
import { SpecOverlay } from '../organisms/SpecOverlay';
import { CopilotLauncher, CopilotPanel } from '../organisms/CopilotPanel';
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

const BANNER = {
  PLAYBACK: { cls: 'bg-[#FCE83A] text-[#1B1204]', text: 'Playback mode — not live data · commanding disabled' },
  SIMULATION: { cls: 'bg-[#8B7CF6] text-[#0B0718]', text: 'Simulation — simulated satellites only · commands never reach a live link' },
} as const;

export const AppShell: React.FC<AppShellProps> = ({ children, screen, onNavigate, compact }) => {
  useKeyboardShortcuts(onNavigate);
  const mode = useUIStore((s) => s.mode);
  const toggleGuide = useDemoStore((s) => s.toggle);
  const banner = mode === 'LIVE' ? null : BANNER[mode];

  return (
    <MotionConfig reducedMotion="always">
    <div className="app-canvas flex flex-col h-screen w-screen overflow-hidden text-[#E6EDF3] font-sans-body">
      {/* Mode banner — full width above the shell, cannot be dismissed (SRS §4.1) */}
      {banner && (
        <div className={`${banner.cls} px-4 py-1 text-[11px] font-mono-code font-bold uppercase tracking-[0.06em] text-center shrink-0`} role="status">
          {banner.text}
        </div>
      )}

      {banner && <div aria-hidden="true" className="fixed inset-0 z-[65] pointer-events-none border-[3px]" style={{ borderColor: mode === 'PLAYBACK' ? '#FCE83A' : '#8B7CF6' }} />}

      <div className="flex flex-1 overflow-hidden">
        {!compact && <Sidebar currentRoute={screen.route} onNavigate={onNavigate} />}

        <div className="flex flex-col flex-1 h-full overflow-hidden relative">
          <TopBar screen={screen} onNavigate={onNavigate} onToggleGuide={toggleGuide} />

          {/* Full-bleed content: the console fills the monitor it is shown on. */}
          <main className="flex-1 overflow-y-auto px-5 md:px-7 py-6">
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
      <CopilotLauncher />
    </div>
    </MotionConfig>
  );
};
