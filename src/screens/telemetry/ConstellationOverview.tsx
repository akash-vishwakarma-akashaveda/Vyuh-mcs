import React, { Suspense, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { ArrowDown, ArrowUp, ExternalLink, Plus, Search } from 'lucide-react';
import { useFleetStore } from '../../store/useFleetStore';
import { alarmTrend, useAlarmStore } from '../../store/useAlarmStore';
import { isWaiting, useMissionStore } from '../../store/useMissionStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useLinkStore } from '../../store/useLinkStore';
import { Pill } from '../../components/atoms/Badge';
import { Button } from '../../components/atoms/Button';
import { DottedGlobe } from '../../components/organisms/DottedGlobe';
import { Heatmap } from '../../components/organisms/Heatmap';
import { ErrorBoundary } from '../../components/layout/ErrorBoundary';
import { AddSatelliteWizard } from '../../components/organisms/AddSatelliteWizard';
import { ColumnChooser } from '../../components/organisms/ColumnChooser';
import { Sparkline } from '../../components/molecules/Sparkline';
import { Card, PageHead, Segmented, Skeleton } from '../../components/molecules/Page';
import { STATIONS } from '../../data/fleet';
import { COLUMNS, COLUMN_BY_ID, ColCtx } from '../../ops/fleetColumns';
import { getSatOps } from '../../ops/satOps';
import { useConjunctionStore } from '../../ops/conjunctionStore';
import { useUnifiedAlarms, UAlarm } from '../../ops/opsAlarms';
import { openSatelliteWindow } from '../../ops/window';
import { fmtNum, fmtUtc } from '../../ops/history';
import { propagate } from '../../orbit/orbit';
import { satElements } from '../../orbit/fleetOrbit';
import { usePersisted } from '../../lib/usePersisted';
import { parseHash } from '../../router/routes';
import { can, canApprove } from '../../auth/policy';
import { RoleLink, useCanOpen } from './RoleLink';
import type { Satellite } from '../../types';

// The 3D engine is several MB: fetched only when the 3D view or 2D map is shown.
const CesiumGlobe = React.lazy(() => import('../../components/organisms/CesiumGlobe').then((m) => ({ default: m.CesiumGlobe })));

type View = 'globe' | 'map' | 'table';
type Quick = 'all' | 'attention' | 'contact';
const DEFAULT_COLS = ['sat', 'health', 'contact', 'p:BAT_SOC', 'p:BAT_TEMP', 'payload', 'conjunction'];
type SatState = 'crit' | 'warn' | 'ok' | 'nodata';

/** Where each kind of problem gets fixed, and how the link reads. */
const FIX: Record<UAlarm['category'], (a: UAlarm, heaterFault: boolean) => { to: string; label: string }> = {
  HEALTH: (a, hf) => (hf && (a.health?.param_id === 'BAT_TEMP' || a.health?.param_id === 'BAT_BAY_TEMP')
    ? { to: 'procedure', label: 'Open recovery procedure' }
    : { to: `satellite?sat=${a.sat_id}&tab=${a.group ?? 'POWER'}`, label: `Open ${a.sat_id}` }),
  CONJUNCTION: () => ({ to: 'orbits', label: 'Review conjunction' }),
  PAYLOAD: () => ({ to: 'payload', label: 'Open payload deliveries' }),
  COMMAND: (a) => ({ to: `uplink?sat=${a.sat_id}`, label: 'Open uplink' }),
  GROUND: () => ({ to: 'stations', label: 'Open ground stations' }),
  DATA: () => ({ to: 'platform', label: 'Open platform health' }),
};

/** S03 · Fleet — the whole constellation at a glance, as a bento dashboard. */
export const ConstellationOverview: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const { params } = parseHash();
  // URL values stay 'globe' / 'map' (old links keep working); '3d' / '2d' are accepted too.
  const view: View = params.view === 'map' || params.view === '2d' ? 'map' : params.view === 'table' ? 'table' : 'globe';
  const quick: Quick = params.show === 'attention' || params.show === 'contact' ? params.show : 'all';
  const setParams = (p: { view?: View; show?: Quick }) => {
    const q = new URLSearchParams({ view: p.view ?? view });
    const sh = p.show ?? quick; if (sh !== 'all') q.set('show', sh);
    onNavigate(`fleet?${q}`);
  };

  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'health', dir: 1 });
  const [colIds, setColIds] = usePersisted<string[]>('vyuh-fleet-columns-v2', DEFAULT_COLS);
  const [query, setQuery] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const cvt = useFleetStore((s) => s.cvt);
  const satellites = useFleetStore((s) => s.satellites);
  const contactWindows = useFleetStore((s) => s.contactWindows);
  const alarms = useAlarmStore((s) => s.active);
  const alarmHistory = useAlarmStore((s) => s.history);
  const conjunctions = useConjunctionStore((s) => s.conjunctions);
  const approvals = useMissionStore((s) => s.approvals).filter((a) => isWaiting(a));
  const me = useAuthStore((s) => s.user);
  const heaterFault = useMissionStore((s) => s.heaterFault);
  const role = useAuthStore((s) => s.activeRole);
  const link = useLinkStore();
  const unified = useUnifiedAlarms();
  const canOpen = useCanOpen();
  const mayAdd = can('platform:admin', role);

  const all = useMemo(() => Object.values(satellites).sort((a, b) => a.sat_id.localeCompare(b.sat_id)), [satellites]);
  const now = Date.now();

  // ---- per-satellite state: open alarms first, then whether any telemetry has arrived ----------------
  const stateOf = (s: Satellite): SatState => {
    const mine = alarms.filter((a) => a.sat_id === s.sat_id && a.state !== 'RTN');
    if (mine.some((a) => a.alarm_state === 2) || s.health_state === 'CRITICAL') return 'crit';
    if (mine.length || s.health_state === 'WARNING') return 'warn';
    if (!cvt[s.sat_id] || Object.keys(cvt[s.sat_id]).length === 0) return 'nodata';
    return 'ok';
  };
  const states = new Map(all.map((s) => [s.sat_id, stateOf(s)]));
  const n = (st: SatState) => all.filter((s) => states.get(s.sat_id) === st).length;
  const inContact = contactWindows.filter((w) => Date.parse(w.aos_utc) <= now && Date.parse(w.los_utc) > now);
  const contactIds = new Set(inContact.map((w) => w.sat_id));
  // Globe labels: satellites someone should look at (open alarm or in contact); the rest stay dots.
  const flagKey = all.filter((s) => { const st = states.get(s.sat_id); return st === 'crit' || st === 'warn'; }).map((s) => `${s.sat_id}:${states.get(s.sat_id)}`).join(',');
  const contactKey = inContact.map((w) => `${w.sat_id}@${w.ground_station}`).sort().join(',');
  const nodataKey = all.filter((s) => states.get(s.sat_id) === 'nodata').map((s) => s.sat_id).join(',');
  const nextContacts = contactWindows.filter((w) => Date.parse(w.aos_utc) > now).sort((a, b) => Date.parse(a.aos_utc) - Date.parse(b.aos_utc)).slice(0, 5);

  // ---- table rows --------------------------------------------------------------------------------------
  const q = query.trim().toUpperCase();
  const satList = all
    .filter((s) => quick === 'all' || (quick === 'attention' ? states.get(s.sat_id) === 'crit' || states.get(s.sat_id) === 'warn' : contactIds.has(s.sat_id)))
    .filter((s) => !q || s.sat_id.includes(q) || s.name.toUpperCase().includes(q) || s.constellation_group.toUpperCase().includes(q));
  const ctxFor = (sat: Satellite): ColCtx => ({
    sat, cvt: cvt[sat.sat_id], now,
    windows: contactWindows.filter((w) => w.sat_id === sat.sat_id && Date.parse(w.los_utc) > now).sort((x, y) => Date.parse(x.aos_utc) - Date.parse(y.aos_utc)),
    conj: conjunctions.filter((c) => c.satId === sat.sat_id),
    ops: getSatOps(sat.sat_id, now),
    alarms: alarms.filter((a) => a.sat_id === sat.sat_id && a.state !== 'RTN'),
    history: alarmHistory.filter((a) => a.sat_id === sat.sat_id),
  });
  const cols = colIds.map((id) => COLUMN_BY_ID.get(id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const sortCol = COLUMN_BY_ID.get(sort.key);
  const rows = satList.map((sat) => ({ sat, ctx: ctxFor(sat) })).sort((a, b) => {
    if (!sortCol?.sort) return 0;
    const x = sortCol.sort(a.ctx), y = sortCol.sort(b.ctx);
    const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return (Number.isNaN(d) ? 0 : d || a.sat.sat_id.localeCompare(b.sat.sat_id)) * sort.dir;
  });
  const sortBy = (key: string) => setSort((x) => ({ key, dir: x.key === key ? (x.dir === 1 ? -1 : 1) : 1 }));
  const open = (id: string) => { if (canOpen('satellite')) onNavigate(`satellite?sat=${id}`); };

  // ---- needs you now -----------------------------------------------------------------------------------
  const attention = [
    // Every approval still waiting, worded for who is looking: only a Flight Director who did not raise it can act.
    ...approvals.map((a) => {
      const mine = canApprove(role, a.requested_by, me.name).allowed;
      const level = mine ? 'Waiting on you' : role === 'Flight Director' && a.requested_by === me.name ? 'Waiting for another Flight Director' : 'Waiting for a Flight Director';
      return { key: a.approval_id, kind: 'approval', sat: a.sat_id, level, tone: (mine ? 'action' : 'info') as 'action' | 'info',
        text: `${a.mnemonic} ${Object.entries(a.params).map(([k, v]) => `${k}=${v}`).join(' ')} from ${a.requested_by === me.name ? 'you' : a.requested_by} needs a second person (expires ${fmtUtc(Date.parse(a.expires_utc))} UTC).`,
        to: mine ? `approvals?id=${a.approval_id}` : `command?sat=${a.sat_id}`, label: mine ? 'Review approval' : 'Open command console' };
    }),
    ...unified.filter((a) => a.state === 'UNACK' || a.state === 'ESCALATED').slice(0, 4).map((a) => {
      const fix = FIX[a.category](a, heaterFault);
      return { key: a.id, kind: 'alarm', sat: a.sat_id === '—' ? (a.ref ?? '') : a.sat_id, level: a.severity === 2 ? 'Critical' : 'Warning', tone: (a.severity === 2 ? 'crit' : 'warn') as 'crit' | 'warn', text: `${a.title}${a.value ? ` · ${a.value}` : ''}`, ...fix };
    }),
  ].slice(0, Math.max(4, approvals.length));

  // ---- KPIs --------------------------------------------------------------------------------------------
  // Any open alarm (health, conjunction, link...) labels the satellite on the 3D view and tints its orbit.
  const sevBySat = new Map<string, number>();
  unified.forEach((a) => { if (a.sat_id !== '—') sevBySat.set(a.sat_id, Math.max(sevBySat.get(a.sat_id) ?? 0, a.severity)); });
  const alarmedKey = [...sevBySat].sort().map(([id, sv]) => `${id}:${sv === 2 ? 'crit' : 'warn'}`).join(',');
  const openAlarms = unified.length, critAlarms = unified.filter((a) => a.severity === 2).length;
  const unackAlarms = unified.filter((a) => a.state === 'UNACK' || a.state === 'ESCALATED').length;
  const trend = [...alarmTrend.slice(-60).map((p) => p.n), alarms.length];
  const lat = link.mode === 'live' ? link.latency : null;
  const total = all.length || 1;

  // ---- globe fallback ------------------------------------------------------------------------------------
  const COLOR: Record<SatState, string> = { crit: '#FF6B6B', warn: '#F5C451', ok: '#C9D6E8', nodata: '#6B7383' }; // same palette as the 3D view
  const fallback = (
    <div className="flex justify-center py-4">
      <DottedGlobe size={520} label="Fleet positions now (simplified view: the 3D view could not start)"
        stations={STATIONS.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon }))}
        sats={satList.map((s) => { const p = propagate(satElements(s), now); return { id: s.sat_id, lat: p.lat, lon: p.lon, color: COLOR[states.get(s.sat_id) ?? 'ok'], label: states.get(s.sat_id) === 'crit' }; })}
        onSelect={open} />
    </div>
  );

  const table = (
    <Card title="Satellites" flush actions={
      <span className="flex flex-wrap items-center gap-1.5">
        {([['all', `All ${all.length}`], ['attention', `Needs attention ${n('crit') + n('warn')}`], ['contact', `In contact ${contactIds.size}`]] as const).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={quick === k} onClick={() => setParams({ show: k })}
            className={clsx('h-7 px-2.5 rounded-full text-[12px]', quick === k ? 'bg-[#232936] text-white' : 'text-[#9AA3B2] hover:text-[#E9ECF1]')}>{label}</button>
        ))}
        <ColumnChooser items={COLUMNS.map((c) => ({ id: c.id, label: c.label, group: c.group }))} selected={colIds}
          onChange={setColIds} onReset={() => setColIds(DEFAULT_COLS)} locked={['sat']} />
      </span>
    }>
      <div className="overflow-x-auto max-h-[620px] px-2 pb-2">
        <table className="w-full min-w-[720px] text-[13px] border-separate border-spacing-y-1">
          <thead className="sticky top-0 z-10 bg-[#11141B]">
            <tr className="text-left text-[12px] text-[#6B7383]">
              {cols.map((c) => (
                <th key={c.id} className="px-3 py-1 font-normal whitespace-nowrap">
                  {c.sort ? (
                    <button type="button" onClick={() => sortBy(c.id)} className="inline-flex items-center gap-1 hover:text-[#E9ECF1]">
                      {c.id === 'health' ? 'State' : c.label}{sort.key === c.id && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    </button>
                  ) : c.label}
                </th>
              ))}
              <th className="w-9"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ sat, ctx }) => {
              const st = states.get(sat.sat_id);
              return (
                <tr key={sat.sat_id} data-sat={sat.sat_id} data-state={st} onClick={() => open(sat.sat_id)} tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(sat.sat_id); } }}
                  className={clsx('group focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F28C28]', canOpen('satellite') && 'cursor-pointer')}
                  style={{ background: st === 'crit' ? 'rgba(255,107,107,0.06)' : '#141821' }}>
                  {cols.map((c, i) => (
                    <td key={c.id} className={clsx('px-3 py-2.5 whitespace-nowrap group-hover:bg-[#1B2130]/60', i === 0 && 'rounded-l-[10px]')}>
                      {c.id === 'p:BAT_SOC' ? (() => {
                        const p = ctx.cvt?.BAT_SOC;
                        return p ? <span className="flex items-center gap-2"><span className="w-16 h-1.5 rounded-full bg-[#1A1E27] block"><span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, p.eu_value))}%`, background: p.alarm_state ? '#F5C451' : '#4ADE9A' }} /></span><span className="font-mono-code text-[12px] text-[#9AA3B2]">{fmtNum(p.eu_value, 0)} %</span></span> : <span className="text-[#6B7383]">No data</span>;
                      })() : c.id === 'sat' ? <span className="font-mono-code font-medium">{sat.sat_id}</span> : c.cell(ctx)}
                    </td>
                  ))}
                  <td className="px-2 rounded-r-[10px] group-hover:bg-[#1B2130]/60">
                    {canOpen('satellite') && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); openSatelliteWindow(sat.sat_id); }} aria-label={`Open ${sat.sat_id} in a new window`}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#7C8594] hover:text-[#E9ECF1] hover:bg-[#1A1E27]"><ExternalLink size={14} /></button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={cols.length + 1} className="px-3 py-6 text-[#9AA3B2]">No satellites match.</td></tr>}
          </tbody>
        </table>
      </div>
      {!canOpen('satellite') && <p className="px-5 pb-4 text-[12px] text-[#7C8594]">Satellite pages are handled by Spacecraft Operator, Flight Engineer and Flight Director.</p>}
    </Card>
  );

  return (
    <>
      <PageHead
        title="Fleet"
        sub={`${all.length} satellites in your scope · ${new Date().toUTCString().slice(0, 16)}`}
        actions={
          <>
            <label className="flex items-center gap-2 h-10 w-[280px] max-w-full rounded-[10px] bg-[#11141B] px-3 text-[#6B7383]">
              <Search size={15} aria-hidden="true" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a satellite or plane" aria-label="Find a satellite"
                className="flex-1 min-w-0 bg-transparent text-[13px] text-[#E9ECF1] outline-none" />
            </label>
            <Button variant="secondary" onClick={() => setWizardOpen(true)} disabled={!mayAdd.allowed} reason={mayAdd.allowed ? undefined : 'Adding a satellite is for a Platform Administrator or Flight Director.'}>
              <Plus size={15} /> Add satellite
            </Button>
          </>
        }
      />

      <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <section className="bg-[#11141B] border border-[#1A1E27] rounded-2xl px-5 py-[18px] flex flex-col gap-3">
          <span className="text-[13px] text-[#9AA3B2]">Fleet health</span>
          <span className="flex items-baseline gap-2"><span className="text-[34px] font-semibold tracking-[-0.02em]">{n('ok')}</span><span className="text-[14px] text-[#7C8594]">of {all.length} nominal</span></span>
          <span className="flex gap-[3px] h-2" role="img" aria-label={`${n('ok')} nominal, ${n('warn')} warning, ${n('crit')} critical, ${n('nodata')} no data`}>
            {(['ok', 'warn', 'crit', 'nodata'] as const).map((k) => n(k) > 0 && <span key={k} className="block rounded" style={{ flex: n(k) / total, background: COLOR[k] }} />)}
          </span>
          <span className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-[#9AA3B2]">
            <span>● {n('ok')} nominal</span><span className="text-[#F5C451]">▲ {n('warn')} warning</span><span className="text-[#FF7A7A]">■ {n('crit')} critical</span>{n('nodata') > 0 && <span>○ {n('nodata')} no data</span>}
          </span>
        </section>
        <section className="bg-[#11141B] border border-[#1A1E27] rounded-2xl px-5 py-[18px] flex flex-col gap-3">
          <span className="text-[13px] text-[#9AA3B2]">In contact now</span>
          <span className="flex items-baseline gap-2"><span className="text-[34px] font-semibold tracking-[-0.02em]">{inContact.length}</span><span className="text-[14px] text-[#7C8594]">passes running</span></span>
          <span className="flex flex-wrap gap-1.5">
            {inContact.slice(0, 6).map((w) => <Pill key={w.window_id} tone="info">{w.sat_id} · {w.ground_station}</Pill>)}
            {inContact.length === 0 && <span className="text-[12px] text-[#7C8594]">{nextContacts[0] ? `Next: ${nextContacts[0].sat_id} at ${fmtUtc(Date.parse(nextContacts[0].aos_utc))} UTC` : 'No contact scheduled'}</span>}
          </span>
        </section>
        <section className="bg-[#11141B] border border-[#1A1E27] rounded-2xl px-5 py-[18px] flex flex-col gap-2">
          <span className="text-[13px] text-[#9AA3B2]">Open alarms, all kinds</span>
          <span className="flex items-baseline gap-2"><span data-kpi="open-alarms" className="text-[34px] font-semibold tracking-[-0.02em]">{openAlarms}</span><span className={clsx('text-[14px]', critAlarms ? 'text-[#FF7A7A]' : 'text-[#7C8594]')}>{critAlarms} critical</span></span>
          <span className="text-[12px] text-[#9AA3B2]"><span data-kpi="unack-alarms">{unackAlarms}</span> unacknowledged</span>
          <Sparkline data={trend} color="#FF6B6B" height={36} label="Open health alarms over this session" />
          <span className="text-[12px] text-[#7C8594]">trend: health alarms this session</span>
        </section>
        <section className="bg-[#11141B] border border-[#1A1E27] rounded-2xl px-5 py-[18px] flex flex-col gap-3">
          <span className="text-[13px] text-[#9AA3B2]">Antenna to screen · p99</span>
          {lat ? (
            <>
              <span className="flex items-baseline gap-2"><span className={clsx('text-[34px] font-semibold tracking-[-0.02em]', lat.p99 > 100 && 'text-[#F5C451]')}>{fmtNum(lat.p99, 0)}</span><span className="text-[14px] text-[#7C8594]">ms of 100 budget</span></span>
              <span className="block h-2 rounded bg-[#1A1E27]"><span className="block h-full rounded" style={{ width: `${Math.min(100, lat.p99)}%`, background: lat.p99 > 100 ? '#F5C451' : '#6CB8FF' }} /></span>
              <span className="text-[12px] text-[#7C8594]">p50 {fmtNum(lat.p50, 0)} ms · {lat.samples} samples</span>
            </>
          ) : (
            <>
              <span className="flex items-baseline gap-2"><span className="text-[34px] font-semibold tracking-[-0.02em] text-[#7C8594]">—</span><span className="text-[14px] text-[#7C8594]">{link.mode === 'live' ? 'waiting for frames' : 'no live link'}</span></span>
              <span className="block h-2 rounded bg-[#1A1E27]" />
              <span className="text-[12px] text-[#7C8594]">{link.mode === 'live' ? 'Measured once telemetry arrives.' : 'Built-in simulation is driving the console; there is no link latency to measure.'}</span>
            </>
          )}
        </section>
      </div>

      <div className="flex flex-wrap gap-4 mb-4">
        <div className="flex-[999_1_560px] min-w-0 flex flex-col gap-3">
          <Segmented value={view} onChange={(v) => setParams({ view: v })} className="self-start"
            options={[{ value: 'globe', label: '3D view' }, { value: 'map', label: '2D map' }, { value: 'table', label: 'Table' }]} />
          {view === 'table' ? table : (
            <section className="bg-[#0D1016] border border-[#1A1E27] rounded-2xl overflow-hidden relative h-[600px]">
              <ErrorBoundary label="3D view" fallback={fallback}>
                <Suspense fallback={<Skeleton className="absolute inset-0" />}>
                  <CesiumGlobe satellites={satList} onSelectSat={open} viewMode={view === 'globe' ? '3D' : '2D'} alarmed={alarmedKey} flags={flagKey} contacts={contactKey} nodata={nodataKey} />
                </Suspense>
              </ErrorBoundary>
            </section>
          )}
        </div>

        <div className="flex-[1_1_320px] min-w-0 flex flex-col gap-4">
          <Card title="Needs you now" actions={<RoleLink to="alarms" onNavigate={onNavigate} arrow={false}>All alarms</RoleLink>}>
            <div className="flex flex-col gap-2">
              {attention.map((a) => (
                <div key={a.key} data-attention={a.kind} data-id={a.key} className="rounded-xl bg-[#161A22] px-3.5 py-3 flex flex-col gap-1.5">
                  <span className="flex justify-between items-center gap-2"><span className="font-mono-code text-[13px]">{a.sat}</span><Pill tone={a.tone}>{a.level}</Pill></span>
                  <span className="text-[13px] text-[#C9CED6] leading-[1.4]">{a.text}</span>
                  <RoleLink to={a.to} onNavigate={onNavigate}>{a.label}</RoleLink>
                </div>
              ))}
              {attention.length === 0 && <p className="text-[13px] text-[#9AA3B2]">Nothing is waiting on you.</p>}
            </div>
          </Card>
          <Card title="Next contacts" actions={<RoleLink to="schedule" onNavigate={onNavigate} arrow={false}>Schedule</RoleLink>}>
            <div className="flex flex-col gap-2.5">
              {nextContacts.map((w) => (
                <div key={w.window_id} className="grid items-center gap-2.5 text-[12px]" style={{ gridTemplateColumns: '72px 1fr 52px' }}>
                  <span className="font-mono-code text-[12.5px]">{w.sat_id}</span>
                  <span className="flex flex-col gap-1">
                    <span className="text-[#9AA3B2]">{STATIONS.find((s) => s.id === w.ground_station)?.name ?? w.ground_station} · max {fmtNum(w.max_elevation_deg, 0)}°</span>
                    <span className="block h-1 rounded bg-[#1A1E27]"><span className="block h-1 rounded bg-[#6CB8FF]" style={{ width: `${Math.min(100, (w.max_elevation_deg / 90) * 100)}%` }} /></span>
                  </span>
                  <span className="font-mono-code text-[#C9CED6] text-right">{fmtUtc(Date.parse(w.aos_utc))}</span>
                </div>
              ))}
              {nextContacts.length === 0 && <span className="text-[13px] text-[#9AA3B2]">Nothing scheduled.</span>}
            </div>
          </Card>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        {view !== 'table' && <div className="flex-[999_1_560px] min-w-0">{table}</div>}
        <div className={clsx('min-w-0', view === 'table' ? 'flex-[1_1_100%]' : 'flex-[1_1_320px]')}>
          <Card title="Subsystem health" actions={<span className="text-[12px] text-[#7C8594]">worst state now</span>}>
            <Heatmap satellites={satList} cvt={cvt} onSelectSat={canOpen('satellite') ? (id, sub) => onNavigate(`satellite?sat=${id}&tab=${sub}`) : undefined} />
            <p className="flex flex-wrap gap-3 text-[12px] text-[#9AA3B2] mt-3">
              <span className="text-[#4ADE9A]">● nominal</span><span className="text-[#F5C451]">▲ warning</span><span className="text-[#FF7A7A]">■ critical</span><span>◆ stale</span><span>○ no data</span>
            </p>
          </Card>
        </div>
      </div>

      {wizardOpen && mayAdd.allowed && <AddSatelliteWizard onClose={() => setWizardOpen(false)} onNavigate={onNavigate} />}
    </>
  );
};
