import React from 'react';
import { LogoMark } from '../atoms/Logo';
import { StatusGlyph } from '../atoms/Badge';
import { clsx } from 'clsx';
import {
  Globe, Radio, LineChart, Bell, PlayCircle, Antenna, CalendarClock, RadioTower, FileBarChart,
  Terminal, ShieldCheck, ListChecks, Upload, FileCode, CalendarRange, Package, Database,
  Sparkles, TrendingUp, MessageSquare, FlaskConical, Building2, Users, ScrollText, Server, BellRing,
  ChevronsLeft, ChevronsRight, LogIn, BadgeCheck, Home, Archive, Cpu, Orbit, Satellite, KeyRound,
} from 'lucide-react';
import { FLOWS, SCREENS } from '../../data/screens';
import { canOpen, canOpenRoute, homeOf } from '../../auth/policy';
import { useUIStore } from '../../store/useUIStore';
import { useUnifiedAlarms } from '../../ops/opsAlarms';
import { useAuthStore } from '../../store/useAuthStore';
import { useFleetStore } from '../../store/useFleetStore';
import { isWaiting, useMissionStore } from '../../store/useMissionStore';
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
  archive: Archive, services: Cpu, orbits: Orbit, network: Satellite, keys: KeyRound,
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
  const alarms = useUnifiedAlarms();
  const pendingApprovals = useMissionStore((s) => s.approvals.filter((a) => isWaiting(a)).length);
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
  // Unacknowledged alarms of every kind: the alarm console's "Unacknowledged" count.
  const unacked = alarms.filter((a) => a.state === 'UNACK' || a.state === 'ESCALATED');
  const unackedCrit = unacked.some((a) => a.severity === 2);

  const counterFor = (route: string): { n: number; tone: 'crit' | 'warn' | 'info' } | null => {
    if (route === 'alarms' && unacked.length) return { n: unacked.length, tone: unackedCrit ? 'crit' : 'warn' };
    if (route === 'approvals' && pendingApprovals) return { n: pendingApprovals, tone: 'info' };
    return null;
  };
  const TONE = { crit: 'bg-[rgba(255,107,107,0.16)] text-[#FF7A7A]', warn: 'bg-[rgba(245,196,81,0.16)] text-[#F5C451]', info: 'bg-[rgba(242,140,40,0.16)] text-[#F2A65A]' };

  const user = useAuthStore((s) => s.user);
  const home = homeOf(role);

  return (
    <aside
      className={clsx('flex flex-col bg-[#090B10] z-30 select-none shrink-0', collapsed ? 'w-[68px]' : 'w-[244px]')}
      aria-label="Main navigation"
    >
      <button onClick={() => onNavigate(home)} aria-label="Home"
        className={clsx('h-16 shrink-0 flex items-center gap-2.5', collapsed ? 'justify-center' : 'px-5')}>
        <span className="w-8 h-8 rounded-[9px] bg-[#F28C28] flex items-center justify-center shrink-0">
          <LogoMark size={18} color="#1A0E02" />
        </span>
        {!collapsed && <span className="flex flex-col items-start leading-tight"><span className="text-[15px] font-semibold text-[#E9ECF1]">Vyuh</span><span className="text-[12px] text-[#7C8594]">Mission control</span></span>}
      </button>

      {role !== 'Customer User' && (
        <button onClick={() => onNavigate(canOpenRoute('fleet', role) ? 'fleet' : home)} title="Fleet health"
          className={clsx('shrink-0 mx-3 mb-2 rounded-xl bg-[#11141B] hover:bg-[#141821] flex text-[12.5px] tabular-nums',
            collapsed ? 'flex-col items-center gap-1.5 py-2.5' : 'items-center gap-3.5 px-3.5 h-10')}>
          <span className="flex items-center gap-1.5 text-[#4ADE9A]"><StatusGlyph kind="normal" />{health.normal}</span>
          <span className={clsx('flex items-center gap-1.5', health.caution ? 'text-[#F5C451]' : 'text-[#6B7383]')}><StatusGlyph kind="caution" />{health.caution}</span>
          <span className={clsx('flex items-center gap-1.5', health.critical ? 'text-[#FF7A7A]' : 'text-[#6B7383]')}><StatusGlyph kind="critical" />{health.critical}</span>
          {!collapsed && <span className="ml-auto text-[12px] text-[#6B7383]">{sats.length} satellites</span>}
        </button>
      )}

      <nav className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col" aria-label="Screens">
        {FLOWS.filter((f) => f.id !== 'public').map((flow) => {
          const items = visible.filter((s) => s.flow === flow.id);
          if (!items.length) return null;
          // A hidden group still shows the screen you are on, so Hide always does something visible.
          const open = collapsed || !closed.has(flow.id);
          const shown = open ? items : items.filter((x) => x.route === currentRoute);
          return (
            <div key={flow.id} className="flex flex-col mt-3">
              {!collapsed && (
                <button onClick={() => toggle(flow.id)} aria-expanded={open}
                  className="group h-7 px-2.5 flex items-center gap-2 text-[12px] text-[#5E6676] hover:text-[#9AA3B2]">
                  <span>{flow.label}</span>
                  <span className="flex-1" />
                  <span className="text-[11px] opacity-0 group-hover:opacity-100">{open ? 'Hide' : `Show ${items.length}`}</span>
                </button>
              )}
              {shown.map((s) => {
                const Icon = ICONS[s.route] ?? Globe;
                const active = currentRoute === s.route;
                const counter = counterFor(s.route);
                return (
                  <button
                    key={s.route}
                    onClick={() => onNavigate(s.route)}
                    aria-label={s.name}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? s.name : undefined}
                    className={clsx(
                      'relative h-[38px] flex items-center gap-3 text-[13.5px] rounded-[10px]',
                      collapsed ? 'justify-center' : 'px-2.5',
                      active ? 'bg-[#171B24] text-white' : 'text-[#9AA3B2] hover:text-[#E9ECF1] hover:bg-[#11141B]'
                    )}
                  >
                    <Icon size={18} strokeWidth={1.7} className={clsx('shrink-0', active ? 'text-[#F28C28]' : 'text-[#6B7383]')} aria-hidden="true" />
                    {!collapsed && <span className="truncate flex-1 text-left">{s.name}</span>}
                    {counter && (
                      <span data-badge={s.route} className={clsx('min-w-[20px] h-[20px] px-1.5 flex items-center justify-center rounded-full text-[11.5px] font-semibold tabular-nums',
                        collapsed && 'absolute -top-0.5 right-1', TONE[counter.tone])}>
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

      <div className={clsx('shrink-0 m-3 mt-0 rounded-xl bg-[#11141B] flex items-center gap-2.5', collapsed ? 'flex-col py-2.5' : 'p-2.5')}>
        <span className="w-9 h-9 rounded-full bg-[#1E2430] flex items-center justify-center text-[12px] font-semibold text-[#E9ECF1] shrink-0" title={user.name}>
          {user.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
        </span>
        {!collapsed && (
          <span className="flex flex-col min-w-0 flex-1 leading-tight">
            <span className="text-[13px] font-medium text-[#E9ECF1] truncate">{user.name}</span>
            <span className="text-[12px] text-[#F2A65A] truncate">{role}</span>
          </span>
        )}
        <button onClick={toggleSidebar}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#7C8594] hover:text-[#E9ECF1] hover:bg-[#171B24] shrink-0"
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} title={link === 'live' ? 'Live ground segment' : 'Built-in simulation'}>
          {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
        </button>
      </div>
    </aside>
  );
};
