import React, { useState } from 'react';
import { clsx } from 'clsx';
import {
  Globe, Radio, LineChart, Bell, PlayCircle, Antenna, CalendarClock, RadioTower, FileBarChart,
  Terminal, ShieldCheck, ListChecks, Upload, FileCode, CalendarRange, Package, Database,
  Sparkles, TrendingUp, MessageSquare, FlaskConical, Building2, Users, ScrollText, Server, BellRing,
  ChevronLeft, ChevronRight, ChevronDown, LogIn, BadgeCheck, Home,
} from 'lucide-react';
import { FLOWS, SCREENS } from '../../data/screens';
import { canOpen } from '../../auth/policy';
import { useUIStore } from '../../store/useUIStore';
import { useAlarmStore } from '../../store/useAlarmStore';
import { useAuthStore } from '../../store/useAuthStore';

const ICONS: Record<string, React.ElementType> = {
  landing: Home, signin: LogIn, scope: BadgeCheck,
  fleet: Globe, satellite: Radio, parameter: LineChart, alarms: Bell, playback: PlayCircle,
  pass: Antenna, schedule: CalendarClock, stations: RadioTower, report: FileBarChart,
  command: Terminal, approvals: ShieldCheck, procedure: ListChecks, uplink: Upload, editor: FileCode,
  plan: CalendarRange, payload: Package, mdb: Database,
  anomalies: Sparkles, forecast: TrendingUp, copilot: MessageSquare,
  simulator: FlaskConical, customer: Building2,
  users: Users, audit: ScrollText, platform: Server, oncall: BellRing,
};

interface SidebarProps {
  currentRoute: string;
  onNavigate: (to: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentRoute, onNavigate }) => {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const unacked = useAlarmStore((s) => s.active.filter((a) => !a.acknowledged).length);
  const role = useAuthStore((s) => s.activeRole);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setClosed((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Public screens live outside the shell; the rest are filtered by what this role may open.
  const visible = SCREENS.filter((s) => s.flow !== 'public').filter((s) => canOpen(s, role));

  const counterFor = (route: string) =>
    route === 'alarms' && unacked > 0 ? { n: unacked, crit: true } : null;

  return (
    <aside
      className={clsx('flex flex-col bg-[#0C0D10] border-r border-[#23272F] z-30 select-none shrink-0', collapsed ? 'w-[64px]' : 'w-[248px]')}
      aria-label="Main navigation"
    >
      <div className={clsx('flex items-center h-14 border-b border-[#23272F]', collapsed ? 'justify-center' : 'justify-between px-4')}>
        {!collapsed && (
          <button onClick={() => onNavigate('fleet')} className="flex items-center gap-2.5 text-left">
            <span className="w-7 h-7 rounded-lg bg-[#0F6E56] flex items-center justify-center shrink-0" aria-hidden="true">
              <span className="w-2 h-2 rounded-full bg-white" />
            </span>
            <span className="text-[14px] font-semibold text-[#F3F4F6]">Vyuh <span className="text-[#8B92A0] font-normal">MCS</span></span>
          </button>
        )}
        <button onClick={toggleSidebar}
          className="w-8 h-8 flex items-center justify-center rounded-md text-[#8B92A0] hover:text-[#F3F4F6] hover:bg-[#1A1D24]"
          aria-label={collapsed ? 'Expand sidebar navigation' : 'Collapse sidebar navigation'}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2.5 flex flex-col gap-3" aria-label="Screens">
        {FLOWS.filter((f) => f.id !== 'public').map((flow, i) => {
          const items = visible.filter((s) => s.flow === flow.id);
          if (!items.length) return null;
          const open = collapsed || !closed.has(flow.id);
          return (
            <div key={flow.id} className={clsx('flex flex-col gap-0.5', collapsed && i > 0 && 'pt-2 border-t border-[#23272F]')}>
              {!collapsed && (
                <button onClick={() => toggle(flow.id)} aria-expanded={open}
                  className={clsx('h-7 px-2.5 mb-0.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.06em]',
                    items.some((x) => x.route === currentRoute)
                      ? 'text-[#3CB992]'
                      : 'text-[#8B92A0] hover:text-[#F3F4F6]')}>
                  {flow.label}
                  <ChevronDown size={13} className={open ? '' : '-rotate-90'} />
                </button>
              )}
              {open && items.map((s) => {
                const Icon = ICONS[s.route] ?? Globe;
                const active = currentRoute === s.route;
                const counter = counterFor(s.route);
                return (
                  <button
                    key={s.route}
                    onClick={() => onNavigate(s.route)}
                    aria-label={`${s.name} (${s.id})`}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? s.name : undefined}
                    className={clsx(
                      'relative h-9 flex items-center gap-3 rounded-lg text-[13px]',
                      collapsed ? 'justify-center' : 'px-2.5',
                      active ? 'bg-[#1A1D24] text-[#3CB992] font-semibold' : 'text-[#A1A7B3] hover:text-[#F3F4F6] hover:bg-[#1A1D24]'
                    )}
                  >
                    <Icon size={17} className={clsx('shrink-0', active && 'text-[#3CB992]')} aria-hidden="true" />
                    {!collapsed && <span className="truncate flex-1 text-left">{s.name}</span>}
                    {counter && (
                      <span className={clsx('text-[10.5px] font-bold px-1.5 rounded-full tabular-nums',
                        collapsed && 'absolute top-0.5 right-1',
                        counter.crit ? 'bg-[#C62828] text-white' : 'bg-[#E8943A] text-black')}>
                        {counter.n}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className={clsx('h-11 border-t border-[#23272F] flex items-center gap-2 text-[11.5px] text-[#8B92A0]', collapsed ? 'justify-center' : 'px-4')}>
        <span className="w-2 h-2 rounded-full bg-[#4CAF81] shrink-0" aria-hidden="true" />
        {!collapsed && <><span className="flex-1">All services nominal</span><span className="font-mono-code text-[10.5px]">v2.0</span></>}
      </div>
    </aside>
  );
};
