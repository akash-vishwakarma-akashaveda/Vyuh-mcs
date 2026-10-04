import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useFleetStore } from '../../store/useFleetStore';
import { useUIStore } from '../../store/useUIStore';
import { useAlarmStore } from '../../store/useAlarmStore';
import { useMissionStore } from '../../store/useMissionStore';
import { useAuthStore } from '../../store/useAuthStore';
import { can, canOpenRoute, whoCanOpen } from '../../auth/policy';
import { AlarmPanel } from '../../components/organisms/AlarmPanel';
import { adviceFor } from '../../components/organisms/AlarmDetail';
import { ContactTimeline } from '../../components/organisms/ContactTimeline';
import { ParamViews, Sub, SUBSYSTEMS } from '../../components/organisms/ParamViews';
import { PlaybackPanel } from '../../components/organisms/PlaybackPanel';
import { SatOpsPanel } from '../../components/organisms/SatOpsPanel';
import { MultiPlot } from '../../components/organisms/MultiPlot';
import { tileState } from '../../components/organisms/ParameterCard';
import { Pill } from '../../components/atoms/Badge';
import { Button } from '../../components/atoms/Button';
import { Banner, Card, PageHead, SampleTag, Segmented } from '../../components/molecules/Page';
import { PARAMETERS } from '../../data/fleet';
import { findDef, fmtNum, fmtUtc, history, recentSamples } from '../../ops/history';
import { openSatelliteWindow } from '../../ops/window';
import { ParameterDetail, rangeOf } from './ParameterDetail';
import { RoleLink } from './RoleLink';
import type { Param } from '../../types';
import { Select } from '../../components/molecules/Select';

type Mode = 'live' | 'history' | 'playback';
const HERO_RANGES = { '1 h': { pts: 240, step: 15 }, '6 h': { pts: 240, step: 90 }, '24 h': { pts: 288, step: 300 } } as const;
type HeroRange = keyof typeof HERO_RANGES;
const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** S04 · Satellite health — live values, history and playback for one satellite. Mode, tab and parameter live in the URL. */
export const SatelliteHealth: React.FC<{ satId: string; tab?: string; mode?: string; param?: string; popout?: boolean; onNavigate: (to: string) => void }> = ({
  satId, tab, mode: modeParam, param, popout, onNavigate,
}) => {
  const mode: Mode = modeParam === 'history' || modeParam === 'playback' ? modeParam : 'live';
  const sub: Sub | 'ALL' = SUBSYSTEMS.includes(tab as Sub) ? (tab as Sub) : 'ALL';
  // Read straight from the hash so the range survives a reload without a router change.
  const range = rangeOf(new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('range') ?? undefined);

  const go = (p: { sat?: string; mode?: Mode; tab?: string; param?: string; range?: string }) => {
    const q = new URLSearchParams();
    q.set('sat', p.sat ?? satId);
    const m = p.mode ?? mode;
    if (m !== 'live') q.set('mode', m);
    const t = p.tab ?? (sub === 'ALL' ? '' : sub);
    if (t && t !== 'ALL') q.set('tab', t);
    const pr = p.param ?? param;
    if (m === 'history' && pr) q.set('param', pr);
    if (m === 'history') q.set('range', p.range ?? range);
    if (popout) q.set('win', '1');
    onNavigate(`satellite?${q}`);
  };

  const satellites = useFleetStore((s) => s.satellites);
  const cvtAll = useFleetStore((s) => s.cvt);
  const cvt = useMemo(() => cvtAll[satId] ?? {}, [cvtAll, satId]);
  const windows = useFleetStore((s) => s.contactWindows);
  const alarms = useAlarmStore((s) => s.active).filter((a) => a.sat_id === satId && a.state !== 'RTN');
  const approvals = useMissionStore((s) => s.approvals).filter((a) => a.sat_id === satId && a.state === 'PENDING');
  const commands = useMissionStore((s) => s.commands);
  const heaterFault = useMissionStore((s) => s.heaterFault);
  const role = useAuthStore((s) => s.activeRole);
  const sat = satellites[satId];

  // Playback can never be mistaken for live: the whole console switches to PLAYBACK while this mode is open.
  const setConsoleMode = useUIStore((s) => s.setMode);
  const playback = mode === 'playback';
  useEffect(() => {
    if (!playback) return;
    setConsoleMode('PLAYBACK');
    return () => { if (useUIStore.getState().mode === 'PLAYBACK') setConsoleMode('LIVE'); };
  }, [playback, setConsoleMode]);

  // ---- hero: the worst parameter right now --------------------------------------------------------
  const hero = useMemo(() => {
    const all = Object.values(PARAMETERS).flat();
    const rank = (p?: Param) => (p ? (p.alarm_state === 2 ? 3 : p.alarm_state === 1 ? 2 : 0) : 0);
    return all.reduce((w, d) => (rank(cvt[d.param_id]) > rank(cvt[w.param_id]) ? d : w), all.find((d) => d.param_id === 'BAT_TEMP')!);
  }, [cvt]);
  const [heroRange, setHeroRange] = useState<HeroRange>('1 h');
  const heroLive = cvt[hero.param_id];
  const heroTs = useMemo(() => {
    const { pts, step } = HERO_RANGES[heroRange];
    const now = Math.floor(Date.now() / 1000);
    return Array.from({ length: pts }, (_, i) => now - (pts - 1 - i) * step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroRange, Math.floor(Date.now() / 30_000)]);
  const heroValues = useMemo(() => history(satId, hero, heroLive?.eu_value ?? hero.value, heroTs), [satId, hero, heroLive?.eu_value, heroTs]);
  const samples = recentSamples(satId, hero.param_id);
  const rate = samples.length > 2 && samples[samples.length - 1].t - samples[0].t >= 20_000
    ? (samples[samples.length - 1].v - samples[0].v) / ((samples[samples.length - 1].t - samples[0].t) / 60_000) : null;
  const heroMarkers = [
    ...alarms.filter((a) => a.param_id === hero.param_id).map((a) => ({ t: Date.parse(a.timestamp_utc) / 1000, color: a.alarm_state === 2 ? '#FF6B6B' : '#F5C451', label: `${a.alarm_state === 2 ? 'Critical' : 'Warning'} · ${fmtUtc(Date.parse(a.timestamp_utc))}` })),
    ...commands.filter((c) => c.sat_id === satId).map((c) => ({ t: Date.parse(c.utc) / 1000, color: '#F28C28', label: `${c.mnemonic} · ${fmtUtc(Date.parse(c.utc))}` })),
  ];
  const heroState = tileState(heroLive);
  const heroColor = heroState === 'crit' ? '#FF7A7A' : heroState === 'warn' ? '#F5C451' : heroState === 'ok' ? '#6CB8FF' : '#7C8594';

  // ---- not found -------------------------------------------------------------------------------------
  if (!sat) {
    const ids = Object.keys(satellites).sort();
    return (
      <>
        <PageHead title={satId} crumb={<RoleLink to="fleet" onNavigate={onNavigate} arrow={false}>← Fleet</RoleLink>} sub="Not in your fleet" />
        <Card title="Satellite not found">
          <p className="text-[13.5px] text-[#C9CED6] mb-3">No satellite called <span className="font-mono-code">{satId}</span> is in the fleet you can see. It may have been mistyped, decommissioned or belong to another tenant.</p>
          <div className="flex flex-wrap gap-2">
            {ids.slice(0, 16).map((id) => <Button key={id} size="sm" variant="secondary" onClick={() => go({ sat: id, mode: 'live', tab: 'ALL' })}><span className="font-mono-code">{id}</span></Button>)}
            {ids.length === 0 && <span className="text-[13px] text-[#7C8594]">The fleet has not loaded yet.</span>}
          </div>
        </Card>
      </>
    );
  }

  // ---- header facts ----------------------------------------------------------------------------------
  const now = Date.now();
  const mine = windows.filter((w) => w.sat_id === satId);
  const nextWin = mine.filter((w) => Date.parse(w.los_utc) > now).sort((a, b) => Date.parse(a.aos_utc) - Date.parse(b.aos_utc))[0];
  const inContact = Boolean(nextWin && Date.parse(nextWin.aos_utc) <= now);
  const crit = alarms.filter((a) => a.alarm_state === 2).length;
  const healthPill = crit ? <Pill tone="crit" glyph="critical">Critical · {alarms.length} alarm{alarms.length > 1 ? 's' : ''}</Pill>
    : alarms.length ? <Pill tone="warn" glyph="caution">Warning · {alarms.length} alarm{alarms.length > 1 ? 's' : ''}</Pill>
    : Object.keys(cvt).length === 0 ? <Pill tone="neutral" glyph="standby">No data</Pill>
    : <Pill tone="ok" glyph="normal">Nominal</Pill>;
  const contactPill = inContact
    ? <Pill tone="info">In contact · {nextWin.ground_station} · LOS {mmss(Date.parse(nextWin.los_utc) - now)}</Pill>
    : nextWin ? <Pill tone="neutral">Next contact · {nextWin.ground_station} {fmtUtc(Date.parse(nextWin.aos_utc))} UTC</Pill>
    : <Pill tone="neutral">No contact scheduled</Pill>;

  const procAllowed = can('procedure:run', role), cmdAllowed = can('command:send', role);
  const gate = (route: string, d: { allowed: boolean; reason?: string }) =>
    playback ? 'Commanding is off in playback.' : !canOpenRoute(route, role) ? `Handled by ${whoCanOpen(route)}.` : !d.allowed ? d.reason : undefined;
  const procReason = gate('procedure', procAllowed), cmdReason = gate('command', cmdAllowed);

  // ---- recovery card ---------------------------------------------------------------------------------
  const worstAlarm = [...alarms].sort((a, b) => b.alarm_state - a.alarm_state)[0];
  const advice = worstAlarm ? adviceFor(worstAlarm, heaterFault) : null;

  return (
    <>
      <PageHead
        crumb={<RoleLink to="fleet" onNavigate={onNavigate} arrow={false}>← Fleet</RoleLink>}
        title={satId}
        sub={<span className="flex flex-col gap-2">
          <span className="flex flex-wrap items-center gap-2"><span data-health={crit ? 'crit' : alarms.length ? 'warn' : Object.keys(cvt).length === 0 ? 'nodata' : 'ok'} data-alarms={alarms.length} className="contents">{healthPill}</span>{contactPill}</span>
          <span>{sat.name} · {sat.constellation_group} · {fmtNum(sat.altitude_km, 0)} km {sat.orbit_regime} · dictionary <span className="font-mono-code">{sat.mib_version}</span></span>
        </span>}
        actions={
          <>
            <Select value={satId} onChange={(e) => go({ sat: e.target.value })} aria-label="Satellite"
              className="h-10 bg-[#161A22] border border-[#232936] rounded-xl px-2.5 font-mono-code text-[13px] text-[#E9ECF1]">
              {Object.keys(satellites).sort().map((id) => <option key={id} value={id}>{id}</option>)}
            </Select>
            {!popout && <Button variant="ghost" onClick={() => openSatelliteWindow(satId, sub === 'ALL' ? undefined : sub)} aria-label="Open in a new window"><ExternalLink size={15} /> New window</Button>}
            <Button variant="secondary" onClick={() => onNavigate('procedure')} disabled={!!procReason} reason={procReason}>Run procedure</Button>
            <Button onClick={() => onNavigate(`command?sat=${satId}`)} disabled={!!cmdReason} reason={cmdReason}>Command {satId}</Button>
          </>
        }
      />

      <div className="mb-4">
        <Segmented value={mode} onChange={(m) => go({ mode: m, param: m === 'history' ? (param ?? hero.param_id) : undefined })}
          options={[{ value: 'live', label: 'Live' }, { value: 'history', label: 'History' }, { value: 'playback', label: 'Playback' }]} />
      </div>

      {mode === 'live' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-4">
            <section className="flex-[999_1_540px] min-w-0 bg-[#11141B] border border-[#1A1E27] rounded-2xl p-5 flex flex-col gap-3">
              <div className="flex flex-wrap justify-between gap-3">
                <span className="flex flex-col gap-1">
                  <span className="text-[13px] text-[#9AA3B2]">{hero.name} · <span className="font-mono-code">{hero.param_id}</span></span>
                  <span className="flex flex-wrap items-baseline gap-2.5">
                    <span className="text-[40px] font-semibold tracking-[-0.02em] tabular-nums" style={{ color: heroState === 'crit' ? '#FF7A7A' : heroState === 'warn' ? '#F5C451' : heroState === 'ok' ? '#E9ECF1' : '#7C8594' }}>
                      {heroLive ? fmtNum(heroLive.eu_value) : 'No data'}
                    </span>
                    {heroLive && <span className="text-[16px] text-[#7C8594]">{hero.unit}</span>}
                    {heroState === 'stale' && <Pill tone="neutral" glyph="off">Stale since {fmtUtc(Date.parse(heroLive!.timestamp_utc), true)}</Pill>}
                    {rate !== null && Math.abs(rate) > 0.0005 && <span className="text-[13px]" style={{ color: heroColor }}>{rate > 0 ? '↑' : '↓'} {fmtNum(Math.abs(rate))} {hero.unit}/min</span>}
                  </span>
                </span>
                <span className="flex items-start gap-2">
                  <Segmented size="sm" value={heroRange} onChange={setHeroRange} options={(Object.keys(HERO_RANGES) as HeroRange[]).map((r) => ({ value: r, label: r }))} />
                  <Button size="sm" variant="ghost" onClick={() => go({ mode: 'history', param: hero.param_id })}>History</Button>
                </span>
              </div>
              <MultiPlot timestamps={heroTs} height={220} syncKey={`hero-${satId}`} onReady={() => {}} onXRange={() => {}} markers={heroMarkers} compact
                series={[{ label: hero.param_id, color: heroColor, unit: hero.unit, values: heroValues, limits: { lowSoft: hero.warnLo, hiSoft: hero.warnHi, lowHard: hero.critLo, hiHard: hero.critHi } }]} />
              <span className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#7C8594]">
                <span>Limits {fmtNum(hero.critLo)} · {fmtNum(hero.warnLo)} · {fmtNum(hero.warnHi)} · {fmtNum(hero.critHi)} {hero.unit}. Alarms and commands are marked on the time axis.</span>
                <SampleTag>Reconstructed — archive not connected</SampleTag>
              </span>
            </section>

            <div className="flex-[1_1_320px] min-w-0 flex flex-col gap-4">
              <Card title={approvals.length ? 'Recovery in progress' : 'What to do'}
                actions={approvals.length ? <Pill tone="action">Waiting approval</Pill> : worstAlarm ? <Pill tone={worstAlarm.alarm_state === 2 ? 'crit' : 'warn'}>{worstAlarm.param_id}</Pill> : <Pill tone="ok">Nothing open</Pill>}>
                {approvals.length > 0 ? (
                  <div className="flex flex-col gap-2 text-[13px] leading-[1.45]">
                    {approvals.map((a) => (
                      <p key={a.approval_id}><span className="font-mono-code">{a.mnemonic}</span> {Object.entries(a.params).map(([k, v]) => `${k}=${v}`).join(' ')} requested by {a.requested_by}. <span className="text-[#9AA3B2]">Waits for a Flight Director who did not raise it; expires {fmtUtc(Date.parse(a.expires_utc))} UTC.</span></p>
                    ))}
                    <RoleLink to="approvals" onNavigate={onNavigate}>Open approvals</RoleLink>
                    <RoleLink to="procedure" onNavigate={onNavigate}>Open procedure runner</RoleLink>
                  </div>
                ) : advice ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-[13px] leading-[1.5] text-[#C9CED6]">{advice.text}</p>
                    {advice.links.map((l) => <RoleLink key={l.label} to={l.to} onNavigate={onNavigate}>{l.label}</RoleLink>)}
                  </div>
                ) : <p className="text-[13px] text-[#9AA3B2]">No alarm and no recovery waiting on {satId}.</p>}
              </Card>
              <Card title={`Alarms on ${satId}`}>
                <AlarmPanel satId={satId} onOpenParam={(p) => go({ mode: 'history', param: p })} />
              </Card>
            </div>
          </div>

          <ParamViews satId={satId} cvt={cvt} sub={sub} onSub={(s) => go({ tab: s })} onOpenParam={(p) => go({ mode: 'history', param: p })} />

          <ContactTimeline sat={sat} />
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            <SatOpsPanel satId={satId} />
          </div>
        </div>
      )}

      {mode === 'history' && (
        <ParameterDetail satId={satId} paramId={findDef(param ?? '') ? param! : 'BAT_TEMP'} range={range}
          onRange={(r) => go({ mode: 'history', range: r })} onNavigate={onNavigate} />
      )}

      {mode === 'playback' && (
        <>
          <Banner kind="warn" lead="Playback.">Values below are from the past. Commanding is off until you return to Live.</Banner>
          <PlaybackPanel sat={sat} cvt={cvt} sub={sub} onSub={(s) => go({ tab: s })} onOpenParam={(p) => go({ mode: 'history', param: p })} />
        </>
      )}
    </>
  );
};
