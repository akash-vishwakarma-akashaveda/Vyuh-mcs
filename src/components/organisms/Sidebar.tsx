import React from 'react';
import { Logo, LogoMark } from '../atoms/Logo';
import { StatusGlyph } from '../atoms/Badge';
import { clsx } from 'clsx';
import {
  Globe, Radio, LineChart, Bell, PlayCircle, Antenna, CalendarClock, RadioTower, FileBarChart,
  Terminal, ShieldCheck, ListChecks, Upload, FileCode, CalendarRange, Package, Database,
  Sparkles, TrendingUp, MessageSquare, FlaskConical, Building2, Users, ScrollText, Server, BellRing,
  ChevronsLeft, ChevronsRight, LogIn, BadgeCheck, Home,
} from 'lucide-react';
import { FLOWS, SCREENS } from '../../data/screens';
import { canOpen } from '../../auth/policy';
import { useUIStore } from '../../store/useUIStore';
import { useAlarmStore } from '../../store/useAlarmStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useFleetStore } from '../../store/useFleetStore';
import { useMissionStore } from '../../store/useMissionStore';
import { useLinkStore } from '../../store/useLinkStore';
import { usePersisted } from '../../lib/usePersisted';

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

/** Parameter history and pass playback now live inside Satellite health (as its History and Playback tabs). */
const MERGED = ['parameter', 'playback'];

interface SidebarProps {
  currentRoute: string;
  onNavigate: (to: string) => void;
}

/**
 * Navigation rail. Flat and square: the current screen is marked by a sky-blue edge, groups are
 * quiet labels, and the only colour is live state (fleet health, unacknowledged alarms, approvals).
 */
export const Sidebar: React.FC<SidebarProps> = ({ currentRoute, onNavigate }) => {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const alarms = useAlarmStore((s) => s.active);
  const pendingApprovals = useMissionStore((s) => s.approvals.filter((a) => a.state === 'PENDING').length);
  const satellites = useFleetStore((s) => s.satellites);
  const link = useLinkStore((s) => s.mode);
  const role = useAuthStore((s) => s.activeRole);
  const [closedList, setClosed] = usePersisted<string[]>('mcs.nav.closed', []);
  const closed = new Set(closedList);
  const toggle = (id: string) => setClosed(closed.has(id) ? closedList.filter((x) => x !== id) : [...closedList, id]);

  const visible = SCREENS.filter((s) => s.flow !== 'public' && !MERGED.includes(s.route)).filter((s) => canOpen(s, role));

  const sats = Object.values(satellites);
  const health = {
    normal: sats.filter((s) => s.health_state === 'NOMINAL').length,
    caution: sats.filter((s) => s.health_state === 'WARNING').length,
    critical: sats.filter((s) => s.health_state === 'CRITICAL').length,
  };
  const unacked = alarms.filter((a) => !a.acknowledged);
  const unackedCrit = unacked.some((a) => a.alarm_state === 2);

  const counterFor = (route: string): { n: number; tone: 'crit' | 'warn' | 'info' } | null => {
    if (route === 'alarms' && unacked.length) return { n: unacked.length, tone: unackedCrit ? 'crit' : 'warn' };
    if (route === 'approvals' && pendingApprovals) return { n: pendingApprovals, tone: 'info' };
    return null;
  };
  const TONE = { crit: 'bg-[#FF3838] text-[#1A0404]', warn: 'bg-[#FCE83A] text-[#1C1A02]', info: 'bg-[#2DCCFF] text-[#021A22]' };

  return (
    <aside
      className={clsx('flex flex-col bg-[#0A1018] border-r border-[#213044] z-30 select-none shrink-0', collapsed ? 'w-[56px]' : 'w-[232px]')}
      aria-label="Main navigation"
    >
      <button onClick={() => onNavigate('fleet')} aria-label="Fleet overview"
        className={clsx('h-14 shrink-0 flex items-center border-b border-[#213044]', collapsed ? 'justify-center' : 'px-4')}>
        {collapsed ? <LogoMark size={22} /> : <Logo />}
      </button>

      {/* Fleet at a glance: shape and count, the same symbols as everywhere else. */}
      <button onClick={() => onNavigate('fleet')} title="Fleet health"
        className={clsx('shrink-0 border-b border-[#213044] hover:bg-[#111A25] flex font-mono-code text-[12px] tabular-nums',
          collapsed ? 'flex-col items-center gap-1.5 py-2.5' : 'items-center gap-4 px-4 h-10')}>
        <span className="flex items-center gap-1.5 text-[#56F000]"><StatusGlyph kind="normal" />{health.normal}</span>
        <span className={clsx('flex items-center gap-1.5', health.caution ? 'text-[#FCE83A]' : 'text-[#5F7087]')}><StatusGlyph kind="caution" />{health.caution}</span>
        <span className={clsx('flex items-center gap-1.5', health.critical ? 'text-[#FF3838]' : 'text-[#5F7087]')}><StatusGlyph kind="critical" />{health.critical}</span>
        {!collapsed && <span className="ml-auto text-[10.5px] text-[#5F7087]">{sats.length} SAT</span>}
      </button>

      <nav className="flex-1 overflow-y-auto py-2 flex flex-col" aria-label="Screens">
        {FLOWS.filter((f) => f.id !== 'public').map((flow, i) => {
          const items = visible.filter((s) => s.flow === flow.id);
          if (!items.length) return null;
          const open = collapsed || !closed.has(flow.id) || items.some((x) => x.route === currentRoute);
          return (
            <div key={flow.id} className={clsx('flex flex-col', i > 0 && (collapsed ? 'mt-1.5 pt-1.5 border-t border-[#1A2738] mx-2' : 'mt-3'))}>
              {!collapsed && (
                <button onClick={() => toggle(flow.id)} aria-expanded={open}
                  className="group h-6 px-4 flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#5F7087] hover:text-[#A3B1C2]">
                  <span>{flow.label}</span>
                  <span className="flex-1 h-px bg-[#1A2738]" />
                  <span className="font-mono-code text-[10px] opacity-0 group-hover:opacity-100">{open ? '−' : `+${items.length}`}</span>
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
                      'relative h-8 flex items-center gap-2.5 text-[13px] border-l-2',
                      collapsed ? 'justify-center mx-0' : 'pl-[14px] pr-3',
                      active ? 'border-[#4DACFF] bg-[#2E6FD8]/15 text-[#E6EDF3] font-medium' : 'border-transparent text-[#A3B1C2] hover:text-[#E6EDF3] hover:bg-[#111A25]'
                    )}
                  >
                    <Icon size={16} strokeWidth={1.75} className={clsx('shrink-0', active ? 'text-[#4DACFF]' : 'text-[#8496AB]')} aria-hidden="true" />
                    {!collapsed && <span className="truncate flex-1 text-left">{s.name}</span>}
                    {counter && (
                      <span className={clsx('min-w-[18px] h-[16px] px-1 flex items-center justify-center rounded-[2px] font-mono-code text-[10.5px] font-medium tabular-nums',
                        collapsed && 'absolute top-0.5 right-1', TONE[counter.tone])}>
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

      <div className={clsx('shrink-0 border-t border-[#213044] flex items-center gap-2 h-10 text-[11.5px] text-[#8496AB]', collapsed ? 'flex-col justify-center h-auto py-2' : 'pl-4 pr-1.5')}>
        <span className={clsx('flex items-center gap-2 min-w-0', !collapsed && 'flex-1')} title={link === 'live' ? 'Live ground segment' : 'Built-in simulation'}>
          <StatusGlyph kind={link === 'live' ? 'normal' : 'standby'} className={link === 'live' ? 'text-[#56F000]' : 'text-[#2DCCFF]'} />
          {!collapsed && <span className="truncate">{link === 'live' ? 'Live link' : 'Simulation'} <span className="font-mono-code text-[10.5px] text-[#5F7087]">· v2.0</span></span>}
        </span>
        <button onClick={toggleSidebar}
          className="w-8 h-8 flex items-center justify-center rounded-[3px] text-[#8496AB] hover:text-[#E6EDF3] hover:bg-[#172434]"
          aria-label={collapsed ? 'Expand sidebar navigation' : 'Collapse sidebar navigation'} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
        </button>
      </div>
    </aside>
  );
};
