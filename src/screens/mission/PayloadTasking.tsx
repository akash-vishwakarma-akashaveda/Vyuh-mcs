import React, { useEffect, useRef, useState } from 'react';
import { Download, RotateCw, Send } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Pill, Tone } from '../../components/atoms/Badge';
import { Banner, Card, KpiRow, KpiTile, Meter, PageHead, SampleTag, Td, Th } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { can } from '../../auth/policy';
import { tenantOfPerson, useAuthStore } from '../../store/useAuthStore';
import { useMissionStore } from '../../store/useMissionStore';
import { useRequestStore } from '../../store/useRequestStore';
import { chunksIn, productManifest, saveBlob, Session, Stage, stageOf, useDeliveryStore } from '../../store/useDeliveryStore';
import { hm, RoleLink, useHashParams, utc } from './shared';

const STAGE: Record<Stage, [string, Tone, string]> = {
  RECEIVING: ['Receiving', 'info', '#6CB8FF'], CHECKSUM_FAILED: ['Checksum failed', 'crit', '#FF6B6B'], MERGING: ['Merging', 'violet', '#9B8CFF'],
  L0_READY: ['Product ready', 'ok', '#4ADE9A'], DELIVERED: ['Delivered', 'neutral', '#4ADE9A'],
};
const gb = (mb: number) => `${(mb / 1000).toFixed(1)} GB`;

/** Stage timeline steps for a session: done / now / failed / todo. */
function steps(s: Session, now: number) {
  const st = stageOf(s, now);
  const n = chunksIn(s, now);
  const order: Stage[] = ['RECEIVING', 'CHECKSUM_FAILED', 'MERGING', 'L0_READY', 'DELIVERED'];
  const at = order.indexOf(st);
  const lastRetry = s.retries[s.retries.length - 1];
  return [
    { n: 'Received at station', state: st === 'RECEIVING' ? 'now' : 'done', sub: st === 'RECEIVING' ? `${n} of ${s.chunksTotal} chunks` : 'Done', t: st === 'RECEIVING' ? 'now' : hm(s.recvDoneAt) },
    { n: 'Chunks verified', state: st === 'RECEIVING' ? 'todo' : st === 'CHECKSUM_FAILED' ? 'fail' : 'done', sub: st === 'CHECKSUM_FAILED' ? `${s.failedChunks.length} failed checksum` : st === 'RECEIVING' ? 'Waiting' : lastRetry ? `Done after retry by ${lastRetry.by}` : 'Done', t: lastRetry && st !== 'CHECKSUM_FAILED' && st !== 'RECEIVING' ? hm(lastRetry.at) : '' },
    { n: 'Merged into product', state: at < 2 ? 'todo' : st === 'MERGING' ? 'now' : 'done', sub: st === 'MERGING' ? 'Merging' : at > 2 ? 'Done' : 'Waiting', t: at > 2 ? hm(s.mergeDoneAt) : '' },
    { n: 'Processed to L0', state: at >= 3 ? 'done' : 'todo', sub: at >= 3 ? 'Done' : 'Waiting', t: at >= 3 ? hm(s.mergeDoneAt) : '' },
    { n: 'Delivered to customer', state: st === 'DELIVERED' ? 'done' : 'todo', sub: s.deliveredAt ? `By ${s.deliveredBy}` : 'Waiting', t: s.deliveredAt ? hm(s.deliveredAt) : '' },
  ] as const;
}
const NODE = {
  done: { bg: '#4ADE9A', b: '#4ADE9A', c: '#0A2418', d: 'M5 12l4 4 10-10' },
  now: { bg: 'rgba(108,184,255,0.14)', b: '#6CB8FF', c: '#6CB8FF', d: 'M12 8v4l3 2' },
  fail: { bg: 'rgba(255,107,107,0.15)', b: '#FF6B6B', c: '#FF7A7A', d: 'M12 7v6M12 17h.01' },
  todo: { bg: '#161A22', b: '#232936', c: 'transparent', d: 'M12 12h.01' },
};

/** S18 · Payload and delivery: downlink sessions to L0 products and customer delivery. Customers see only their tenant. */
export const PayloadTasking: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const customer = role === 'Customer User';
  const tenant = customer ? tenantOfPerson(user) : null;
  const { sessions, products, retry, deliver } = useDeliveryStore();
  const requests = useRequestStore((s) => s.requests);
  const mayOperate = customer ? { allowed: false, reason: 'Operations handles retries and delivery; you are notified by webhook.' } : can('plan:edit', role);
  const [q, setQ] = useHashParams();
  const [confirmDeliver, setConfirmDeliver] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const detailRef = useRef<HTMLDivElement>(null);

  const now = Date.now();
  const rows = sessions.filter((s) => !tenant || s.tenant === tenant);
  const sel = rows.find((s) => s.id === q.id);
  const missing = q.id && !sel ? q.id : null;
  useEffect(() => { if (sel) detailRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [q.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = rows.filter((s) => new Date(s.startedAt).toISOString().slice(0, 10) === new Date(now).toISOString().slice(0, 10));
  const st = sel && stageOf(sel, now);
  const product = sel?.productId ? products.find((p) => p.id === sel.productId) : undefined;
  const req = sel?.requestId ? requests.find((r) => r.id === sel.requestId) : undefined;
  const audit = (s: Session, what: string, summary: string) => useMissionStore.getState().appendAudit({
    timestamp_utc: new Date().toISOString(), operator_id: user.id, operator_name: user.name, sat_id: s.sat, command_mnemonic: what,
    procedure_id: '—', procedure_version: '—', sequence_count: 0, result: 'ACK', params_summary: summary,
  });
  const download = (s: Session) => {
    const p = product ?? { id: `L0-${s.id.slice(3)}`, sessionId: s.id, requestId: s.requestId, tenant: s.tenant, sat: s.sat, sizeMb: s.sizeMb, sha256: '', createdAt: s.mergeDoneAt };
    saveBlob(productManifest({ ...p, sha256: p.sha256 || 'pending' }, req ? { name: req.target, lat: req.lat, lon: req.lon } : undefined), `${p.id}_manifest_SAMPLE.geojson`);
  };

  return (
    <>
      <PageHead crumb="Plan / Payload and delivery" title="From downlink to the customer" sub={`Today, ${new Date(now).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`}
        actions={<SampleTag>Payload pipeline not connected: sample sessions</SampleTag>} />
      {tenant && <Banner kind="info" lead={`${tenant} only.`}>You see your organisation's sessions and products.</Banner>}
      {missing && <Banner kind="warn" lead={`Session ${missing} not found.`}>{tenant ? 'It may belong to another organisation.' : 'It may have been cleared with the session.'}</Banner>}

      <KpiRow>
        <KpiTile value={today.length} label="Sessions" sub="today" />
        <KpiTile value={(today.reduce((a, s) => a + (stageOf(s, now) === 'RECEIVING' ? (s.sizeMb * chunksIn(s, now)) / s.chunksTotal : s.sizeMb), 0) / 1000).toFixed(1)} label="Received" sub="GB" />
        <KpiTile value={rows.filter((s) => stageOf(s, now) === 'CHECKSUM_FAILED').length} label="Need a retry" sub="checksum failed" tone={rows.some((s) => stageOf(s, now) === 'CHECKSUM_FAILED') ? 'warn' : 'plain'} />
        <KpiTile value={rows.filter((s) => s.deliveredAt).length} label="Delivered" sub="to customers" tone="ok" />
      </KpiRow>

      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-[999_1_560px] min-w-0">
          <Card title="Download sessions" actions={<span className="text-[12px] text-[#7C8594]">{rows.length} in view</span>}>
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <thead><tr><Th>Session</Th><Th>Satellite · station</Th><Th>For</Th><Th>Progress</Th><Th>Stage</Th></tr></thead>
                <tbody>
                  {rows.map((s) => {
                    const sg = stageOf(s, now), n = chunksIn(s, now), on = s.id === q.id;
                    return (
                      <tr key={s.id} onClick={() => setQ({ id: s.id })} className={on ? 'bg-[#1B2130] cursor-pointer' : 'cursor-pointer hover:bg-[#141821]'}>
                        <Td className="font-mono-code font-medium"><button type="button" onClick={(e) => { e.stopPropagation(); setQ({ id: s.id }); }} aria-pressed={on} className="text-left">{s.id}</button></Td>
                        <Td className="font-mono-code text-[12.5px]">{s.sat} · {s.station}</Td>
                        <Td className="text-[#9AA3B2]">{s.tenant === 'Akashaveda' ? 'Operations' : s.tenant}{s.requestId && <span className="font-mono-code text-[12px] text-[#7C8594]"> · {s.requestId}</span>}</Td>
                        <Td><span className="flex items-center gap-2.5"><Meter className="w-[120px]" value={sg === 'RECEIVING' || sg === 'CHECKSUM_FAILED' ? n : s.chunksTotal} max={s.chunksTotal} color={STAGE[sg][2]} /><span className="font-mono-code text-[12px] text-[#9AA3B2]">{gb(s.sizeMb)}</span></span></Td>
                        <Td><Pill tone={STAGE[sg][1]}>{STAGE[sg][0]}</Pill></Td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><Td colSpan={5} className="text-[#7C8594]">No sessions yet.</Td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div ref={detailRef} className="flex-[1_1_320px] min-w-0">
          <Card title="Session detail" actions={sel && st && <Pill tone={STAGE[st][1]}>{STAGE[st][0]}</Pill>}>
            {!sel || !st ? <p className="text-[13px] text-[#7C8594]">Pick a session to follow it from the station to the customer.</p> : (
              <div className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1">
                  <span className="text-[18px] font-semibold font-mono-code">{sel.id}</span>
                  <span className="text-[13px] text-[#9AA3B2]">{sel.sat} over {sel.station} · for {sel.tenant === 'Akashaveda' ? 'operations' : sel.tenant}{sel.requestId && <>, request <span className="font-mono-code">{sel.requestId}</span></>} · started {utc(sel.startedAt)}</span>
                </div>
                <ol className="list-none m-0 px-3.5 pt-3.5 pb-0.5 rounded-xl bg-[#161A22] flex flex-col">
                  {steps(sel, now).map((x, i, all) => { const k = NODE[x.state]; return (
                    <li key={x.n} className="grid grid-cols-[22px_1fr_auto] gap-x-3 min-h-[46px]">
                      <span className="flex flex-col items-center">
                        <span className="w-[22px] h-[22px] rounded-full box-border flex items-center justify-center flex-none" style={{ background: k.bg, border: `2px solid ${k.b}` }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={k.c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={k.d} /></svg>
                        </span>
                        <span className="flex-1 w-[2px] my-1 rounded-[1px]" style={{ background: i === all.length - 1 ? 'transparent' : x.state === 'done' ? '#4ADE9A' : '#232936' }} />
                      </span>
                      <span className="flex flex-col gap-0.5 pt-0.5 text-[13px]"><span className={x.state === 'todo' ? 'text-[#9AA3B2]' : 'text-[#E9ECF1]'}>{x.n}</span><span className="text-[12px] text-[#7C8594]">{x.sub}</span></span>
                      <span className="font-mono-code text-[12px] text-[#7C8594] pt-[3px]">{x.t}</span>
                    </li>); })}
                </ol>
                {st === 'CHECKSUM_FAILED' && <p className="text-[13px] text-[#9AA3B2] leading-[1.5]">Chunks {sel.failedChunks.map((c, i) => <React.Fragment key={c}>{i ? (i === sel.failedChunks.length - 1 ? ' and ' : ', ') : ''}<span className="font-mono-code text-[#C9CED6]">{c}</span></React.Fragment>)} failed their checksum. Retry fetches them again from the {sel.station} recording. Nothing is delivered until every chunk matches.</p>}
                {sel.retries.length > 0 && <p className="text-[12.5px] text-[#7C8594]">{sel.retries.map((r) => `Retried ${r.chunks.length} chunk${r.chunks.length === 1 ? '' : 's'} at ${hm(r.at)} by ${r.by}`).join(' · ')}</p>}
                <div className="flex flex-wrap gap-2">
                  {!customer && <Button variant="secondary" className="flex-1" disabled={!mayOperate.allowed || st !== 'CHECKSUM_FAILED'} onClick={() => { retry(sel.id, user.name); audit(sel, 'CHUNK_RETRY', `${sel.id}: ${sel.failedChunks.length} chunks re-fetched from ${sel.station} recording`); }}><RotateCw size={14} /> Retry now</Button>}
                  {!customer && <Button className="flex-1" disabled={!mayOperate.allowed || st !== 'L0_READY'} onClick={() => setConfirmDeliver(true)}><Send size={14} /> Deliver</Button>}
                  <Button variant="secondary" className="flex-1" disabled={st !== 'L0_READY' && st !== 'DELIVERED'} onClick={() => download(sel)}><Download size={14} /> Manifest</Button>
                </div>
                <span className="text-[12px] text-[#7C8594] leading-[1.45]">
                  {!mayOperate.allowed ? `${mayOperate.reason} ` : ''}
                  {st === 'DELIVERED' ? `Delivered ${utc(sel.deliveredAt!)} as ${sel.productId}; the customer was notified by webhook and sees it in their portal.` : 'Deliver unlocks when the product is complete. The customer is notified by webhook and sees it in their portal.'} The manifest is a sample GeoJSON file.
                </span>
                <div className="flex flex-col gap-1.5 pt-1 border-t border-[#1A1E27]">
                  {!customer && <RoleLink to={`satellite?sat=${sel.sat}`} onNavigate={onNavigate}>Open {sel.sat}</RoleLink>}
                  {sel.requestId && !customer && <RoleLink to="plan" onNavigate={onNavigate}>Mission plan</RoleLink>}
                  {customer && <RoleLink to="customer" onNavigate={onNavigate}>Back to your portal</RoleLink>}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {confirmDeliver && sel && (
        <Modal title={`Deliver ${sel.id}?`} onClose={() => setConfirmDeliver(false)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setConfirmDeliver(false)}>Not yet</Button>
            <Button onClick={() => {
              const p = deliver(sel.id, user.name);
              if (p) {
                if (sel.requestId) useRequestStore.getState().update(sel.requestId, { state: 'DELIVERED', productId: p.id });
                audit(sel, 'PRODUCT_DELIVER', `${p.id} delivered to ${sel.tenant}${sel.requestId ? ` for ${sel.requestId}` : ''}`);
              }
              setConfirmDeliver(false);
            }}>Deliver</Button></>}>
          <p className="text-[13.5px] text-[#C9CED6]">Publishes the L0 product ({gb(sel.sizeMb)}) to {sel.tenant}, calls their webhook and shows it in their portal. A delivered product cannot be withdrawn from here.</p>
        </Modal>
      )}
    </>
  );
};
