import React, { useState } from 'react';
import { Button } from '../../components/atoms/Button';
import { Pill, type Tone } from '../../components/atoms/Badge';
import { Card, KpiRow, KpiTile, PageHead, SampleTag } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { FLEET } from '../../data/fleet';
import { can } from '../../auth/policy';
import { useAuthStore } from '../../store/useAuthStore';
import { isFinalStatus, useMissionStore, type CommandRecord } from '../../store/useMissionStore';
import { useLinkStore } from '../../store/useLinkStore';
import { toast } from '../../store/useToastStore';
import { cancelCommand } from '../../live/release';
import { RouteLink, contactOf, isSat, paramText, setHashParams, useHashParams, useNow } from './gates';
import { Select } from '../../components/molecules/Select';

const FOP_LABEL: Record<string, string> = { S1: 'Active', S2: 'Retransmit', S3: 'Retransmit wait', S4: 'Initialising', S5: 'Initialising (BC)', S6: 'Initial' };
const K = 10;

/** S15 · Uplink & COP-1 for one satellite (from the URL): FOP-1 state, window, queue, CLCW. */
export const CommandQueue: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const params = useHashParams();
  const sat = isSat(params.sat) ? params.sat : 'AKV-03';
  const role = useAuthStore((s) => s.activeRole);
  const user = useAuthStore((s) => s.user);
  const commands = useMissionStore((s) => s.commands);
  const fop = useMissionStore((s) => s.fop[sat]) ?? useMissionStore.getState().fopOf(sat);
  const fopDirective = useMissionStore((s) => s.fopDirective);
  const live = useLinkStore((s) => s.mode === 'live' && s.liveSatellites.includes(sat));
  const now = useNow(1000);
  const contact = contactOf(sat, now);
  const [cancelling, setCancelling] = useState<CommandRecord | null>(null);
  const [directive, setDirective] = useState<'UNLOCK' | 'SET_VR' | null>(null);

  const mayCommand = can('command:send', role);
  const forSat = commands.filter((c) => c.sat_id === sat);
  const queue = forSat.filter((c) => !isFinalStatus(c.status) && c.status !== 'DRAFT');
  const doneThisPass = forSat.filter((c) => c.status === 'COMPLETED' && Date.parse(c.utc) >= (contact.aos ?? now - 3600_000)).length;
  const outstanding = Math.max(0, fop.vS - fop.nnR);
  const waitingToSend = queue.filter((c) => c.status === 'RELEASED' && !c.radiated).length;

  const cells = Array.from({ length: K }, (_, i) => {
    const n = fop.nnR - 2 + i;
    const s = n < fop.nnR ? 'ACKED' : n < fop.vS ? 'SENT' : n === fop.vS && waitingToSend ? 'NEXT' : 'FREE';
    return { n, s };
  });
  const CELL: Record<string, [string, string, string]> = {
    ACKED: ['Acked', 'rgba(74,222,154,0.12)', '#4ADE9A'], SENT: ['Sent', 'rgba(108,184,255,0.12)', '#8CC8FF'],
    NEXT: ['Next', 'rgba(242,140,40,0.14)', '#F2A65A'], FREE: ['Free', '#161A22', '#6B7383'],
  };

  const stateOf = (c: CommandRecord): [string, Tone] =>
    c.status === 'AWAITING_APPROVAL' ? ['Waiting approval', 'action']
    : c.status === 'RELEASED' ? (c.radiated ? ['Sent', 'info'] : ['Queued', 'neutral'])
    : c.status === 'ACCEPTED' ? ['Acknowledged', 'info'] : c.status === 'STARTED' ? ['Accepted on board', 'info'] : [c.status.toLowerCase(), 'neutral'];

  const doCancel = async (c: CommandRecord) => {
    setCancelling(null);
    const why = await cancelCommand(c.command_id);
    if (why) toast.warning(`Not cancelled: ${c.mnemonic}`, { body: why }); else toast.info(`Cancelled: ${c.mnemonic} on ${sat}`);
  };

  const recovery = !fop.lockout ? 'Not needed: lockout is 0.' : !mayCommand.allowed ? mayCommand.reason : undefined;

  return (
    <>
      <PageHead title={`${sat} forward link`}
        sub={<>Uplink and COP-1 · {live ? 'commands and acknowledgements live from the Command Gateway' : 'built-in simulation'} · TC virtual channel 0{contact.inContact ? ` · ${contact.station}` : ' · not in contact'}</>}
        actions={<>
          <label className="flex items-center gap-2.5 h-[38px] rounded-[10px] bg-[#11141B] border border-[#1A1E27] px-3 text-[13px]">
            <span className="text-[#7C8594]">Satellite</span>
            <Select aria-label="Satellite" value={sat} onChange={(e) => setHashParams({ sat: e.target.value })} className="bg-transparent text-[#E9ECF1] font-mono-code text-[13.5px] outline-none">
              {FLEET.map((f) => <option key={f.sat_id} value={f.sat_id} className="bg-[#11141B]">{f.sat_id}</option>)}
            </Select>
          </label>
          <RouteLink as="button" to={`command?sat=${sat}`} onNavigate={onNavigate}>Command console</RouteLink>
        </>} />

      <KpiRow>
        <KpiTile label="FOP-1 state" value={<>{FOP_LABEL[fop.state]} <span className="text-[14px] text-[#7C8594] font-normal">{fop.state}</span></>} tone={fop.state === 'S1' ? 'ok' : 'warn'} sub={<SampleTag>Console model</SampleTag>} />
        <KpiTile label="Frames outstanding" value={<>{outstanding} <span className="text-[14px] text-[#7C8594] font-normal">of {K}</span></>} />
        <KpiTile label="Retransmissions this pass" value={fop.retransmissions ?? 0} />
        <KpiTile label="Commands in queue" value={queue.length} sub={`${doneThisPass} completed this pass`} />
        <KpiTile label="Lease holder" value={<span className="font-mono-code text-[20px]">{fop.owner}</span>} sub={`fencing epoch ${fop.epoch}`} />
      </KpiRow>

      <Card title={<span className="flex items-center gap-2.5">Transmission window <Pill className="font-mono-code">K = {K}</Pill></span>}
        actions={<span className="font-mono-code text-[12.5px] text-[#9AA3B2]">V(S) {fop.vS} · N(R) {fop.nnR} · T1 3.0 s</span>} className="mb-4">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))' }}>
          {cells.map(({ n, s }) => (
            <div key={n} className="h-16 rounded-xl flex flex-col justify-center items-center gap-1" style={{ background: CELL[s][1] }}>
              <span className="font-mono-code text-[14px]" style={{ color: s === 'FREE' ? '#7C8594' : '#E9ECF1' }}>{n}</span>
              <span className="text-[11.5px]" style={{ color: CELL[s][2] }}>{CELL[s][0]}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3.5 text-[12px] text-[#9AA3B2] mt-3">
          <span><span className="text-[#4ADE9A]">●</span> Acked</span><span><span className="text-[#6CB8FF]">●</span> Sent, awaiting ack</span><span><span className="text-[#F28C28]">●</span> Next to send</span><span><span className="text-[#3A4252]">●</span> Free</span>
        </div>
        <p className="text-[12.5px] text-[#7C8594] leading-[1.5] mt-2">Acknowledged frames slide out of the window. A frame not acknowledged within T1 is sent again, up to 3 times; then outstanding commands fail and you are told.</p>
      </Card>

      <div className="flex flex-wrap gap-4 items-start">
        <Card title="Queue" actions={<span className="text-[12px] text-[#7C8594]">{queue.length} command{queue.length === 1 ? '' : 's'}</span>} flush className="flex-[999_1_560px] min-w-0">
          <div className="overflow-x-auto px-2">
            <table className="w-full min-w-[560px] text-[13px] border-separate" style={{ borderSpacing: '0 4px' }}>
              <thead><tr className="text-left text-[12px] text-[#6B7383]"><th className="px-3 py-1 font-normal">Command</th><th className="px-3 py-1 font-normal">From</th><th className="px-3 py-1 font-normal">State</th><th className="px-3 py-1 font-normal text-right">Action</th></tr></thead>
              <tbody>
                {queue.map((c) => {
                  const [label, tone] = stateOf(c);
                  const cancellable = c.status === 'AWAITING_APPROVAL' || (c.status === 'RELEASED' && !c.radiated);
                  return (
                    <tr key={c.command_id} data-queue={c.command_id} className="bg-[#141821]">
                      <td className="px-3 py-2.5 rounded-l-[10px] font-mono-code text-[12.5px]">{c.mnemonic} {paramText(c.params)}<span className="block text-[11.5px] text-[#7C8594]">{c.command_id}</span></td>
                      <td className="px-3 py-2.5 text-[#9AA3B2]">{c.source && c.source !== 'Command console' ? `${c.source} · ` : ''}{c.requested_by}</td>
                      <td className="px-3 py-2.5"><Pill tone={tone}>{label}</Pill></td>
                      <td className="px-3 py-2 rounded-r-[10px] text-right">
                        {cancellable
                          ? <Button size="sm" variant="danger" disabled={!mayCommand.allowed} reason={mayCommand.allowed ? undefined : mayCommand.reason} onClick={() => setCancelling(c)}>Cancel</Button>
                          : <span className="inline-flex items-center gap-2"><span className="text-[12px] text-[#7C8594]">Already radiated</span><Button size="sm" variant="secondary" disabled>Cancel</Button></span>}
                      </td>
                    </tr>
                  );
                })}
                {queue.length === 0 && <tr><td colSpan={4} className="px-3 py-3.5 bg-[#141821] rounded-[10px] text-[#7C8594]">Queue empty for {sat}.</td></tr>}
              </tbody>
            </table>
            <p className="px-3 pt-1 pb-3 text-[12px] text-[#7C8594]">A command can be cancelled until it is radiated.</p>
          </div>
        </Card>

        <Card title="CLCW from the spacecraft" actions={<SampleTag>{live ? 'FOP-1 not published by backend yet' : 'Simulated'}</SampleTag>} className="flex-[1_1_320px] min-w-0">
          <div className="flex flex-col gap-1">
            {([['Lockout', fop.lockout ? '1' : '0', fop.lockout], ['Wait', fop.wait ? '1' : '0', fop.wait], ['Retransmit', fop.retransmit ? '1' : '0', fop.retransmit], ['Report value V(R)', String(fop.nnR), null], ['FARM-B counter', String(fop.farmB), null]] as [string, string, boolean | null][]).map(([k, v, bad]) => (
              <div key={k} className="rounded-[10px] bg-[#161A22] px-3 py-[9px] flex justify-between items-center text-[13px]">
                <span className="text-[#C9CED6]">{k}</span>
                <span className="font-mono-code" style={{ color: bad === null ? '#E9ECF1' : bad ? '#FF7A7A' : '#4ADE9A' }}>{v}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 pt-4">
            <span className="text-[12px] text-[#7C8594]">Recovery, only when the receiver locks out</span>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" disabled={!!recovery} onClick={() => setDirective('UNLOCK')}>Unlock</Button>
              <Button size="sm" variant="secondary" disabled={!!recovery} onClick={() => setDirective('SET_VR')}>Set V(R)</Button>
              {recovery && <span className="text-[12px] text-[#9AA3B2]">{recovery}</span>}
            </div>
          </div>
        </Card>
      </div>

      {cancelling && (
        <Modal title={`Cancel ${cancelling.mnemonic}?`} onClose={() => setCancelling(null)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setCancelling(null)}>Keep it</Button><Button variant="danger" onClick={() => void doCancel(cancelling)}>Cancel command</Button></>}>
          <p className="text-[13.5px] text-[#C9CED6]"><span className="font-mono-code">{cancelling.command_id} {cancelling.mnemonic} {paramText(cancelling.params)}</span>, raised by {cancelling.requested_by}, has not been radiated. It is withdrawn{cancelling.requested_by !== user.name ? ` and ${cancelling.requested_by} sees that you cancelled it` : ''}.</p>
        </Modal>
      )}
      {directive && (
        <Modal title={directive === 'UNLOCK' ? 'Send the Unlock directive' : 'Send Set V(R)'} onClose={() => setDirective(null)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setDirective(null)}>Cancel</Button><Button variant="warning" onClick={() => { fopDirective(sat, directive, user.name); setDirective(null); toast.info(`${directive === 'UNLOCK' ? 'Unlock' : 'Set V(R)'} sent to ${sat}`); }}>Send directive</Button></>}>
          <p className="text-[13.5px] text-[#C9CED6]">A BC frame bypasses the sequence check to {directive === 'UNLOCK' ? 'clear the FARM lockout' : `set the receiver's V(R) to ${fop.vS}`} on {sat}. Outstanding frames are then retransmitted. Recorded in the audit ledger.</p>
        </Modal>
      )}
    </>
  );
};
