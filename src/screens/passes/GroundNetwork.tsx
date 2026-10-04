import React, { useMemo, useState } from 'react';
import { Button } from '../../components/atoms/Button';
import { Pill, type Tone } from '../../components/atoms/Badge';
import { Banner, Card, KpiRow, KpiTile, PageHead, SampleTag } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { FLEET } from '../../data/fleet';
import { can } from '../../auth/policy';
import { useAuthStore } from '../../store/useAuthStore';
import { NET_STATIONS, useNetworkStore, type Booking, type SleState } from '../../store/useNetworkStore';
import { satElements } from '../../orbit/fleetOrbit';
import { passes } from '../../orbit/orbit';
import { RouteLink, field, isSat, setHashParams, useHashParams, utc } from '../commanding/gates';
import { Select } from '../../components/molecules/Select';

const PSTATE: Record<string, [string, Tone]> = { CONNECTED: ['Connected', 'ok'], DEGRADED: ['Degraded', 'warn'], NOT_CONFIGURED: ['Not configured', 'neutral'] };
const BSTATE: Record<Booking['state'], [string, Tone]> = { REQUESTED: ['Waiting for provider', 'action'], CONFIRMED: ['Confirmed', 'ok'], DECLINED: ['Declined', 'crit'], CANCELLED: ['Cancelled', 'neutral'] };
const SLE_NEXT: Record<SleState, [SleState, string]> = { UNBOUND: ['READY', 'Bind'], READY: ['ACTIVE', 'Start'], ACTIVE: ['READY', 'Stop'] };
const th = 'px-3 py-1 font-normal text-left';

/** S32 · Ground network: providers, SLE services per station, and bookings that only the provider confirms. */
export const GroundNetwork: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const params = useHashParams();
  const role = useAuthStore((s) => s.activeRole);
  const { providers, sle, bookings, setSle, request, cancel } = useNetworkStore();
  const mayBook = can('booking:edit', role);
  const [book, setBook] = useState<{ sat: string; station: string; pick?: number } | null>(
    params.book === '1' ? { sat: isSat(params.sat) ? params.sat : 'AKV-03', station: params.station ?? 'SVL' } : null);
  const [cancelling, setCancelling] = useState<Booking | null>(null);

  const st = NET_STATIONS.find((s) => s.id === book?.station);
  const windows = useMemo(() => {
    if (!book || !st) return [];
    const sat = FLEET.find((f) => f.sat_id === book.sat);
    return sat ? passes(satElements(sat), st, Date.now(), 24 * 3600_000, 10, 30_000).slice(0, 8) : [];
  }, [book?.sat, book?.station]); // eslint-disable-line react-hooks/exhaustive-deps
  const bookProvider = providers.find((p) => p.id === st?.provider);

  const upcoming = bookings.filter((b) => b.state === 'CONFIRMED' && Date.parse(b.los) > Date.now()).length;
  const waiting = bookings.filter((b) => b.state === 'REQUESTED').length;
  const filtered = params.sat && isSat(params.sat) && !book ? bookings.filter((b) => b.sat === params.sat) : bookings;

  const submit = () => {
    if (!book || book.pick === undefined) return;
    const w = windows[book.pick];
    request({ sat: book.sat, station: book.station, aos: new Date(w.aos).toISOString(), los: new Date(w.los).toISOString(), maxEl: Math.round(w.maxElevationDeg) });
    setBook(null);
    setHashParams({ book: undefined });
  };

  return (
    <>
      <PageHead title="Ground network" sub={<>Own stations, SLE services and ground-station-as-a-service providers. A booking is confirmed only by the provider. <SampleTag /></>}
        actions={<>
          <RouteLink as="button" to="stations" onNavigate={onNavigate}>Station catalogue</RouteLink>
          <Button disabled={!mayBook.allowed} onClick={() => setBook({ sat: isSat(params.sat) ? params.sat : 'AKV-03', station: 'SVL' })}>Request a pass…</Button>
        </>} />

      {!mayBook.allowed && <Banner kind="info" lead="Read only.">{mayBook.reason}</Banner>}

      <KpiRow>
        <KpiTile label="Providers connected" value={<>{providers.filter((p) => p.state === 'CONNECTED').length} <span className="text-[14px] text-[#7C8594] font-normal">of {providers.length}</span></>} tone="ok" />
        <KpiTile label="Stations reachable" value={NET_STATIONS.length} />
        <KpiTile label="Confirmed upcoming passes" value={upcoming} />
        <KpiTile label="Waiting for a provider" value={waiting} tone={waiting ? 'action' : 'plain'} />
      </KpiRow>

      <div className="flex flex-wrap gap-4 items-start mb-4">
        <Card title="Providers" className="flex-[999_1_560px] min-w-0">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {providers.map((p) => (
              <div key={p.id} className="rounded-xl bg-[#161A22] px-4 py-3.5 flex flex-col gap-1.5">
                <span className="flex justify-between items-center gap-2"><span className="text-[14px] font-medium">{p.name}</span><Pill tone={PSTATE[p.state][1]} glyph={p.state === 'CONNECTED' ? 'normal' : p.state === 'DEGRADED' ? 'caution' : 'off'}>{PSTATE[p.state][0]}</Pill></span>
                <span className="text-[12.5px] text-[#9AA3B2]">{p.kind} · {p.api}</span>
                <span className="font-mono-code text-[12px] text-[#C9CED6]">{p.stations.join(' · ')}</span>
                {p.note && <span className="text-[12px] text-[#F5C451]">{p.note}</span>}
              </div>
            ))}
          </div>
        </Card>

        <Card title="SLE services" className="flex-[1_1_360px] min-w-0" flush>
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full text-[13px] border-separate" style={{ borderSpacing: '0 4px' }}>
              <thead><tr className="text-[12px] text-[#6B7383]"><th className={th}>Station</th>{(['RAF', 'RCF', 'FCLTU'] as const).map((t) => <th key={t} className={th}>{t}</th>)}</tr></thead>
              <tbody>
                {[...new Set(sle.map((s) => s.station))].map((station) => (
                  <tr key={station} className="bg-[#141821]">
                    <td className="px-3 py-2.5 rounded-l-[10px] font-mono-code">{station}</td>
                    {(['RAF', 'RCF', 'FCLTU'] as const).map((type, i) => {
                      const s = sle.find((x) => x.station === station && x.type === type)!;
                      const [next, label] = SLE_NEXT[s.state];
                      return (
                        <td key={type} className={`px-3 py-2 ${i === 2 ? 'rounded-r-[10px]' : ''}`}>
                          <span className="flex flex-col items-start gap-1">
                            <Pill tone={s.state === 'ACTIVE' ? 'ok' : s.state === 'READY' ? 'info' : 'neutral'}>{s.state.charAt(0) + s.state.slice(1).toLowerCase()}</Pill>
                            <button type="button" disabled={!mayBook.allowed} onClick={() => setSle(station, type, next)} className="text-[12px] text-[#F2A65A] hover:text-[#FFC48A] disabled:text-[#6B7383]">{label}</button>
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 text-[12px] text-[#7C8594]">RAF and RCF return telemetry frames; FCLTU forwards telecommand CLTUs.</p>
          </div>
        </Card>
      </div>

      <Card title="Bookings" actions={params.sat && isSat(params.sat) && !book ? <button type="button" className="text-[12.5px] text-[#F2A65A]" onClick={() => setHashParams({ sat: undefined })}>Showing {params.sat} · show all</button> : undefined} flush>
        <div className="overflow-x-auto px-2 pb-2">
          <table className="w-full min-w-[820px] text-[13px] border-separate" style={{ borderSpacing: '0 4px' }}>
            <thead><tr className="text-[12px] text-[#6B7383]"><th className={th}>Booking</th><th className={th}>Satellite · station</th><th className={th}>Window (UTC)</th><th className={th}>State</th><th className={`${th} text-right`}>Action</th></tr></thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id} className="bg-[#141821]">
                  <td className="px-3 py-2.5 rounded-l-[10px] font-mono-code">{b.id}<span className="block text-[11.5px] text-[#7C8594] font-sans">{b.requestedBy}</span></td>
                  <td className="px-3 py-2.5"><span className="font-mono-code">{b.sat}</span> · {NET_STATIONS.find((s) => s.id === b.station)?.name}<span className="block text-[11.5px] text-[#7C8594]">{providers.find((p) => p.id === b.provider)?.name}</span></td>
                  <td className="px-3 py-2.5 font-mono-code text-[12.5px]">{utc(b.aos, false)} – {utc(b.los, false).slice(-5)} · {b.maxEl}°</td>
                  <td className="px-3 py-2.5"><Pill tone={BSTATE[b.state][1]}>{BSTATE[b.state][0]}</Pill>{b.note && <span className="block text-[11.5px] text-[#9AA3B2] mt-1">{b.note}</span>}</td>
                  <td className="px-3 py-2 rounded-r-[10px] text-right">
                    {(b.state === 'REQUESTED' || b.state === 'CONFIRMED') && Date.parse(b.aos) > Date.now()
                      ? <Button size="sm" variant="danger" disabled={!mayBook.allowed} onClick={() => setCancelling(b)}>Cancel</Button>
                      : <span className="text-[12px] text-[#6B7383]">—</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="px-3 py-3 bg-[#141821] rounded-[10px] text-[#7C8594]">No bookings.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {book && (
        <Modal title="Request a pass" onClose={() => { setBook(null); setHashParams({ book: undefined }); }}
          footer={<><Button variant="secondary" autoFocus onClick={() => { setBook(null); setHashParams({ book: undefined }); }}>Cancel</Button>
            <Button disabled={book.pick === undefined || bookProvider?.state === 'NOT_CONFIGURED' || !mayBook.allowed}
              reason={bookProvider?.state === 'NOT_CONFIGURED' ? `${bookProvider.name} is not configured` : book.pick === undefined ? 'Pick a window' : undefined}
              onClick={submit}>Send request to {bookProvider?.name}</Button></>}>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1.5 text-[13px] text-[#9AA3B2]">Satellite
              <Select value={book.sat} onChange={(e) => setBook({ ...book, sat: e.target.value, pick: undefined })} className={`${field} font-mono-code`}>{FLEET.map((f) => <option key={f.sat_id}>{f.sat_id}</option>)}</Select>
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] text-[#9AA3B2] flex-1 min-w-[200px]">Station
              <Select value={book.station} onChange={(e) => setBook({ ...book, station: e.target.value, pick: undefined })} className={field}>
                {NET_STATIONS.map((s) => <option key={s.id} value={s.id}>{s.name} · {providers.find((p) => p.id === s.provider)?.name}</option>)}
              </Select>
            </label>
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-[13px] text-[#9AA3B2] mb-1.5">Passes in the next 24 h above 10° (from the orbit)</legend>
            {windows.map((w, i) => (
              <label key={w.aos} className="flex items-center gap-3 rounded-[10px] bg-[#161A22] px-3 py-2 text-[13px] cursor-pointer">
                <input type="radio" name="win" checked={book.pick === i} onChange={() => setBook({ ...book, pick: i })}  />
                <span className="font-mono-code">{utc(w.aos, false)} – {utc(w.los, false).slice(-5)}</span>
                <span className="text-[#9AA3B2]">{Math.round((w.los - w.aos) / 60_000)} min · max {Math.round(w.maxElevationDeg)}°</span>
              </label>
            ))}
            {windows.length === 0 && <span className="text-[13px] text-[#7C8594]">{book.sat} does not rise above 10° over this station in the next 24 h.</span>}
          </fieldset>
          {bookProvider?.note && <Banner kind="warn" lead={bookProvider.name}>{bookProvider.note}</Banner>}
        </Modal>
      )}
      {cancelling && (
        <Modal title={`Cancel ${cancelling.id}?`} onClose={() => setCancelling(null)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setCancelling(null)}>Keep it</Button><Button variant="danger" onClick={() => { cancel(cancelling.id); setCancelling(null); }}>Cancel booking</Button></>}>
          <p className="text-[13.5px] text-[#C9CED6]">{cancelling.sat} over {cancelling.station} at {utc(cancelling.aos, false)} UTC. The provider may charge a late-cancellation fee. Recorded in the audit ledger.</p>
        </Modal>
      )}
    </>
  );
};
