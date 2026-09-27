import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Copy, FileText, RotateCw } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Banner, Card, Drawer, KpiTile, PageHead, Td, Th } from '../../components/molecules/Page';
import { DELIVERIES, tenantOf } from '../../data/fleet';
import type { Delivery } from '../../types';
import { seeded } from '../../ops/history';
import { useAuthStore } from '../../store/useAuthStore';
import { useMissionStore } from '../../store/useMissionStore';
import { toast } from '../../store/useToastStore';

type State = Delivery['state'];
const STAGES: { s: State; label: string }[] = [{ s: 'RECEIVING', label: 'Receiving' }, { s: 'MERGING', label: 'Merging stations' }, { s: 'L0_READY', label: 'L0 ready' }, { s: 'DELIVERED', label: 'Delivered' }];
const LABEL: Record<State, string> = { RECEIVING: 'Receiving', MERGING: 'Merging stations', L0_READY: 'L0 ready', DELIVERED: 'Delivered', CHECKSUM_FAILED: 'Checksum failed' };
const TONE: Record<State, string> = { RECEIVING: 'text-[#2DCCFF]', MERGING: 'text-[#9C9AEC]', L0_READY: 'text-[#56F000]', DELIVERED: 'text-[#8496AB]', CHECKSUM_FAILED: 'text-[#FF3838]' };
const MIN_MBPS = 150;
const gb = (mb: number) => (mb / 1000).toFixed(1);
const hex = (key: string, n: number) => { const r = seeded(key); return Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join(''); };

const Throughput: React.FC<{ data: number[] }> = ({ data }) => {
  const W = 800, H = 180, max = 400;
  const x = (i: number) => (i / (data.length - 1)) * W, y = (v: number) => H - (v / max) * H;
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="Throughput in Mbps, last 90 seconds">
      <path d={`${d}L${W},${H}L0,${H}Z`} fill="#4DACFF" fillOpacity=".14" /><path d={d} fill="none" stroke="#4DACFF" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <line x1="0" x2={W} y1={y(MIN_MBPS)} y2={y(MIN_MBPS)} stroke="#D42C2C" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

/** S18 · Payload deliveries: bulk downlink sessions, checksum retry, product manifests. Customers see only their own tenant. */
export const PayloadTasking: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const customer = role === 'Customer User';
  const tenant = customer ? tenantOf(user.satellite_scope[0] ?? '') : null;
  const [over, setOver] = useState<Record<string, Partial<Delivery>>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [scope, setScope] = useState<'ALL' | State>('ALL');
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => setTick((n) => n + 1), 1000); return () => clearInterval(t); }, []);

  const all = DELIVERIES.map((d) => ({ ...d, ...over[d.delivery_id] }));
  const rows = all.filter((d) => (tenant ? d.tenant === tenant : scope === 'ALL' || d.state === scope));
  const sec = Math.floor(Date.now() / 1000);
  const series = Array.from({ length: 90 }, (_, i) => { const s = sec - 89 + i; return 282 + Math.sin(s * 12.9898) * 15 + Math.sin(s / 7) * 8 - (s % 97 < 4 ? 130 : 0); });
  const cur = series[series.length - 1];
  const live = all.find((d) => d.state === 'RECEIVING');
  const sel = all.find((d) => d.delivery_id === open);
  void tick;

  const retry = (d: Delivery) => {
    const id = d.delivery_id;
    setOver((o) => ({ ...o, [id]: { state: 'MERGING', chunks_received: d.chunks_total - 1 } }));
    useMissionStore.getState().appendAudit({ timestamp_utc: new Date().toISOString(), operator_id: 'PAYLOAD', operator_name: useAuthStore.getState().user.name, sat_id: d.sat_id, command_mnemonic: 'CHUNK_RETRY', procedure_id: '—', procedure_version: '—', sequence_count: 0, result: 'ACK', params_summary: `${id} chunk ${d.chunks_received + 1} re-requested from ${d.station_id} recording` });
    toast.info('Retry started', { body: `${id}: chunk re-fetched from the ${d.station_id} recording` });
    window.setTimeout(() => { setOver((o) => ({ ...o, [id]: { state: 'L0_READY', chunks_received: d.chunks_total, checksum_ok: true } })); toast.success('L0 product ready', { body: `${id}: checksum verified` }); }, 3000);
  };

  const manifest = (d: Delivery) => (d.manifest.length ? d.manifest : [{ name: `${d.sat_id.replace('-', '')}_L0_${d.delivery_id.slice(3, 8)}.pkt`, bytes: d.size_mb * 1048576, sha256: hex(d.delivery_id, 64) }]).map((m) => ({ ...m, sha256: m.sha256.length < 64 ? hex(d.delivery_id + m.name, 64) : m.sha256 }));
  const stageIdx = (d: Delivery) => (d.state === 'CHECKSUM_FAILED' ? 1 : STAGES.findIndex((x) => x.s === d.state));

  return (
    <>
      <PageHead title="Payload deliveries" sub="Bulk downlink sessions, integrity checks and L0 products"
        actions={!customer && (
          <select value={scope} onChange={(e) => setScope(e.target.value as 'ALL' | State)} aria-label="Status" className="h-8 rounded-md bg-[#111A25] border border-[#2A3B52] px-2 text-[12.5px]">
            <option value="ALL">All sessions</option>{(Object.keys(LABEL) as State[]).map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
          </select>)} />
      {tenant && <Banner kind="info" lead={`Tenant ${tenant}.`}>Only your organisation's sessions and products are shown for this role.</Banner>}

      <div className={clsx('grid gap-3 mb-4 grid-cols-2', customer ? 'lg:grid-cols-3' : 'lg:grid-cols-4')}>
        {!customer && <KpiTile value={`${cur.toFixed(0)} Mbps`} label={`Active dump${live ? ` · ${live.sat_id}` : ''}`} sub={live ? `via ${live.station_id}` : 'no active dump'} tone="ok" />}
        <KpiTile value={rows.length} label="Sessions today" sub={`${gb(rows.reduce((a, r) => a + r.size_mb, 0))} GB`} />
        <KpiTile value={rows.filter((r) => r.state === 'L0_READY' || r.state === 'DELIVERED').length} label="L0 products" sub="ready or delivered" tone="ok" />
        <KpiTile value={rows.filter((r) => r.state === 'CHECKSUM_FAILED').length} label="Checksum failures" sub="retry from station recording" tone={rows.some((r) => r.state === 'CHECKSUM_FAILED') ? 'crit' : 'plain'} />
      </div>

      {!customer && (
        <Card title="Throughput · last 90 s">
          <Throughput data={series} />
          <p className="text-[12px] text-[#8496AB] mt-1">Dashed red line: the {MIN_MBPS} Mbps minimum needed to meet the product deadline.</p>
        </Card>
      )}

      <div className="mt-4">
        <Card title="Download sessions">
          <div className="-m-4 overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse min-w-[760px]">
              <thead><tr><Th>Session</Th><Th>Satellite</Th><Th>Station</Th><Th>Size</Th><Th>Chunks</Th><Th>Checksum</Th><Th>Status</Th><Th>{''}</Th></tr></thead>
              <tbody>
                {rows.map((d) => {
                  const done = d.state === 'CHECKSUM_FAILED' ? d.chunks_received : d.chunks_received;
                  return (
                    <tr key={d.delivery_id} className="cursor-pointer hover:bg-[#172434]" onClick={() => setOpen(d.delivery_id)}>
                      <Td className="font-mono-code">{d.delivery_id}</Td><Td className="font-mono-code">{d.sat_id}</Td><Td className="font-mono-code">{d.station_id}</Td><Td className="tabular-nums">{gb(d.size_mb)} GB</Td>
                      <Td><span className="tabular-nums">{done}</span><span className="text-[#8496AB]"> / {d.chunks_total}</span>
                        <div className="h-1 w-28 rounded-full bg-[#1F2D40] mt-1"><i className={clsx('block h-full rounded-full', d.state === 'CHECKSUM_FAILED' ? 'bg-[#FF3838]' : 'bg-[#4DACFF]')} style={{ width: `${(done / d.chunks_total) * 100}%` }} /></div></Td>
                      <Td>{d.state === 'CHECKSUM_FAILED' ? <span className="font-mono-code text-[#FF3838]">chunk {done + 1} mismatch</span> : d.state === 'RECEIVING' || d.state === 'MERGING' ? <span className="text-[#8496AB]">pending</span> : <span className="font-mono-code text-[#8496AB]">sha256 ok</span>}</Td>
                      <Td><span className={clsx('text-[11.5px] font-bold', TONE[d.state])}>{LABEL[d.state]}</span></Td>
                      <Td>{d.state === 'CHECKSUM_FAILED' && !customer
                        ? <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); retry(d); }}><RotateCw size={13} /> Retry</Button>
                        : <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setOpen(d.delivery_id); }}><FileText size={13} /> Manifest</Button>}</Td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><Td className="text-[#8496AB]">No sessions match.</Td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {sel && (
        <Drawer title={sel.delivery_id} onClose={() => setOpen(null)}
          footer={<><Button variant="secondary" onClick={() => onNavigate(`/satellites/${sel.sat_id}`)}>Open {sel.sat_id}</Button><Button disabled={sel.state !== 'L0_READY' && sel.state !== 'DELIVERED'} onClick={() => toast.success('Signed link issued', { body: `${sel.delivery_id}: valid for 24 h` })}>Get download link</Button></>}>
          <p className="text-[12.5px] text-[#8496AB] -mt-2">{sel.sat_id} · {sel.station_id} · {gb(sel.size_mb)} GB</p>
          <ol className="grid grid-cols-4 gap-2">
            {STAGES.map((st, k) => { const idx = stageIdx(sel); const done = k < idx || sel.state === 'DELIVERED'; return (
              <li key={st.s} className="flex flex-col gap-1.5"><span className={clsx('h-1 rounded-full', sel.state === 'CHECKSUM_FAILED' && k === 1 ? 'bg-[#FF3838]' : done ? 'bg-[#4DACFF]' : k === idx ? 'bg-[#2DCCFF]' : 'bg-[#2A3B52]')} /><span className={clsx('text-[11px]', k === idx ? 'font-bold' : 'text-[#A3B1C2]')}>{st.label}</span></li>
            ); })}
          </ol>
          {sel.state === 'CHECKSUM_FAILED' && <Banner kind="crit" lead="Checksum failed.">Chunk {sel.chunks_received + 1} does not match the on-board CRC manifest. Retry fetches it again from the {sel.station_id} recording.</Banner>}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
            {[['Product', `L0 · ${sel.sat_id}`], ['Tenant', sel.tenant], ['Chunks', `${sel.chunks_received} / ${sel.chunks_total}`], ['Chunk size', '10 MB'], ['Started', `${sel.started_utc.slice(11, 16)} UTC`]].map(([k, v]) => <div key={k}><dt className="text-[11.5px] text-[#8496AB]">{k}</dt><dd className="font-mono-code">{v}</dd></div>)}
          </dl>
          <span className="label-caps">Manifest</span>
          {manifest(sel).map((m) => (
            <div key={m.name} className="rounded-lg border border-[#213044] p-3 flex flex-col gap-1.5">
              <div className="flex gap-2"><span className="font-mono-code text-[11.5px] break-all flex-1">{m.name}</span><span className="text-[12px] text-[#8496AB] tabular-nums">{(m.bytes / 1e9).toFixed(2)} GB</span></div>
              <div className="flex gap-2 items-center"><span className="font-mono-code text-[10.5px] break-all text-[#8496AB] flex-1">sha256 {m.sha256}</span>
                <button aria-label="Copy sha256" onClick={() => { navigator.clipboard?.writeText(m.sha256).catch(() => {}); toast.info('Copied', { body: `sha256 ${m.sha256.slice(0, 12)}…` }); }} className="w-7 h-7 rounded flex items-center justify-center text-[#A3B1C2] hover:bg-[#1F2D40]"><Copy size={13} /></button></div>
            </div>
          ))}
          <Banner kind="info" lead="Claim check.">Payload never travels through the message bus. Chunks go straight to object storage; only a small event with the manifest key is published.</Banner>
        </Drawer>
      )}
    </>
  );
};
