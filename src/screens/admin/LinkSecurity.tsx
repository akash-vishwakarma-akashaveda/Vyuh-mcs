import React, { useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '../../components/atoms/Button';
import { Pill, Tone } from '../../components/atoms/Badge';
import { Banner, Card, Drawer, KpiRow, KpiTile, PageHead, SampleTag, Td, Th, Tile } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import {
  KEY_SATS, Key, KeyRequest, MASTER_DAYS, SESSION_DAYS, SdlsMode, SecurityAssociation, approveKeyBlock, keyGate, useKeyStore,
} from '../../store/useKeyStore';
import { useAuthStore } from '../../store/useAuthStore';
import { parseHash } from '../../router/routes';
import { utc } from '../../store/govern';
import { toast } from '../../store/useToastStore';
import { Select } from '../../components/molecules/Select';
import { Stepper } from '../../components/molecules/Stepper';

const MODE: Record<SdlsMode, string> = { AUTH: 'Authentication only', AUTH_ENC: 'Authenticated encryption' };
const KEY_TONE: Record<Key['state'], Tone> = { ACTIVE: 'ok', PRE_ACTIVE: 'info', DEACTIVATED: 'neutral', COMPROMISED: 'crit' };
const REQ_LABEL: Record<KeyRequest['kind'], string> = { OTAR: 'OTAR rekey', REVOKE: 'Revoke key', CONFIG: 'SDLS configuration' };
const inputCls = 'h-9 rounded-[10px] bg-[#0D1016] border border-[#232936] px-3 text-[13px] text-[#E9ECF1] outline-none focus:border-[#6CB8FF]';
const days = (iso: string) => Math.round((Date.parse(iso) - Date.now()) / 86_400_000);
const say = (err: string | null, ok: string, body?: string) => (err ? toast.warning('Not done', { body: err }) : toast.success(ok, { body }));

/** S33 · Link security and keys — CCSDS SDLS security associations, key inventory, rotation and OTAR. */
export const LinkSecurity: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const { sa, keys, requests, request, approve, close } = useKeyStore();
  useAuthStore((s) => s.activeRole); // re-render gates on role change
  const meId = useAuthStore((s) => s.user.id);
  const gate = keyGate();
  const satFilter = parseHash().params.sat ?? '';
  const [editSa, setEditSa] = useState<SecurityAssociation | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; label: string; run: () => string | null; ok: string } | null>(null);

  const pending = requests.filter((r) => r.state === 'PENDING');
  const active = keys.filter((k) => k.state === 'ACTIVE');
  const inventory = keys.filter((k) => !satFilter || k.satId === satFilter);
  const schedule = active.filter((k) => k.type === 'SESSION').sort((a, b) => a.expires.localeCompare(b.expires));

  const askOtar = (satId: string) => setConfirm({
    title: `Request OTAR rekey for ${satId}`, label: 'Request rekey', ok: 'Rekey requested',
    body: `A new session key for ${satId} is generated, wrapped under its master key and uplinked (CCSDS 355.1 OTAR). The current session key is deactivated once a second person applies the request.`,
    run: () => request({ kind: 'OTAR', satId, detail: `Over-the-air rekey: new session key wrapped under MK-${satId}-01` }),
  });

  return (
    <>
      <PageHead title="Link security and keys"
        sub="CCSDS SDLS security associations for each satellite, the keys behind them, and their rotation. Every key change needs a second person and is written to the audit ledger."
        actions={<SampleTag>Sample keys · no HSM</SampleTag>} />

      {gate && <Banner kind="info">{gate} You can read this page; changes are refused.</Banner>}

      <KpiRow>
        <KpiTile value={sa.length} label="Security associations" sub="one per satellite, on the TC virtual channel" />
        <KpiTile value={sa.filter((s) => s.mode === 'AUTH_ENC').length} label="With encryption" sub={`${sa.filter((s) => s.mode === 'AUTH').length} authentication only`} />
        <KpiTile value={schedule.filter((k) => days(k.expires) <= 7).length} label="Session keys due in 7 days" tone={schedule.some((k) => days(k.expires) <= 7) ? 'warn' : 'plain'} />
        <KpiTile value={pending.length} label="Key changes waiting" sub="need a second person" tone={pending.length ? 'action' : 'plain'} />
      </KpiRow>

      <div className="flex flex-wrap gap-4 items-start mb-5">
        <Card className="flex-[999_1_560px] min-w-0" title="SDLS configuration" flush>
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full min-w-[680px] border-collapse">
              <thead><tr><Th>Satellite</Th><Th className="text-right">SPI</Th><Th>Mode</Th><Th>Algorithm</Th><Th className="text-right">Anti-replay window</Th><Th /></tr></thead>
              <tbody>
                {sa.map((s) => (
                  <tr key={s.satId}>
                    <Td className="font-mono-code text-[#E9ECF1]">{s.satId}</Td>
                    <Td className="text-right font-mono-code">{s.spi}</Td>
                    <Td><Pill tone={s.mode === 'AUTH_ENC' ? 'ok' : 'info'}>{MODE[s.mode]}</Pill></Td>
                    <Td className="font-mono-code text-[12px]">{s.algorithm}</Td>
                    <Td className="text-right font-mono-code">{s.arsnWindow} frames</Td>
                    <Td className="text-right"><Button size="sm" variant="ghost" disabled={!!gate} onClick={() => setEditSa(s)}>Change</Button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex-[1_1_320px] min-w-0 flex flex-col gap-4">
          <Card title="Key changes waiting" actions={pending.length > 0 && <Pill tone="action">Needs a second person</Pill>}>
            {pending.length === 0 && <p className="text-[13px] text-[#7C8594]">Nothing waiting.</p>}
            <div className="flex flex-col gap-3">
              {pending.map((r) => {
                const block = approveKeyBlock(r);
                const mine = r.requestedBy === meId;
                return (
                  <Tile key={r.id} className="flex flex-col gap-2">
                    <span className="flex items-center justify-between gap-2"><span className="text-[14px] font-medium">{REQ_LABEL[r.kind]} · <span className="font-mono-code">{r.satId}</span></span><span className="font-mono-code text-[12px] text-[#7C8594]">{r.id}</span></span>
                    <span className="text-[12.5px] text-[#9AA3B2]">{r.detail}</span>
                    <span className="text-[12px] text-[#7C8594]">Requested by {r.requestedByName} {utc(r.at)}</span>
                    <Button size="sm" onClick={() => say(approve(r.id), 'Key change applied', `${r.id} · ${r.satId}`)} disabled={!!block} reason={block ?? undefined}>Apply change</Button>
                    <Button size="sm" variant="danger" className="self-start" disabled={!!gate}
                      onClick={() => say(close(r.id, mine ? 'WITHDRAWN' : 'REJECTED'), mine ? 'Request withdrawn' : 'Request rejected', r.id)}>{mine ? 'Withdraw request' : 'Reject request'}</Button>
                  </Tile>
                );
              })}
            </div>
          </Card>

          <Card title="Key storage" actions={<SampleTag />}>
            <div className="flex flex-col gap-2 text-[13px]">
              <span className="flex items-center gap-2"><Pill tone="warn" glyph="caution">Software keys</Pill></span>
              <p className="text-[#9AA3B2] leading-[1.5]">This demo holds keys in software. No hardware security module (PKCS#11) is connected, so keys are not FIPS 140 protected and must not be used for a flight spacecraft.</p>
            </div>
          </Card>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-start">
        <Card className="flex-[999_1_560px] min-w-0" title="Key inventory" flush
          actions={<Select value={satFilter} onChange={(e) => onNavigate(e.target.value ? `keys?sat=${e.target.value}` : 'keys')} aria-label="Filter by satellite" className={clsx(inputCls, 'h-8')}>
            <option value="">All satellites</option>{KEY_SATS.map((s) => <option key={s}>{s}</option>)}
          </Select>}>
          <div className="overflow-x-auto px-2 pb-2 max-h-[520px] overflow-y-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead><tr><Th>Key</Th><Th>Satellite</Th><Th>Type</Th><Th>State</Th><Th>Created</Th><Th>Expires</Th><Th /></tr></thead>
              <tbody>
                {inventory.map((k) => (
                  <tr key={k.keyId}>
                    <Td className="font-mono-code text-[12.5px] text-[#E9ECF1]">{k.keyId}</Td>
                    <Td className="font-mono-code">{k.satId}</Td>
                    <Td>{k.type === 'MASTER' ? 'Master' : 'Session'}</Td>
                    <Td><Pill tone={KEY_TONE[k.state]}>{k.state === 'PRE_ACTIVE' ? 'Pre-active' : k.state.charAt(0) + k.state.slice(1).toLowerCase()}</Pill></Td>
                    <Td className="font-mono-code text-[12px]">{utc(k.created)}</Td>
                    <Td className="font-mono-code text-[12px]">{utc(k.expires)}</Td>
                    <Td className="text-right">{k.state === 'ACTIVE' && <Button size="sm" variant="danger" disabled={!!gate}
                      onClick={() => setConfirm({
                        title: `Revoke ${k.keyId}`, label: 'Request revocation', ok: 'Revocation requested',
                        body: `${k.keyId} is marked compromised once a second person applies the request. Frames protected with it are then refused; rekey ${k.satId} straight after.`,
                        run: () => request({ kind: 'REVOKE', satId: k.satId, keyId: k.keyId, detail: `Revoke ${k.type.toLowerCase()} key ${k.keyId} as compromised` }),
                      })}>Revoke</Button>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="flex-[1_1_320px] min-w-0" title="Rotation schedule">
          <p className="text-[12.5px] text-[#7C8594] mb-3">Session keys rotate every {SESSION_DAYS} days by OTAR; master keys every {MASTER_DAYS} days on the ground.</p>
          <div className="flex flex-col gap-2 max-h-[440px] overflow-y-auto">
            {schedule.map((k) => {
              const d = days(k.expires);
              return (
                <Tile key={k.keyId} className="flex items-center gap-3">
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="font-mono-code text-[13px]">{k.satId}</span>
                    <span className={clsx('text-[12px]', d <= 7 ? 'text-[#F5C451]' : 'text-[#7C8594]')}>{k.keyId} · due in {d} day{d === 1 ? '' : 's'}</span>
                  </span>
                  <Button size="sm" variant="secondary" disabled={!!gate} onClick={() => askOtar(k.satId)}>Rekey now</Button>
                </Tile>
              );
            })}
          </div>
        </Card>
      </div>

      {editSa && <SaDrawer sa={editSa} onClose={() => setEditSa(null)} />}
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setConfirm(null)}>Cancel</Button>
            <Button onClick={() => { say(confirm.run(), confirm.ok, 'A second person must apply it.'); setConfirm(null); }}>{confirm.label}</Button></>}>
          <p className="text-[13.5px] text-[#C9CED6] leading-[1.55]">{confirm.body}</p>
        </Modal>
      )}
    </>
  );
};

const SaDrawer: React.FC<{ sa: SecurityAssociation; onClose: () => void }> = ({ sa, onClose }) => {
  const request = useKeyStore((s) => s.request);
  const [mode, setMode] = useState<SdlsMode>(sa.mode);
  const [win, setWin] = useState(sa.arsnWindow);
  const [err, setErr] = useState<string | null>(null);
  const changed = mode !== sa.mode || win !== sa.arsnWindow;
  const submit = () => {
    if (!Number.isInteger(win) || win < 1 || win > 1024) return setErr('The anti-replay window must be a whole number of frames from 1 to 1024.');
    const e = request({
      kind: 'CONFIG', satId: sa.satId, patch: { mode, arsnWindow: win },
      detail: `SA ${sa.spi}: ${MODE[sa.mode]} → ${MODE[mode]}, anti-replay window ${sa.arsnWindow} → ${win} frames`,
    });
    setErr(e);
    if (!e) { toast.success('Change requested', { body: 'A second person must apply it.' }); onClose(); }
  };
  return (
    <Drawer title={`SDLS for ${sa.satId}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={!changed} reason={changed ? undefined : 'Nothing changed.'}>Request change</Button></>}>
      <p className="text-[13px] text-[#9AA3B2]">Security association <span className="font-mono-code">SPI {sa.spi}</span> on virtual channel {sa.vcid}. The spacecraft must hold the same settings, so a change is uplinked with the next SA management command.</p>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[12.5px] text-[#9AA3B2] mb-1">Mode</legend>
        {(Object.keys(MODE) as SdlsMode[]).map((m) => (
          <label key={m} className="flex items-center gap-2 text-[13px]"><input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)}  />{MODE[m]}</label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-[12.5px] text-[#9AA3B2]">Algorithm<input value="AES-256-GCM" readOnly className={clsx(inputCls, 'text-[#9AA3B2]')} /></label>
      <label className="flex flex-col gap-1 text-[12.5px] text-[#9AA3B2]">Anti-replay window (frames)<span className="flex gap-1"><input type="number" min={1} max={1024} value={win} onChange={(e) => setWin(Number(e.target.value))} className={`${inputCls} flex-1 min-w-0`} /><Stepper value={win} onChange={setWin} step={16} min={1} max={1024} label="anti-replay window" /></span></label>
      {mode === 'AUTH' && sa.mode === 'AUTH_ENC' && <Banner kind="warn">Turning encryption off sends command content in the clear. Authentication still blocks forged commands.</Banner>}
      {err && <p className="text-[12.5px] text-[#FF7A7A]">{err}</p>}
    </Drawer>
  );
};
