import React, { useState } from 'react';
import { Button } from '../../components/atoms/Button';
import { Banner, Card, PageHead, Td, Th } from '../../components/molecules/Page';
import { DELIVERIES, FLEET, PASSES, STATIONS, tenantOf } from '../../data/fleet';
import { useAuthStore } from '../../store/useAuthStore';
import { useFleetStore } from '../../store/useFleetStore';
import { useUIStore } from '../../store/useUIStore';

/** S24 · Customer portal — tenant-scoped; no command endpoints (BR-S24-01/02). */
export const CustomerPortal: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const cvt = useFleetStore((s) => s.cvt);
  const setTenant = useUIStore((s) => s.setTenant);
  const user = useAuthStore((s) => s.user);
  // The tenant is derived from who is signed in, never from a route or a menu —
  // that is what C-06 actually means: identity decides scope, not navigation.
  const TENANT = tenantOf(user.satellite_scope[0] ?? '');
  const [requests, setRequests] = useState<{ id: string; area: string; window: string; state: string }[]>([
    { id: 'TR-5526', area: 'Ludhiana wheat belt', window: 'Next 48 h', state: 'SCHEDULED' },
  ]);
  const [area, setArea] = useState('');

  // Every list below is filtered to the tenant — C-06 made visible on screen.
  const sats = FLEET.filter((s) => tenantOf(s.sat_id) === TENANT);
  const ids = sats.map((s) => s.sat_id);
  const passes = PASSES.filter((p) => ids.includes(p.sat_id));
  const deliveries = DELIVERIES.filter((d) => d.tenant === TENANT);

  React.useEffect(() => { setTenant(TENANT); return () => setTenant('Akashaveda'); }, [setTenant, TENANT]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!area.trim()) return;
    setRequests((r) => [{ id: `TR-${5527 + r.length}`, area, window: 'Next 48 h', state: 'SUBMITTED' }, ...r]);
    setArea('');
  };

  return (
    <>
      <PageHead title={TENANT} sub={`Tenant-scoped view · ${sats.length} satellites`} />

      <Banner kind="info" lead="Tenant isolation.">
        This view can only read {TENANT} data. No command endpoints are exposed to customer credentials.
      </Banner>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        <div className="flex flex-col gap-4">
          <Card title="My satellites">
            <div className="grid grid-cols-2 gap-3">
              {sats.map((s) => {
                const soc = cvt[s.sat_id]?.BAT_SOC?.eu_value;
                return (
                  <div key={s.sat_id} className="border border-[#2A3B52] rounded p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono-code text-[12.5px] text-[#4DACFF]">{s.sat_id}</span>
                      <span className={s.health_state === 'NOMINAL' ? 'text-[#56F000] text-[11px]' : 'text-[#FCE83A] text-[11px]'}>{s.health_state}</span>
                    </div>
                    <div className="font-display-title text-[24px] font-bold tabular-nums">
                      {soc ? soc.toFixed(0) : '—'}<span className="text-[13px] text-[#A3B1C2] ml-1">% SOC</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Deliveries">
            <table className="w-full border-collapse">
              <thead><tr><Th>Delivery</Th><Th>Satellite</Th><Th>Size</Th><Th>State</Th></tr></thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.delivery_id} className="cursor-pointer hover:bg-[#172434]" onClick={() => onNavigate(`payload?id=${d.delivery_id}`)}>
                    <Td className="font-mono-code text-[12.5px] text-[#4DACFF]">{d.delivery_id}</Td>
                    <Td className="font-mono-code text-[12.5px]">{d.sat_id}</Td>
                    <Td className="tabular-nums">{d.size_mb} MB</Td>
                    <Td>{d.state}</Td>
                  </tr>
                ))}
                {deliveries.length === 0 && <tr><Td className="text-[#A3B1C2]">No deliveries yet.</Td><Td>{''}</Td><Td>{''}</Td><Td>{''}</Td></tr>}
              </tbody>
            </table>
          </Card>

          <Card title="Tasking requests">
            <form onSubmit={submit} className="flex gap-2 mb-3">
              <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area of interest"
                aria-label="Area of interest"
                className="flex-1 h-9 bg-[#0A1018] border border-[#2A3B52] focus:border-[#2DCCFF] rounded-[2px] px-2.5 text-[14px] outline-none" />
              <Button type="submit">Submit request</Button>
            </form>
            <table className="w-full border-collapse">
              <thead><tr><Th>Request</Th><Th>Area</Th><Th>Window</Th><Th>State</Th></tr></thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <Td className="font-mono-code text-[12.5px] text-[#4DACFF]">{r.id}</Td>
                    <Td>{r.area}</Td>
                    <Td className="text-[#A3B1C2]">{r.window}</Td>
                    <Td className={r.state === 'SCHEDULED' ? 'text-[#56F000]' : 'text-[#9C9AEC]'}>{r.state}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Upcoming passes">
            {passes.map((p) => (
              <div key={p.session_id} className="flex items-center justify-between py-1.5 text-[13px]">
                <span className="font-mono-code text-[12.5px]">{p.sat_id}</span>
                <span className="text-[#A3B1C2]">{STATIONS.find((s) => s.id === p.station_id)?.name}</span>
                <span className="font-mono-code tabular-nums">{p.aos_utc.slice(11, 16)}</span>
              </div>
            ))}
            {passes.length === 0 && <span className="text-[13px] text-[#A3B1C2]">No passes booked.</span>}
          </Card>

          <Card title="API keys and webhooks">
            <div className="flex flex-col gap-2 text-[13px]">
              <div className="flex justify-between"><span>Client ID</span><span className="font-mono-code text-[12px]">{TENANT.toLowerCase().split(' ')[0]}-prod-01</span></div>
              <div className="flex justify-between"><span>Secret</span><span className="font-mono-code text-[12px] text-[#5F7087]">never displayed</span></div>
              <div className="flex justify-between"><span>Webhook</span><span className="font-mono-code text-[12px]">/l0-ready</span></div>
              <div className="flex justify-between"><span>Scopes</span><span className="font-mono-code text-[12px]">tasking:write products:read</span></div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
};
