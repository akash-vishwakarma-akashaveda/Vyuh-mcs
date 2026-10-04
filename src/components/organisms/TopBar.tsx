import React, { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Info, Compass, MessageSquare, Bell, ChevronDown, Home, Search, Check, Sun, Moon } from 'lucide-react';
import { PEOPLE, tenantOfPerson, useAuthStore } from '../../store/useAuthStore';
import { useUIStore } from '../../store/useUIStore';
import { useUnifiedAlarms } from '../../ops/opsAlarms';
import { resetDemo } from '../../demo/persist';
import { FLOWS, ScreenSpec } from '../../data/screens';
import { toggleTheme, useTheme } from '../../lib/theme';
import { LinkChip } from '../molecules/LinkChip';
import { canOpenRoute, homeOf } from '../../auth/policy';

const MODE_STYLE = {
  PLAYBACK: 'border-[#F5C451]/60 text-[#F5C451] bg-[#F5C451]/12',
  SIMULATION: 'border-[#9B8CFF]/60 text-[#9B8CFF] bg-[#9B8CFF]/12',
} as const;

const Clock: React.FC = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="hidden xl:block whitespace-nowrap font-mono-code text-[12px] tabular-nums text-[#9AA3B2]" aria-label="Coordinated Universal Time">
      <span className="text-[#6B7383]">{now.getUTCFullYear()}-{String(Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000)).padStart(3, '0')}</span>{' '}
      <span className="text-[#E9ECF1]">{now.toISOString().slice(11, 19)}</span> <span className="text-[#6B7383]">UTC</span>
    </span>
  );
};

const initials = (n: string) => n.split(' ').map((w) => w[0]).slice(0, 2).join('');

export const TopBar: React.FC<{ screen: ScreenSpec; onNavigate: (to: string) => void; onToggleGuide: () => void }> = ({
  screen, onNavigate, onToggleGuide,
}) => {
  const { mode, specOpen, copilotOpen, toggleSpec, toggleCopilot, setCommandPaletteOpen } = useUIStore();
  const user = useAuthStore((s) => s.user);
  const activeRole = useAuthStore((s) => s.activeRole);
  const setRole = useAuthStore((s) => s.setRole);
  const signInAs = useAuthStore((s) => s.signInAs);
  const alarms = useUnifiedAlarms();
  const theme = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Same count as the alarm console's "Unacknowledged" and the sidebar badge: every kind of alarm.
  const unacked = alarms.filter((a) => a.state === 'UNACK' || a.state === 'ESCALATED');
  const hasCritical = unacked.some((a) => a.severity === 2);
  const flow = FLOWS.find((f) => f.id === screen.flow)?.label ?? '';
  const iconBtn = 'w-8 h-8 flex items-center justify-center rounded-md text-[#9AA3B2] hover:text-[#E9ECF1] hover:bg-[#171B24]';

  return (
    <header className="h-16 bg-[#090B10] px-6 flex items-center gap-4 shrink-0 z-20">
      <div className="flex flex-col leading-tight min-w-0 shrink-0 max-w-[200px]">
        <span className="text-[11px] text-[#7C8594] truncate">{flow}</span>
        <span className="text-[14px] font-semibold text-[#E9ECF1] truncate">{screen.name}</span>
      </div>

      <button onClick={() => setCommandPaletteOpen(true)}
        className="flex-1 min-w-[160px] max-w-[420px] mx-auto h-10 flex items-center gap-2 rounded-xl bg-[#11141B] hover:bg-[#141821] px-3.5 text-[13px] text-[#6B7383]"
        aria-label="Search screens and satellites">
        <Search size={15} />
        <span className="flex-1 text-left truncate whitespace-nowrap">Search screens, satellites…</span>
        <kbd className="hidden xl:block whitespace-nowrap font-mono-code text-[11px] text-[#7C8594] bg-[#1A1E27] rounded-md px-1.5 py-0.5">Ctrl K</kbd>
      </button>

      <div className="flex items-center gap-2 ml-auto shrink-0">
        {mode !== 'LIVE' && (
          <span className={clsx('h-6 flex items-center rounded-full border px-2.5 text-[11px] font-semibold', MODE_STYLE[mode])}>
            {mode === 'PLAYBACK' ? 'Playback' : 'Simulation'}
          </span>
        )}
        <LinkChip />
        <Clock />

        {canOpenRoute('alarms', activeRole) && <button onClick={() => onNavigate('alarms')} className={clsx(iconBtn, 'relative')}
          aria-label={`${unacked.length} unacknowledged alarms`} title="Alarm console">
          <Bell size={17} />
          {unacked.length > 0 && (
            <span className={clsx('absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center tabular-nums',
              hasCritical ? 'bg-[#E5484D] text-white' : 'bg-[#F5C451] text-black')}>
              {unacked.length}
            </span>
          )}
        </button>}
        <button onClick={toggleCopilot} className={clsx(iconBtn, copilotOpen && 'text-[#C77DDB]')} aria-label="Ops Copilot" title="Ops Copilot">
          <MessageSquare size={17} />
        </button>
        {activeRole !== 'Customer User' && <button onClick={toggleSpec} className={clsx(iconBtn, specOpen && 'text-[#6CB8FF]')} aria-label="Screen specification" title="Screen specification">
          <Info size={17} />
        </button>}
        <button onClick={onToggleGuide} className={iconBtn} aria-label="Guided demo" title="Guided demo">
          <Compass size={17} />
        </button>
        <button onClick={toggleTheme} className={iconBtn} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button onClick={() => onNavigate(homeOf(activeRole))} className={iconBtn} aria-label="My home screen" title="My home screen">
          <Home size={17} />
        </button>

        <div className="relative pl-2" ref={menuRef}>
          <button onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2.5" aria-haspopup="menu" aria-expanded={menuOpen}>
            <span className="w-8 h-8 rounded-full bg-[#1A1E27] text-[#E9ECF1] text-[11px] font-semibold flex items-center justify-center">{initials(user.name)}</span>
            <span className="hidden md:flex flex-col text-left leading-tight">
              <span className="text-[12.5px] font-semibold text-[#E9ECF1] max-w-[140px] truncate">{user.name}</span>
              <span className="text-[11px] text-[#F2A65A] max-w-[140px] truncate">{activeRole}</span>
            </span>
            <ChevronDown size={14} className="text-[#7C8594]" />
          </button>

          {menuOpen && (
            <div role="menu" className="absolute right-0 top-[46px] w-[300px] max-h-[70vh] overflow-y-auto bg-[#11141B] border border-[#232936] rounded-xl shadow-[0_16px_40px_rgba(0,0,0,.5)] py-2 z-40">
              <div className="px-3 pb-2 mb-1 border-b border-[#1A1E27]">
                <div className="text-[13px] font-semibold">{user.name}</div>
                <div className="text-[11.5px] text-[#7C8594]">{user.email}</div>
                <div className="text-[11px] text-[#6B7383] mt-0.5">{tenantOfPerson(user)}</div>
              </div>

              <span className="block px-3 py-1 text-[11px] font-semibold text-[#7C8594]">Active role</span>
              {user.roles.map((role) => (
                <button key={role} role="menuitem" onClick={() => { setRole(role); setMenuOpen(false); if (!canOpenRoute(screen.route, role)) onNavigate(homeOf(role)); }}
                  className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#171B24] flex items-center justify-between">
                  <span className={role === activeRole ? 'text-[#6CB8FF]' : 'text-[#E9ECF1]'}>{role}</span>
                  {role === activeRole && <Check size={14} className="text-[#6CB8FF]" />}
                </button>
              ))}

              <div className="border-t border-[#1A1E27] mt-2 pt-2">
                <span className="block px-3 py-1 text-[11px] font-semibold text-[#7C8594]">Switch account (demo)</span>
                {PEOPLE.filter((p) => p.id !== user.id).map((p) => (
                  <button key={p.id} role="menuitem" onClick={() => { signInAs(p.id); setMenuOpen(false); onNavigate(homeOf(p.roles[0])); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#171B24] flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-[#1A1E27] text-[#9AA3B2] text-[10px] font-bold flex items-center justify-center shrink-0">{initials(p.name)}</span>
                    <span className="flex flex-col min-w-0">
                      <span className="text-[13px] text-[#E9ECF1] truncate">{p.name}</span>
                      <span className="text-[11px] text-[#7C8594] truncate">{p.roles[0]}</span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="border-t border-[#1A1E27] mt-2 pt-1">
                <button role="menuitem" title="Clears every change made in this tab and seeds the demo world again; you stay signed in"
                  onClick={() => { setMenuOpen(false); if (window.confirm('Reset the demo data? Every change made in this tab is cleared and the demo world is seeded again. You stay signed in.')) resetDemo(); }}
                  className="w-full text-left px-3 py-1.5 text-[13px] text-[#9AA3B2] hover:bg-[#171B24]">
                  Reset demo data
                </button>
                <button role="menuitem" onClick={() => { setMenuOpen(false); useAuthStore.getState().logout(); onNavigate('signin'); }} className="w-full text-left px-3 py-1.5 text-[13px] text-[#9AA3B2] hover:bg-[#171B24]">
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
