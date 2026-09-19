import React, { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Info, Compass, MessageSquare, Bell, ChevronDown, Home, Search, Check, Sun, Moon } from 'lucide-react';
import { PEOPLE, tenantOfPerson, useAuthStore } from '../../store/useAuthStore';
import { useUIStore } from '../../store/useUIStore';
import { useAlarmStore } from '../../store/useAlarmStore';
import { FLOWS, ScreenSpec } from '../../data/screens';
import { toggleTheme, useTheme } from '../../lib/theme';
import { LinkChip } from '../molecules/LinkChip';

const MODE_STYLE = {
  PLAYBACK: 'border-[#E8943A]/60 text-[#E8943A] bg-[#E8943A]/12',
  SIMULATION: 'border-[#8B7CF6]/60 text-[#8B7CF6] bg-[#8B7CF6]/12',
} as const;

const Clock: React.FC = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="hidden xl:block whitespace-nowrap font-mono-code text-[12px] tabular-nums text-[#A1A7B3]" aria-label="Coordinated Universal Time">
      {now.toISOString().slice(11, 19)} <span className="text-[#5E6572]">UTC</span>
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
  const alarms = useAlarmStore((s) => s.active);
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

  const unacked = alarms.filter((a) => !a.acknowledged);
  const hasCritical = unacked.some((a) => a.alarm_state === 2);
  const flow = FLOWS.find((f) => f.id === screen.flow)?.label ?? '';
  const iconBtn = 'w-8 h-8 flex items-center justify-center rounded-md text-[#A1A7B3] hover:text-[#F3F4F6] hover:bg-[#1A1D24]';

  return (
    <header className="h-14 bg-[#0C0D10] border-b border-[#23272F] px-5 flex items-center gap-4 shrink-0 z-20">
      <div className="flex flex-col leading-tight min-w-0 shrink-0 max-w-[200px]">
        <span className="text-[11px] text-[#8B92A0] truncate">{flow}</span>
        <span className="text-[14px] font-semibold text-[#F3F4F6] truncate">{screen.name}</span>
      </div>

      <button onClick={() => setCommandPaletteOpen(true)}
        className="flex-1 min-w-[160px] max-w-[460px] mx-auto h-9 flex items-center gap-2 rounded-lg border border-[#23272F] bg-[#14161B] hover:border-[#2E3440] px-3 text-[13px] text-[#8B92A0]"
        aria-label="Search screens and satellites">
        <Search size={15} />
        <span className="flex-1 text-left truncate whitespace-nowrap">Search screens, satellites…</span>
        <kbd className="hidden xl:block whitespace-nowrap font-mono-code text-[10.5px] text-[#8B92A0] border border-[#2B303B] rounded px-1.5 py-0.5">Ctrl K</kbd>
      </button>

      <div className="flex items-center gap-2 ml-auto shrink-0">
        {mode !== 'LIVE' && (
          <span className={clsx('h-6 flex items-center rounded-full border px-2.5 text-[11px] font-semibold', MODE_STYLE[mode])}>
            {mode === 'PLAYBACK' ? 'Playback' : 'Simulation'}
          </span>
        )}
        <LinkChip />
        <Clock />

        <button onClick={() => onNavigate('alarms')} className={clsx(iconBtn, 'relative')}
          aria-label={`${unacked.length} unacknowledged alarms`} title="Alarm console">
          <Bell size={17} />
          {unacked.length > 0 && (
            <span className={clsx('absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center tabular-nums',
              hasCritical ? 'bg-[#C62828] text-white' : 'bg-[#E8943A] text-black')}>
              {unacked.length}
            </span>
          )}
        </button>
        <button onClick={toggleCopilot} className={clsx(iconBtn, copilotOpen && 'text-[#C77DDB]')} aria-label="Ops Copilot" title="Ops Copilot">
          <MessageSquare size={17} />
        </button>
        <button onClick={toggleSpec} className={clsx(iconBtn, specOpen && 'text-[#3CB992]')} aria-label="Screen specification" title="Screen specification">
          <Info size={17} />
        </button>
        <button onClick={onToggleGuide} className={iconBtn} aria-label="Guided demo" title="Guided demo">
          <Compass size={17} />
        </button>
        <button onClick={toggleTheme} className={iconBtn} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button onClick={() => onNavigate('landing')} className={iconBtn} aria-label="Back to landing page" title="Landing page">
          <Home size={17} />
        </button>

        <div className="relative pl-3 border-l border-[#23272F]" ref={menuRef}>
          <button onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2.5" aria-haspopup="menu" aria-expanded={menuOpen}>
            <span className="w-8 h-8 rounded-full bg-[#22262F] text-[#3CB992] text-[11px] font-bold flex items-center justify-center">{initials(user.name)}</span>
            <span className="hidden md:flex flex-col text-left leading-tight">
              <span className="text-[12.5px] font-semibold text-[#F3F4F6] max-w-[140px] truncate">{user.name}</span>
              <span className="text-[11px] text-[#8B92A0] max-w-[140px] truncate">{activeRole}</span>
            </span>
            <ChevronDown size={14} className="text-[#8B92A0]" />
          </button>

          {menuOpen && (
            <div role="menu" className="absolute right-0 top-[46px] w-[300px] max-h-[70vh] overflow-y-auto bg-[#14161B] border border-[#2B303B] rounded-xl shadow-[0_16px_40px_rgba(0,0,0,.5)] py-2 z-40">
              <div className="px-3 pb-2 mb-1 border-b border-[#23272F]">
                <div className="text-[13px] font-semibold">{user.name}</div>
                <div className="text-[11.5px] text-[#8B92A0]">{user.email}</div>
                <div className="text-[11px] text-[#5E6572] mt-0.5">{tenantOfPerson(user)}</div>
              </div>

              <span className="block px-3 py-1 text-[11px] font-semibold text-[#8B92A0]">Active role</span>
              {user.roles.map((role) => (
                <button key={role} role="menuitem" onClick={() => { setRole(role); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#1A1D24] flex items-center justify-between">
                  <span className={role === activeRole ? 'text-[#3CB992]' : 'text-[#F3F4F6]'}>{role}</span>
                  {role === activeRole && <Check size={14} className="text-[#3CB992]" />}
                </button>
              ))}

              <div className="border-t border-[#23272F] mt-2 pt-2">
                <span className="block px-3 py-1 text-[11px] font-semibold text-[#8B92A0]">Switch account (demo)</span>
                {PEOPLE.filter((p) => p.id !== user.id).map((p) => (
                  <button key={p.id} role="menuitem" onClick={() => { signInAs(p.id); setMenuOpen(false); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#1A1D24] flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-[#22262F] text-[#A1A7B3] text-[10px] font-bold flex items-center justify-center shrink-0">{initials(p.name)}</span>
                    <span className="flex flex-col min-w-0">
                      <span className="text-[13px] text-[#F3F4F6] truncate">{p.name}</span>
                      <span className="text-[11px] text-[#8B92A0] truncate">{p.roles[0]}</span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="border-t border-[#23272F] mt-2 pt-1">
                <button role="menuitem" onClick={() => onNavigate('signin')} className="w-full text-left px-3 py-1.5 text-[13px] text-[#A1A7B3] hover:bg-[#1A1D24]">
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
