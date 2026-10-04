import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Download, KeyRound } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Pill, StatusBadge, Tone } from '../../components/atoms/Badge';
import { Banner, Card, PageHead, SampleTag, Segmented, Tile } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { can } from '../../auth/policy';
import { FLEET, STATIONS, TENANTS, tenantOf } from '../../data/fleet';
import { satContacts } from '../../orbit/contacts';
import { tenantOfPerson, useAuthStore } from '../../store/useAuthStore';
import { useFleetStore } from '../../store/useFleetStore';
import { useDeliveryStore, productManifest, saveBlob } from '../../store/useDeliveryStore';
import { useMissionStore } from '../../store/useMissionStore';
import { ImagingRequest, useRequestStore } from '../../store/useRequestStore';
import { useUIStore } from '../../store/useUIStore';
import { toast } from '../../store/useToastStore';
import { hm, ImagingRequestForm, inputCls, RoleLink, useHashParams, utc } from '../mission/shared';

/** What the customer sees for a request: plain words, no internal plan jargon. */
function custStatus(r: ImagingRequest): [string, string, Tone] {
  const p = r.placement;
  switch (r.state) {
    case 'NEW': return ['Received', `sent ${utc(r.createdAt)}, planner reviewing`, 'action'];
    case 'PLACED': return ['Planned', p ? `${p.sat} ${utc(p.at)}, awaiting final approval` : 'awaiting final approval', 'info'];
    case 'NOT_PLACED': return ['Not yet planned', r.reason ?? 'the planner will try again', 'warn'];
    case 'DROPPED': return ['Not possible', r.reason ?? 'dropped by the planner', 'neutral'];
    case 'SCHEDULED': return ['Scheduled', p ? `${p.sat} ${utc(p.at)}` : 'in the approved plan', 'ok'];
    case 'ACQUIRED': return ['Acquired', 'processing', 'info'];
    default: return ['Delivered', 'product ready below', 'neutral'];
  }
}

/** S24 · Customer portal: tenant-scoped satellites, imaging requests, products and API access. No command endpoints. */
export const CustomerPortal: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const setTenant = useUIStore((s) => s.setTenant);
  const admin = role === 'System Administrator';
  const [q, setQ] = useHashParams();
  // Identity decides scope: customers get their own tenant; only an administrator may pick one (support view).
  const tenant = admin && q.tenant && TENANTS.includes(q.tenant) ? q.tenant : admin ? 'Nabhas Agritech' : tenantOfPerson(user);
  const maySubmit = can('tasking:submit', role);
  const requests = useRequestStore((s) => s.requests).filter((r) => r.tenant === tenant);
  const { products, sessions, api, rotateSecret, setWebhook } = useDeliveryStore();
  const mine = products.filter((p) => p.tenant === tenant);
  const keys = api[tenant];
  const [rotate, setRotate] = useState<'confirm' | { secret: string } | null>(null);
  const [hook, setHook] = useState(keys?.webhook ?? '');
  useEffect(() => setHook(keys?.webhook ?? ''), [tenant]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTenant(tenant); return () => setTenant('Akashaveda'); }, [setTenant, tenant]);

  // Live health from the fleet store (the same pill the operators see), not the static catalogue.
  const live = useFleetStore((s) => s.satellites);
  const sats = FLEET.filter((s) => tenantOf(s.sat_id) === tenant).map((s) => live[s.sat_id] ?? s);
  const now = Date.now();
  const nextPass = useMemo(() => Object.fromEntries(sats.map((s) => [s.sat_id, satContacts(s.sat_id, now, 24 * 3600_000).find((c) => c.aos > now && STATIONS.find((x) => x.id === c.station)?.state !== 'MAINTENANCE')])), [tenant, Math.floor(now / 600_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastImage = (sat: string) => { const s = sessions.filter((x) => x.sat === sat).sort((a, b) => b.startedAt - a.startedAt)[0]; return s ? utc(s.startedAt) : 'none yet'; };
  const hookErr = !/^https:\/\/[^\s/]+\.[^\s]+$/.test(hook) ? 'Use an https:// URL.' : '';
  const mayKeys = admin ? { allowed: false, reason: 'Keys belong to the customer; an administrator cannot rotate them from the support view.' } : { allowed: true };
  const audit = (what: string, summary: string) => useMissionStore.getState().appendAudit({
    timestamp_utc: new Date().toISOString(), operator_id: user.id, operator_name: user.name, sat_id: '—', command_mnemonic: what,
    procedure_id: '—', procedure_version: '—', sequence_count: 0, result: 'ACK', params_summary: `${tenant}: ${summary}`,
  });

  return (
    <>
      <PageHead title="Your satellites and imagery"
        sub={`Only ${tenant} data is visible here. Spacecraft operations stay with Akashaveda.`}
        actions={admin && <Segmented value={tenant} onChange={(v) => setQ({ tenant: v })} options={TENANTS.filter((t) => t !== 'Akashaveda').map((t) => ({ value: t, label: t }))} />} />
      {admin && <Banner kind="advisory" lead="Support view.">You are seeing {tenant}'s portal as System Administrator. Requests and key changes stay with the customer.</Banner>}

      <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        {sats.map((s) => { const np = nextPass[s.sat_id]; return (
          <Card key={s.sat_id}>
            <div className="flex flex-col gap-3.5">
              <span className="flex items-center gap-3"><span className="font-mono-code text-[18px] font-medium mr-auto">{s.sat_id}</span><StatusBadge status={s.health_state} label={s.health_state === 'NOMINAL' ? 'Healthy' : undefined} /></span>
              <div className="grid grid-cols-2 gap-2.5">
                <Tile><span className="block text-[12px] text-[#7C8594]">Next pass</span><span className="font-mono-code text-[15px]">{np ? `${np.station} ${hm(np.aos)}` : 'none in 24 h'}</span></Tile>
                <Tile><span className="block text-[12px] text-[#7C8594]">Last image</span><span className="text-[15px]">{lastImage(s.sat_id)}</span></Tile>
              </div>
            </div>
          </Card>); })}
        {sats.length === 0 && <Card><p className="text-[13px] text-[#7C8594]">No satellites for {tenant}.</p></Card>}
      </div>

      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-[999_1_560px] min-w-0 flex flex-col gap-4">
          <Card title="Imaging requests">
            <div className="flex flex-col gap-2.5">
              {requests.map((r) => { const [s, sub, tone] = custStatus(r); return (
                <div key={r.id} data-request={r.id} data-state={r.state} className="contents"><Tile className="flex flex-wrap items-center gap-3 text-[13px]">
                  <span className="font-mono-code text-[#C9CED6] w-[72px]">{r.id}</span>
                  <span className="flex-[1_1_200px] flex flex-col gap-0.5"><span className="text-[14px]">{r.target}</span><span className="text-[12px] text-[#7C8594]">{sub}</span></span>
                  <Pill tone={tone}>{s}</Pill>
                </Tile></div>); })}
              {requests.length === 0 && <p className="text-[13px] text-[#7C8594]">No requests yet.</p>}
            </div>
          </Card>
          <Card title="New imaging request">
            <ImagingRequestForm tenant={tenant} requestedBy={user.name} blocked={maySubmit.allowed ? undefined : maySubmit.reason} />
          </Card>
        </div>

        <div className="flex-[1_1_320px] min-w-0 flex flex-col gap-4">
          <Card title="Products ready" actions={<><SampleTag /><Pill>{mine.length}</Pill></>}>
            <div className="flex flex-col gap-2.5">
              {mine.map((p) => { const r = requests.find((x) => x.id === p.requestId); return (
                <div key={p.id} data-product={p.id} data-session={p.sessionId} className="contents"><Tile className="flex justify-between gap-3 items-center text-[13px]">
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[14px]"><span className="font-mono-code">{p.requestId ?? p.id}</span> L0 product</span>
                    <span className="text-[12px] text-[#7C8594]">{(p.sizeMb / 1000).toFixed(1)} GB · {p.sat} · {utc(p.createdAt)}</span>
                    <RoleLink to={`payload?id=${p.sessionId}`} onNavigate={onNavigate}>Delivery {p.sessionId}</RoleLink>
                  </span>
                  <Button size="sm" variant="secondary" aria-label={`Download ${p.requestId ?? p.id} manifest`} onClick={() => saveBlob(productManifest(p, r ? { name: r.target, lat: r.lat, lon: r.lon } : undefined), `${p.id}_manifest_SAMPLE.geojson`)}><Download size={14} /> Download</Button>
                </Tile></div>); })}
              {mine.length === 0 && <p className="text-[13px] text-[#7C8594]">Nothing delivered yet.</p>}
              <p className="text-[12px] text-[#7C8594]">Downloads are sample GeoJSON manifests; the L0 files themselves are not served by this console yet.</p>
            </div>
          </Card>

          {keys && (
            <Card title="API keys and webhook" actions={<SampleTag />}>
              <div className="flex flex-col gap-3 text-[13px]">
                <div className="flex justify-between gap-3"><span className="text-[#9AA3B2]">Client ID</span><span className="font-mono-code text-[12.5px]">{keys.clientId}</span></div>
                <div className="flex justify-between gap-3"><span className="text-[#9AA3B2]">Secret</span><span className="font-mono-code text-[12.5px]">••••{keys.secretLast4}</span></div>
                <div className="flex justify-between gap-3"><span className="text-[#9AA3B2]">Rotated</span><span>{utc(keys.rotatedAt)} · {keys.rotatedBy}</span></div>
                <div className="flex justify-between gap-3"><span className="text-[#9AA3B2]">Scopes</span><span className="font-mono-code text-[12px]">tasking:write products:read</span></div>
                <Button variant="secondary" disabled={!mayKeys.allowed} reason={mayKeys.reason} onClick={() => setRotate('confirm')}><KeyRound size={14} /> Rotate secret</Button>
                <form className="flex flex-col gap-1.5 pt-2 border-t border-[#1A1E27]" onSubmit={(e) => { e.preventDefault(); if (hookErr || !mayKeys.allowed) return; setWebhook(tenant, hook); audit('WEBHOOK_SET', hook); toast.success('Webhook saved', { body: hook }); }}>
                  <label className="flex flex-col gap-1.5 text-[12px] text-[#7C8594]">Webhook for product.delivered
                    <input value={hook} onChange={(e) => setHook(e.target.value)} disabled={!mayKeys.allowed} className={`${inputCls} font-mono-code text-[12.5px]`} />
                  </label>
                  <Button size="sm" type="submit" variant="secondary" disabled={!mayKeys.allowed || !!hookErr || hook === keys.webhook} reason={mayKeys.allowed && hookErr ? hookErr : undefined}>Save webhook</Button>
                </form>
                {keys.calls.length > 0 && <div className="flex flex-col gap-1 text-[12px] text-[#9AA3B2]"><span className="text-[#7C8594]">Recent calls</span>{keys.calls.slice(0, 3).map((c, i) => <span key={i}><span className="font-mono-code">{hm(c.at)}</span> {c.event} → {c.status}</span>)}</div>}
              </div>
            </Card>
          )}
        </div>
      </div>

      {rotate === 'confirm' && (
        <Modal title="Rotate the API secret?" onClose={() => setRotate(null)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setRotate(null)}>Keep current secret</Button>
            <Button variant="danger" onClick={() => { const secret = rotateSecret(tenant, user.name); audit('API_SECRET_ROTATE', `secret for ${keys?.clientId} rotated`); setRotate({ secret }); }}>Rotate now</Button></>}>
          <p className="text-[13.5px] text-[#C9CED6]">The current secret stops working immediately. Integrations using <span className="font-mono-code">{keys?.clientId}</span> fail until they are given the new one.</p>
        </Modal>
      )}
      {rotate && rotate !== 'confirm' && (
        <Modal title="New secret" onClose={() => setRotate(null)} footer={<Button onClick={() => setRotate(null)}>I have stored it</Button>}>
          <p className="text-[13.5px] text-[#C9CED6]">Copy it now. It is shown once and never again.</p>
          <div className="flex items-center gap-2"><code className="flex-1 font-mono-code text-[12.5px] break-all bg-[#161A22] rounded-lg p-3">{rotate.secret}</code>
            <Button size="sm" variant="secondary" aria-label="Copy secret" onClick={() => { navigator.clipboard?.writeText(rotate.secret).catch(() => {}); toast.info('Secret copied'); }}><Copy size={14} /></Button></div>
        </Modal>
      )}
    </>
  );
};
