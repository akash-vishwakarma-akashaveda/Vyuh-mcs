import React, { useState } from 'react';
import { clsx } from 'clsx';
import { ArrowRight } from 'lucide-react';
import { LogoMark } from '../../components/atoms/Logo';
import { Button } from '../../components/atoms/Button';
import { Pill } from '../../components/atoms/Badge';
import { GuidePanel } from '../../components/organisms/GuidePanel';
import { FLEET, tenantOf } from '../../data/fleet';
import { tenantOfPerson, useAuthStore } from '../../store/useAuthStore';
import { useUIStore } from '../../store/useUIStore';
import { capabilitiesOf, homeOf } from '../../auth/policy';
import { UserRole } from '../../types';

/** Roles that can command a spacecraft need an on-shift check before the session starts. */
const COMMANDING: UserRole[] = ['Spacecraft Operator', 'Flight Director'];

const SUMMARY: Partial<Record<UserRole, string>> = {
  'Spacecraft Operator': 'Runs the fleet in real time: watches health, works alarms and sends commands during passes.',
  'Flight Director': 'Approves critical commands, leads recovery and is the escalation point on shift.',
  'Flight Engineer': 'Diagnoses with history, playback and advisories, and writes the procedures operators run.',
  'Mission Planner': 'Builds the plan, books passes and gets imagery to customers.',
  'Ground Station Engineer': 'Runs the ground stations, pass quality and hand-overs to the standby gateway.',
  'Mission Database Engineer': 'Owns the telemetry and command dictionaries and their releases.',
  'ML Engineer': 'Owns the anomaly models and the quality of their advisories.',
  'Security Officer': 'Grants access, issues invite keys and keeps the audit ledger honest.',
  'Platform Administrator': 'Keeps the ground segment software healthy: services, deployments, on-call.',
  'System Administrator': 'Supports everyone else: opens every screen, holds no spacecraft authority.',
  'Customer User': 'Sees your own satellites, requests imagery and downloads products.',
};

/** S02 · Choose role. One role is active per session (BR-S02-01). */
export const RoleSelection: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const setRole = useAuthStore((s) => s.setRole);
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  const setTenant = useUIStore((s) => s.setTenant);
  const tenant = tenantOfPerson(user);
  const [picked, setPicked] = useState<UserRole>(user.roles[0]);
  const [onShift, setOnShift] = useState(false);

  if (!signedIn) { onNavigate('signin'); return null; }

  const needsShift = COMMANDING.includes(picked);
  const wide = user.satellite_scope.includes('*');
  const sats = wide ? [] : FLEET.filter((s) => tenantOf(s.sat_id) === tenant);
  const scopeText = wide ? 'Every tenant, read only for spacecraft data' : `${sats.length} satellites`;

  const go = () => {
    setRole(picked);
    setTenant(tenant);
    onNavigate(homeOf(picked));
  };

  return (
    <div className="min-h-screen bg-[#090B10] text-[#E9ECF1] font-sans-body">
      <header className="flex items-center gap-3 px-6 md:px-8 h-16">
        <span className="w-8 h-8 rounded-[9px] bg-[#F28C28] flex items-center justify-center"><LogoMark size={18} color="#1A0E02" /></span>
        <span className="text-[15px] font-semibold mr-auto">Vyuh</span>
        <span className="hidden sm:flex items-center gap-2.5 rounded-xl bg-[#11141B] pl-1.5 pr-3 h-10">
          <span className="w-7 h-7 rounded-full bg-[#232936] flex items-center justify-center text-[11px] font-semibold">{user.name.split(' ').map((w) => w[0]).join('')}</span>
          <span className="text-[13px]">{user.name}</span>
        </span>
        <Button variant="secondary" size="sm" onClick={() => { logout(); onNavigate('signin'); }}>Sign out</Button>
      </header>

      <main className="max-w-[1080px] mx-auto px-6 py-8 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-[#7C8594]">Step 2 of 2 · {tenant}</span>
          <h1 className="text-[28px] font-semibold tracking-[-0.01em]">Choose the role for this session</h1>
          <p className="text-[14.5px] text-[#9AA3B2] max-w-[720px] leading-relaxed">
            {user.roles.length > 1
              ? 'You hold more than one role. A session runs in one of them; switching later signs you in again, so every action in the audit ledger names the role it was done in.'
              : 'Your account holds one role. Check what it allows, then start.'}
          </p>
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          {user.roles.map((role) => {
            const caps = capabilitiesOf(role);
            const on = role === picked;
            return (
              <button key={role} onClick={() => { setPicked(role); setOnShift(false); }} aria-pressed={on}
                className={clsx('text-left rounded-2xl bg-[#11141B] border p-5 flex flex-col gap-4', on ? 'border-[#F28C28]' : 'border-[#1A1E27] hover:border-[#2A303D]')}>
                <span className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-3">
                    <span className={clsx('w-4 h-4 rounded-full border-2 flex items-center justify-center', on ? 'border-[#F28C28]' : 'border-[#343B4A]')}>
                      {on && <span className="w-2 h-2 rounded-full bg-[#F28C28]" />}
                    </span>
                    <span className="text-[17px] font-semibold">{role}</span>
                  </span>
                  <Pill tone={COMMANDING.includes(role) ? 'action' : 'info'}>{COMMANDING.includes(role) ? 'Commanding' : 'Read and author'}</Pill>
                </span>
                <span className="text-[13.5px] text-[#9AA3B2] leading-relaxed">{SUMMARY[role]}</span>
                <span className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                  <span className="rounded-xl bg-[#161A22] p-3 flex flex-col gap-1.5">
                    <span className="text-[12px] text-[#4ADE9A]">Can</span>
                    {caps.can.slice(0, 4).map((c) => <span key={c} className="text-[12.5px] leading-snug">{c}</span>)}
                  </span>
                  {caps.second.length > 0 && (
                    <span className="rounded-xl bg-[#161A22] p-3 flex flex-col gap-1.5">
                      <span className="text-[12px] text-[#F5C451]">With approval</span>
                      {caps.second.map((c) => <span key={c} className="text-[12.5px] leading-snug">{c}</span>)}
                    </span>
                  )}
                  <span className="rounded-xl bg-[#161A22] p-3 flex flex-col gap-1.5">
                    <span className="text-[12px] text-[#FF7A7A]">Cannot</span>
                    {caps.cannot.slice(0, 3).map((c) => <span key={c} className="text-[12.5px] leading-snug text-[#9AA3B2]">{c}</span>)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-4">
          <section className="flex-1 min-w-[300px] rounded-2xl bg-[#11141B] border border-[#1A1E27] p-5 flex flex-col gap-3">
            <span className="text-[14px] font-medium">Satellites in this session</span>
            <span className="text-[13px] text-[#9AA3B2]">{scopeText}</span>
            {!wide && (
              <span className="flex flex-wrap gap-1.5">
                {sats.slice(0, 18).map((s) => <span key={s.sat_id} className="rounded-lg bg-[#161A22] px-2 py-1 font-mono-code text-[12px]">{s.sat_id}</span>)}
                {sats.length > 18 && <span className="text-[12.5px] text-[#7C8594] self-center">and {sats.length - 18} more</span>}
              </span>
            )}
          </section>
          {needsShift && (
            <section className={clsx('flex-1 min-w-[300px] rounded-2xl bg-[#11141B] border p-5 flex flex-col gap-3', onShift ? 'border-[#1A1E27]' : 'border-[#F5C451]/60')}>
              <span className="text-[14px] font-medium">On-shift check</span>
              <span className="text-[13px] text-[#9AA3B2]">Commanding roles need an on-shift roster entry. Roster: shift B, 08:00–16:00 UTC, console 2.</span>
              <label className="flex items-center gap-2.5 text-[14px] min-h-[32px]">
                <input type="checkbox" checked={onShift} onChange={(e) => setOnShift(e.target.checked)} className="w-[18px] h-[18px]" />
                I am at console 2 and on shift now
              </label>
            </section>
          )}
        </div>

        <div className="rounded-2xl bg-[#11141B] border border-[#1A1E27] p-5 flex flex-wrap items-center justify-between gap-4">
          <span className="text-[13.5px] text-[#9AA3B2] max-w-[560px]">
            {needsShift ? 'Session locks after 15 minutes idle. Commands ask for your passkey again at send time.' : 'Command controls stay visible but disabled, each with the reason.'}
          </span>
          <Button size="lg" onClick={go} disabled={needsShift && !onShift} reason={needsShift && !onShift ? 'Confirm you are on shift first' : undefined}>
            Start session as {picked} <ArrowRight size={17} />
          </Button>
        </div>
      </main>

      <GuidePanel onNavigate={onNavigate} />
    </div>
  );
};
