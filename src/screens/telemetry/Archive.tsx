import React, { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Download, Play, Trash2, X } from 'lucide-react';
import { Banner, Card, Drawer, KpiRow, KpiTile, PageHead, SampleTag, Segmented } from '../../components/molecules/Page';
import { Button } from '../../components/atoms/Button';
import { Pill } from '../../components/atoms/Badge';
import { MultiPlot } from '../../components/organisms/MultiPlot';
import { useArchiveStore, ArchiveQuery, Report, downloadCsv } from '../../store/useArchiveStore';
import { useFleetStore } from '../../store/useFleetStore';
import { useAlarmStore } from '../../store/useAlarmStore';
import { useMissionStore } from '../../store/useMissionStore';
import { useAuthStore } from '../../store/useAuthStore';
import { PARAMETERS, STATIONS } from '../../data/fleet';
import { findDef, fmtNum, fmtUtc, history, rollupLabel } from '../../ops/history';
import { getSatOps } from '../../ops/satOps';
import { passes } from '../../orbit/orbit';
import { satElements } from '../../orbit/fleetOrbit';
import { isStale } from '../../utils/stalenessUtils';
import { RoleLink } from './RoleLink';
import { Select } from '../../components/molecules/Select';
import { DateInput } from '../../components/molecules/DateInput';

const PALETTE = ['#6CB8FF', '#9B8CFF', '#3DD9C1', '#F472B6', '#84CC16', '#E879F9'];
const MAX_POINTS = 360;
const selectCls = 'h-9 bg-[#11141B] border border-[#232936] rounded-lg px-2 font-mono-code text-[12.5px] outline-none focus:border-[#6CB8FF]';
/** datetime-local value <-> epoch ms, read as UTC. */
const toInput = (ms: number) => new Date(ms).toISOString().slice(0, 16);
const fromInput = (v: string) => Date.parse(`${v}:00Z`);

interface EventRow { t: number; sat: string; kind: 'Alarm' | 'Command' | 'On-board event'; text: string; detail: string; source: 'console' | 'sample' }

/** S29 · Archive and reports — retrieve, compare and export telemetry, events and commands; produce reports. */
export const Archive: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const { query, ran, saved, reports, setQuery, run, saveQuery, deleteQuery, addReport, deleteReport } = useArchiveStore();
  const satellites = useFleetStore((s) => s.satellites);
  const cvt = useFleetStore((s) => s.cvt);
  const active = useAlarmStore((s) => s.active);
  const closed = useAlarmStore((s) => s.history);
  const commands = useMissionStore((s) => s.commands);
  const appendAudit = useMissionStore((s) => s.appendAudit);
  const user = useAuthStore((s) => s.user);
  const ids = Object.keys(satellites).sort();
  const [addSat, setAddSat] = useState('');
  const [addParam, setAddParam] = useState('');
  const [saveName, setSaveName] = useState('');
  const [tab, setTab] = useState<'telemetry' | 'events'>('telemetry');
  const [viewing, setViewing] = useState<Report | null>(null);
  const [reportSat, setReportSat] = useState('AKV-03');

  const audit = (what: string, detail: string, sat = query.sats[0] ?? '—') => appendAudit({
    timestamp_utc: new Date().toISOString(), operator_id: user.id, operator_name: user.name, sat_id: sat,
    command_mnemonic: what, procedure_id: '—', procedure_version: '—', sequence_count: 0, result: 'ACK', params_summary: detail,
  });

  const invalid = !query.sats.length ? 'Pick at least one satellite.' : !query.params.length && !query.alarms && !query.commands && !query.events ? 'Pick a parameter or an event type.'
    : query.preset === 'Custom' && !(query.to > query.from) ? 'The end must be after the start.' : undefined;

  // ---- results (computed from the query that was run) -------------------------------------------------
  const q = ran?.query;
  const series = useMemo(() => {
    if (!q) return null;
    const step = Math.max(1, Math.ceil((q.to - q.from) / 1000 / MAX_POINTS));
    const ts: number[] = [];
    for (let t = Math.floor(q.from / 1000); t <= q.to / 1000; t += step) ts.push(t);
    const anchor = Math.floor(Date.now() / 1000);
    const lines = q.sats.flatMap((sat) => q.params.map((p) => {
      const def = findDef(p)!.def;
      return { sat, param: p, def, values: history(sat, def, cvt[sat]?.[p]?.eu_value ?? def.value, ts, anchor) };
    })).slice(0, 12);
    return { ts, step, lines };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ran]);

  const events = useMemo<EventRow[]>(() => {
    if (!q) return [];
    const inside = (t: number) => t >= q.from && t <= q.to;
    const out: EventRow[] = [];
    if (q.alarms) for (const a of [...active, ...closed]) {
      const t = Date.parse(a.timestamp_utc);
      if (q.sats.includes(a.sat_id) && inside(t)) out.push({ t, sat: a.sat_id, kind: 'Alarm', text: a.condition ?? `${a.param_id} ${a.alarm_state === 2 ? 'critical' : 'warning'}`, detail: `${fmtNum(a.eu_value)} ${a.unit} · ${a.state === 'RTN' ? 'returned to normal' : (a.state ?? 'UNACK').toLowerCase()}${a.owner ? ` · ${a.owner}` : ''}`, source: 'console' });
    }
    if (q.commands) for (const c of commands) {
      const t = Date.parse(c.utc);
      if (q.sats.includes(c.sat_id) && inside(t)) out.push({ t, sat: c.sat_id, kind: 'Command', text: `${c.mnemonic} ${Object.entries(c.params).map(([k, v]) => `${k}=${v}`).join(' ')}`, detail: `${c.status.toLowerCase()} · requested by ${c.requested_by}${c.approved_by ? ` · approved by ${c.approved_by}` : ''}`, source: 'console' });
    }
    if (q.events) for (const sat of q.sats) for (const e of getSatOps(sat, Date.now()).events) {
      if (inside(e.at) && e.at <= Date.now()) out.push({ t: e.at, sat, kind: 'On-board event', text: e.label, detail: `${e.state.toLowerCase()}${e.detail ? ` · ${e.detail}` : ''}`, source: 'sample' });
    }
    return out.sort((a, b) => b.t - a.t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ran, active, closed, commands]);

  const exportTelemetry = () => {
    if (!series || !q) return;
    const cols = ['utc', ...series.lines.map((l) => `${l.sat}:${l.param}${l.def.unit ? ` (${l.def.unit})` : ''}`)];
    const rows = series.ts.map((t, i) => [new Date(t * 1000).toISOString(), ...series.lines.map((l) => l.values[i])]);
    downloadCsv(`archive-telemetry-${new Date(q.from).toISOString().slice(0, 16)}.csv`, cols, rows, 'reconstructed values: archive not connected');
    audit('ARCHIVE_EXPORT', `telemetry ${q.sats.join('/')} ${q.params.join('/')} ${new Date(q.from).toISOString()}..${new Date(q.to).toISOString()} rows=${rows.length}`);
  };
  const exportEvents = () => {
    if (!q) return;
    downloadCsv(`archive-events-${new Date(q.from).toISOString().slice(0, 16)}.csv`, ['utc', 'satellite', 'kind', 'what', 'detail', 'source'],
      events.map((e) => [new Date(e.t).toISOString(), e.sat, e.kind, e.text, e.detail, e.source]));
    audit('ARCHIVE_EXPORT', `events ${q.sats.join('/')} rows=${events.length}`);
  };

  // ---- reports ------------------------------------------------------------------------------------------
  const passReport = () => {
    const sat = satellites[reportSat];
    if (!sat) return;
    const now = Date.now(), el = satElements(sat);
    const last = sat.assigned_ground_stations.flatMap((sid) => {
      const st = STATIONS.find((s) => s.id === sid);
      return st ? passes(el, st, now - 24 * 3600_000, 24 * 3600_000, 10, 30_000).filter((p) => p.los < now).map((p) => ({ ...p, station: sid })) : [];
    }).sort((a, b) => b.los - a.los)[0];
    if (!last) {
      addReport({ id: `R-${Date.now()}`, kind: 'pass', title: `Pass report · ${reportSat}`, note: 'No pass in the last 24 hours.', generatedAt: now, generatedBy: user.name, columns: ['Item', 'Value'], rows: [], reconstructed: false });
      return;
    }
    const during = (t: number) => t >= last.aos && t <= last.los;
    const al = [...active, ...closed].filter((a) => a.sat_id === reportSat && during(Date.parse(a.timestamp_utc)));
    const cm = commands.filter((c) => c.sat_id === reportSat && during(Date.parse(c.utc)));
    const ts = Array.from({ length: 60 }, (_, i) => Math.floor((last.aos + (i / 59) * (last.los - last.aos)) / 1000));
    const stats = ['BAT_TEMP', 'BAT_SOC', 'BUS_VOLTAGE', 'SNR'].map((p) => {
      const def = findDef(p)!.def;
      const v = history(reportSat, def, cvt[reportSat]?.[p]?.eu_value ?? def.value, ts, Math.floor(now / 1000));
      return [`${p} min / max / mean`, `${fmtNum(Math.min(...v))} / ${fmtNum(Math.max(...v))} / ${fmtNum(v.reduce((a, b) => a + b, 0) / v.length)} ${def.unit}`];
    });
    addReport({
      id: `R-${Date.now()}`, kind: 'pass', title: `Pass report · ${reportSat} over ${last.station} ${fmtUtc(last.aos)}`, generatedAt: now, generatedBy: user.name, reconstructed: true,
      note: 'Contact times come from the orbit model; alarms and commands from this console; telemetry statistics are reconstructed until the archive is connected.',
      columns: ['Item', 'Value'],
      rows: [
        ['Satellite', reportSat], ['Station', `${last.station} · ${STATIONS.find((s) => s.id === last.station)?.name ?? ''}`],
        ['AOS (UTC)', new Date(last.aos).toISOString().slice(0, 19).replace('T', ' ')], ['LOS (UTC)', new Date(last.los).toISOString().slice(0, 19).replace('T', ' ')],
        ['Duration', `${Math.round((last.los - last.aos) / 60000)} min`], ['Max elevation', `${fmtNum(last.maxElevationDeg, 0)}°`],
        ['Alarms raised during pass', al.length ? al.map((a) => `${a.param_id} ${a.alarm_state === 2 ? 'critical' : 'warning'}`).join(', ') : 'none'],
        ['Commands during pass', cm.length ? cm.map((c) => `${c.mnemonic} (${c.status.toLowerCase()})`).join(', ') : 'none'],
        ...stats,
      ],
    });
    audit('REPORT_GENERATE', `pass report ${reportSat} ${last.station}`, reportSat);
  };

  const availabilityReport = () => {
    const now = Date.now();
    const rows = ids.map((sid) => {
      const sat = satellites[sid], el = satElements(sat);
      const ps = sat.assigned_ground_stations.flatMap((st) => { const g = STATIONS.find((s) => s.id === st); return g ? passes(el, g, now - 24 * 3600_000, 24 * 3600_000, 10, 120_000) : []; });
      const params = Object.values(cvt[sid] ?? {});
      const fresh = params.length ? Math.round((params.filter((p) => !isStale(p)).length / params.length) * 100) : 0;
      const al = [...active, ...closed].filter((a) => a.sat_id === sid);
      const cm = commands.filter((c) => c.sat_id === sid);
      return [sid, sat.health_state.charAt(0) + sat.health_state.slice(1).toLowerCase().replace('_', ' '), params.length ? `${fresh} %` : 'no data', ps.length,
        Math.round(ps.reduce((m, p) => m + (p.los - p.aos), 0) / 60000), al.length, al.filter((a) => a.alarm_state === 2).length,
        cm.filter((c) => c.status === 'COMPLETED' || c.status === 'ACCEPTED').length, cm.filter((c) => c.status === 'FAILED' || c.status === 'REJECTED').length];
    });
    const month = new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    addReport({
      id: `R-${Date.now()}`, kind: 'availability', title: `Availability report · ${month}`, generatedAt: now, generatedBy: user.name, reconstructed: false,
      note: 'A full month needs the archive. This covers what the console holds: contacts in the last 24 h from the orbit model, telemetry freshness now, and this session’s alarms and commands.',
      columns: ['Satellite', 'Health now', 'Telemetry fresh', 'Contacts 24 h', 'Contact min 24 h', 'Alarms', 'Critical', 'Commands done', 'Commands failed'],
      rows,
    });
    audit('REPORT_GENERATE', `availability report ${ids.length} satellites`, '—');
  };

  const exportReport = (r: Report) => {
    downloadCsv(`${r.title.replace(/[^\w-]+/g, '-').toLowerCase()}.csv`, r.columns, r.rows, r.note);
    audit('REPORT_EXPORT', r.title, '—');
  };

  const chip = 'flex items-center gap-1.5 h-[30px] pl-3 pr-1.5 rounded-full bg-[#161A22] font-mono-code text-[12px] text-[#C9CED6]';

  return (
    <>
      <PageHead title="Archive and reports" sub="Retrieve, compare and export telemetry, events and commands; generate pass and availability reports. Every export is recorded in the audit ledger." />
      <Banner kind="info" lead="Archive service not connected.">Telemetry here is reconstructed around the live values. Alarms and commands are what this console holds this session; on-board events are sample data.</Banner>

      <div className="flex flex-wrap gap-4 mb-4">
        <Card title="Query" className="flex-[999_1_560px] min-w-0">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-[12.5px] text-[#9AA3B2]">Satellites</span>
              <div className="flex flex-wrap items-center gap-2">
                {query.sats.map((s) => (
                  <span key={s} className={chip}>{s}<button type="button" aria-label={`Remove ${s}`} onClick={() => setQuery({ sats: query.sats.filter((x) => x !== s) })} className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[#7C8594] hover:text-[#E9ECF1]"><X size={12} /></button></span>
                ))}
                <Select value={addSat} onChange={(e) => { const v = e.target.value; if (v && !query.sats.includes(v)) setQuery({ sats: [...query.sats, v] }); setAddSat(''); }} aria-label="Add a satellite" className={selectCls}>
                  <option value="">Add satellite…</option>
                  {ids.filter((i) => !query.sats.includes(i)).map((i) => <option key={i} value={i}>{i}</option>)}
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[12.5px] text-[#9AA3B2]">Parameters</span>
              <div className="flex flex-wrap items-center gap-2">
                {query.params.map((p) => (
                  <span key={p} className={chip}>{p}<button type="button" aria-label={`Remove ${p}`} onClick={() => setQuery({ params: query.params.filter((x) => x !== p) })} className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[#7C8594] hover:text-[#E9ECF1]"><X size={12} /></button></span>
                ))}
                <Select value={addParam} onChange={(e) => { const v = e.target.value; if (v && !query.params.includes(v)) setQuery({ params: [...query.params, v] }); setAddParam(''); }} aria-label="Add a parameter" className={selectCls}>
                  <option value="">Add parameter…</option>
                  {Object.entries(PARAMETERS).map(([sub, defs]) => <optgroup key={sub} label={sub}>{defs.filter((d) => !query.params.includes(d.param_id)).map((d) => <option key={d.param_id} value={d.param_id}>{d.param_id}</option>)}</optgroup>)}
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[12.5px] text-[#9AA3B2]">Time range (UTC)</span>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented size="sm" value={query.preset} onChange={(p) => setQuery(p === 'Custom' ? { preset: p, from: query.from, to: query.to } : { preset: p })}
                  options={(['1 h', '6 h', '24 h', '7 d', 'Custom'] as const).map((p) => ({ value: p, label: p === 'Custom' ? 'Custom' : `Last ${p}` }))} />
                {query.preset === 'Custom' && (
                  <>
                    <label className="flex items-center gap-1.5 text-[12.5px] text-[#9AA3B2]">From <DateInput type="datetime-local" value={toInput(query.from)} onChange={(e) => e.target.value && setQuery({ from: fromInput(e.target.value) })} className={selectCls} /></label>
                    <label className="flex items-center gap-1.5 text-[12.5px] text-[#9AA3B2]">To <DateInput type="datetime-local" value={toInput(query.to)} onChange={(e) => e.target.value && setQuery({ to: fromInput(e.target.value) })} className={selectCls} /></label>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-[13px]">
              {([['alarms', 'Alarms'], ['commands', 'Commands'], ['events', 'On-board events']] as const).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={query[k]} onChange={(e) => setQuery({ [k]: e.target.checked } as Partial<ArchiveQuery>)} className="w-4 h-4" />{l}</label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button onClick={() => { run(user.name); setTab(query.params.length ? 'telemetry' : 'events'); }} disabled={!!invalid} reason={invalid}><Play size={14} /> Run query</Button>
              <span className="flex items-center gap-2 ml-auto">
                <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Name this query" aria-label="Query name" className="h-9 w-[180px] bg-[#11141B] border border-[#232936] rounded-lg px-2.5 text-[13px] outline-none focus:border-[#6CB8FF]" />
                <Button variant="secondary" size="sm" disabled={!saveName.trim() || !!invalid} onClick={() => { saveQuery(saveName.trim(), user.name); setSaveName(''); }}>Save query</Button>
              </span>
            </div>
          </div>
        </Card>

        <Card title="Saved queries" className="flex-[1_1_320px] min-w-0">
          <div className="flex flex-col gap-2">
            {saved.map((s) => (
              <div key={s.id} className="rounded-xl bg-[#161A22] px-3.5 py-2.5 flex items-center gap-2">
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] truncate">{s.name}</span>
                  <span className="block text-[12px] text-[#7C8594] truncate">{s.query.sats.join(', ')} · {s.query.params.length} parameters · {s.query.preset === 'Custom' ? 'custom range' : `last ${s.query.preset}`} · {s.savedBy}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => setQuery(s.query)}>Load</Button>
                <button type="button" onClick={() => deleteQuery(s.id)} aria-label={`Delete ${s.name}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#7C8594] hover:text-[#FF7A7A] hover:bg-[#1A1E27]"><Trash2 size={14} /></button>
              </div>
            ))}
            {saved.length === 0 && <p className="text-[13px] text-[#9AA3B2]">No saved queries yet. Name a query and save it to run it again later in this session.</p>}
          </div>
        </Card>
      </div>

      {!ran ? (
        <Card className="mb-4"><p className="text-[13px] text-[#9AA3B2]">Build a query and run it. Results, chart and exports appear here.</p></Card>
      ) : (
        <>
          <KpiRow>
            <KpiTile label="Range" value={<span className="text-[20px]">{fmtUtc(ran.query.from)} → {fmtUtc(ran.query.to)}</span>} sub={`run ${fmtUtc(ran.at, true)} UTC by ${ran.by}`} />
            <KpiTile label="Series" value={series?.lines.length ?? 0} sub={series ? `${series.ts.length} points each · ${rollupLabel(series.step)}` : ''} />
            <KpiTile label="Events" value={events.length} sub={`${events.filter((e) => e.kind === 'Alarm').length} alarms · ${events.filter((e) => e.kind === 'Command').length} commands`} />
          </KpiRow>
          <Card className="mb-4" title="Results" actions={
            <span className="flex flex-wrap items-center gap-2">
              <Segmented size="sm" value={tab} onChange={setTab} options={[{ value: 'telemetry', label: 'Telemetry' }, { value: 'events', label: `Events ${events.length}` }]} />
              {tab === 'telemetry'
                ? <Button size="sm" variant="secondary" onClick={exportTelemetry} disabled={!series?.lines.length}><Download size={14} /> CSV</Button>
                : <Button size="sm" variant="secondary" onClick={exportEvents} disabled={!events.length}><Download size={14} /> CSV</Button>}
            </span>
          }>
            {tab === 'telemetry' && series && (
              series.lines.length === 0 ? <p className="text-[13px] text-[#9AA3B2]">No parameters in this query.</p> : (
                <div className="flex flex-col gap-3">
                  <SampleTag className="self-start">Reconstructed — archive not connected</SampleTag>
                  <MultiPlot key={ran.at} timestamps={series.ts} height={300} syncKey="archive" onReady={() => {}} onXRange={() => {}}
                    markers={events.filter((e) => e.kind !== 'On-board event').map((e) => ({ t: e.t / 1000, color: e.kind === 'Alarm' ? '#FF6B6B' : '#F28C28', label: e.kind === 'Alarm' ? e.text : e.text.split(' ')[0] }))}
                    series={series.lines.map((l, i) => ({ label: `${l.sat} ${l.param}`, color: PALETTE[i % PALETTE.length], unit: l.def.unit, values: l.values,
                      limits: { lowSoft: l.def.warnLo, hiSoft: l.def.warnHi, lowHard: l.def.critLo, hiHard: l.def.critHi } }))} />
                  <div className="overflow-auto max-h-[360px]">
                    <table className="w-full text-[12.5px] border-separate border-spacing-y-1">
                      <thead className="sticky top-0 bg-[#11141B]"><tr className="text-[12px] text-[#6B7383] text-right"><th className="px-3 py-1 font-normal text-left">UTC</th>{series.lines.map((l) => <th key={l.sat + l.param} className="px-3 py-1 font-normal whitespace-nowrap">{l.sat} {l.param} <span className="text-[#7C8594]">{l.def.unit}</span></th>)}</tr></thead>
                      <tbody>
                        {series.ts.map((t, i) => series.ts.length - 1 - i).slice(0, 200).map((i) => (
                          <tr key={i} className="bg-[#141821] font-mono-code text-right">
                            <td className="px-3 py-1.5 rounded-l-[10px] text-left text-[#9AA3B2] whitespace-nowrap">{fmtUtc(series.ts[i] * 1000, true)}</td>
                            {series.lines.map((l, k) => {
                              const v = l.values[i];
                              const bad = v <= l.def.warnLo || v >= l.def.warnHi;
                              return <td key={k} className={clsx('px-3 py-1.5', k === series.lines.length - 1 && 'rounded-r-[10px]', bad && 'text-[#F5C451]')}>{fmtNum(v)}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {series.ts.length > 200 && <p className="text-[12px] text-[#7C8594] px-3 py-2">Showing the newest 200 of {series.ts.length} rows. The CSV holds all of them.</p>}
                  </div>
                </div>
              )
            )}
            {tab === 'events' && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-[13px] border-separate border-spacing-y-1">
                  <thead><tr className="text-[12px] text-[#6B7383] text-left"><th className="px-3 py-1 font-normal">UTC</th><th className="px-3 py-1 font-normal">Satellite</th><th className="px-3 py-1 font-normal">Kind</th><th className="px-3 py-1 font-normal">What</th><th className="px-3 py-1 font-normal">Detail</th></tr></thead>
                  <tbody>
                    {events.map((e, i) => (
                      <tr key={i} className="bg-[#141821]">
                        <td className="px-3 py-2 rounded-l-[10px] font-mono-code text-[#9AA3B2] whitespace-nowrap">{fmtUtc(e.t, true)}</td>
                        <td className="px-3 py-2 font-mono-code">{e.sat}</td>
                        <td className="px-3 py-2"><Pill tone={e.kind === 'Alarm' ? 'warn' : e.kind === 'Command' ? 'action' : 'neutral'}>{e.kind}</Pill></td>
                        <td className="px-3 py-2">{e.text}</td>
                        <td className="px-3 py-2 rounded-r-[10px] text-[#9AA3B2]">{e.detail}{e.source === 'sample' && <SampleTag className="ml-2" />}</td>
                      </tr>
                    ))}
                    {events.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-[#9AA3B2]">Nothing recorded for these satellites in this range.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <Card title="Reports" actions={<RoleLink to="report" onNavigate={onNavigate}>Pass quality reports</RoleLink>}>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Select value={reportSat} onChange={(e) => setReportSat(e.target.value)} aria-label="Satellite for the pass report" className={selectCls}>
            {ids.map((i) => <option key={i} value={i}>{i}</option>)}
          </Select>
          <Button size="sm" variant="secondary" onClick={passReport} disabled={!satellites[reportSat]}>Generate pass report</Button>
          <Button size="sm" variant="secondary" onClick={availabilityReport} disabled={!ids.length}>Generate monthly availability report</Button>
        </div>
        <div className="flex flex-col gap-2">
          {reports.map((r) => (
            <div key={r.id} className="rounded-xl bg-[#161A22] px-3.5 py-3 flex flex-wrap items-center gap-3">
              <span className="flex-1 min-w-[220px]">
                <span className="block text-[13.5px]">{r.title}</span>
                <span className="block text-[12px] text-[#7C8594]">Generated {fmtUtc(r.generatedAt, true)} UTC by {r.generatedBy} · {r.rows.length} rows</span>
              </span>
              {r.reconstructed && <SampleTag>Partly reconstructed</SampleTag>}
              <Button size="sm" variant="ghost" onClick={() => setViewing(r)}>View</Button>
              <Button size="sm" variant="secondary" onClick={() => exportReport(r)}><Download size={14} /> CSV</Button>
              <button type="button" onClick={() => deleteReport(r.id)} aria-label={`Delete ${r.title}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#7C8594] hover:text-[#FF7A7A] hover:bg-[#1A1E27]"><Trash2 size={14} /></button>
            </div>
          ))}
          {reports.length === 0 && <p className="text-[13px] text-[#9AA3B2]">No reports yet. Generate a pass report for one satellite or an availability report for the fleet.</p>}
        </div>
      </Card>

      {viewing && (
        <Drawer title={viewing.title} onClose={() => setViewing(null)} footer={<Button size="sm" onClick={() => exportReport(viewing)}><Download size={14} /> Download CSV</Button>}>
          <p className="text-[13px] text-[#9AA3B2] leading-[1.5]">{viewing.note}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] border-separate border-spacing-y-1">
              <thead><tr className="text-[12px] text-[#6B7383] text-left">{viewing.columns.map((c) => <th key={c} className="px-2 py-1 font-normal whitespace-nowrap">{c}</th>)}</tr></thead>
              <tbody>
                {viewing.rows.map((row, i) => (
                  <tr key={i} className="bg-[#141821]">{row.map((v, k) => <td key={k} className={clsx('px-2 py-1.5', k === 0 && 'rounded-l-lg font-mono-code', k === row.length - 1 && 'rounded-r-lg')}>{v}</td>)}</tr>
                ))}
                {viewing.rows.length === 0 && <tr><td colSpan={viewing.columns.length} className="px-2 py-3 text-[#9AA3B2]">Nothing to report.</td></tr>}
              </tbody>
            </table>
          </div>
        </Drawer>
      )}
    </>
  );
};
