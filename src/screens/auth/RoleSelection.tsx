import React, { useState } from 'react';
import { clsx } from 'clsx';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Starfield } from '../../components/atoms/Starfield';
import { Banner } from '../../components/molecules/Page';
import { GuidePanel } from '../../components/organisms/GuidePanel';
import { FLEET, tenantOf } from '../../data/fleet';
import { tenantOfPerson, useAuthStore } from '../../store/useAuthStore';
import { useUIStore } from '../../store/useUIStore';
import { UserRole } from '../../types';

const ROLES: { role: UserRole; scope: string; actions: string; onShift?: boolean }[] = [
  { role: 'Spacecraft Operator', scope: 'All Akashaveda satellites', actions: 'Monitor, acknowledge, send routine commands, request critical ones', onShift: true },
  { role: 'Flight Director', scope: 'All Akashaveda satellites', actions: 'Approve critical commands, run recovery, escalation point', onShift: true },
  { role: 'Flight Engineer', scope: 'All Akashaveda satellites', actions: 'Analyse telemetry, author procedures, review advisories' },
  { role: 'Mission Planner', scope: 'Plan A · Plan B', actions: 'Build plans, book passes, manage deliveries' },
  { role: 'Security Officer', scope: 'All tenants', actions: 'Manage access, verify the audit ledger, handle break-glass' },
  { role: 'Ground Station Engineer', scope: 'Ground network', actions: 'Operate stations, manage adapters and pass quality' },
  { role: 'Mission Database Engineer', scope: 'All Akashaveda satellites', actions: 'Author, review and release telemetry and command dictionaries' },
  { role: 'ML Engineer', scope: 'All Akashaveda satellites', actions: 'Manage anomaly models and advisory quality' },
  { role: 'Platform Administrator', scope: 'All tenants', actions: 'Platform health, deployments, on-call' },
  { role: 'System Administrator', scope: 'All tenants', actions: 'Support and administration; no spacecraft authority' },
  { role: 'Customer User', scope: 'Own tenant only', actions: 'See own satellites, passes and deliveries. No commanding.' },
];

/** S02 · Mission & role scope — one role is active per session (BR-S02-01). */
export const RoleSelection: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const setRole = useAuthStore((s) => s.setRole);
  const user = useAuthStore((s) => s.user);
  const setTenant = useUIStore((s) => s.setTenant);
  const tenant = tenantOfPerson(user);
  const myRoles = ROLES.filter((r) => user.roles.includes(r.role));
  const [picked, setPicked] = useState<UserRole | null>(myRoles.length === 1 ? myRoles[0].role : null);
  const [onShift, setOnShift] = useState(false);

  const selected = ROLES.find((r) => r.role === picked);
  const needsShift = Boolean(selected?.onShift);
  const sats = FLEET.filter((s) => tenantOf(s.sat_id) === tenant);

  const go = () => {
    if (!picked) return;
    setRole(picked);
    setTenant(tenant);
    onNavigate(picked === 'Customer User' ? 'customer' : 'fleet');
  };

  return (
    <div className="relative min-h-screen bg-[#0C0D10] text-[#F3F4F6] font-sans-body">
      <Starfield count={90} />

      <div className="relative max-w-[960px] mx-auto px-6 py-10 flex flex-col gap-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-[34px] h-[34px] rounded-full border-[2.6px] border-[#0F6E56] flex items-center justify-center">
              <span className="w-[7px] h-[7px] rounded-full bg-[#3CB992]" />
            </span>
            <span className="text-[14px] font-bold tracking-[0.04em]">VYUH<span className="font-mono-code text-[#3CB992] tracking-[0.18em] ml-1.5 text-[10px]">MCS</span></span>
          </div>
          <div className="flex items-center gap-4 text-[13px]">
            <button onClick={() => onNavigate('landing')} className="flex items-center gap-1.5 text-[#A1A7B3] hover:text-[#F3F4F6] transition-colors">
              <ArrowLeft size={16} /> Back to landing page
            </button>
            <span className="text-[#A1A7B3]">{user?.name}</span>
            <button onClick={() => onNavigate('signin')} className="text-[#3CB992] hover:underline text-[12px]">Sign out</button>
          </div>
        </header>

        <div className="flex flex-col gap-1">
          <h1 className="text-[24px] font-bold">Choose mission and role</h1>
          <p className="text-[13px] text-[#A1A7B3]">The role sets what this session may do and which satellites it can see.</p>
        </div>

        <div className="flex items-center gap-2 text-[13px]">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#A1A7B3]">Tenant</span>
          <span className="h-8 px-3 rounded border border-[#0F6E56] text-white bg-[#0F6E56] flex items-center">{tenant}</span>
          <span className="text-[#A1A7B3]">Signed in as {user.name}</span>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {myRoles.map((r) => (
            <button key={r.role} onClick={() => { setPicked(r.role); setOnShift(false); }}
              className={clsx('text-left rounded-lg border bg-[#14161B]/70 backdrop-blur-sm p-4 flex flex-col gap-2 transition-colors',
                picked === r.role ? 'border-[#3CB992]' : 'border-[#2B303B] hover:border-[#3D4452]')}>
              <span className="flex items-center justify-between">
                <span className="text-[14px] font-bold">{r.role}</span>
                {picked === r.role && <Check size={16} className="text-[#3CB992]" />}
              </span>
              <span className="text-[12px] text-[#A1A7B3]">{r.actions}</span>
              <span className="font-mono-code text-[11.5px] text-[#5E6572] mt-auto pt-2">{r.scope}</span>
            </button>
          ))}
        </div>

        {needsShift && (
          <Banner kind="warn" lead="On-shift confirmation required."
            action={
              <Button size="sm" variant={onShift ? 'secondary' : 'primary'} onClick={() => setOnShift(true)}>
                {onShift ? 'Confirmed' : 'I am on shift'}
              </Button>
            }>
            Commanding roles need an on-shift roster entry before the session starts.
          </Banner>
        )}

        <div className="rounded-lg border border-[#2B303B] bg-[#14161B]/70 p-4 flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#A1A7B3]">Satellite scope</span>
            <span className="font-mono-code text-[12.5px]">
              {sats.length} satellites · {sats.map((s) => s.sat_id).slice(0, 6).join(', ')}{sats.length > 6 ? ' …' : ''}
            </span>
          </div>
          <Button size="lg" disabled={!picked || (needsShift && !onShift)} onClick={go} className="gap-2">
            Continue as {picked ? picked.split(' ')[picked.split(' ').length - 1].toLowerCase() : '…'} <ArrowRight size={18} />
          </Button>
        </div>
      </div>

      <GuidePanel onNavigate={onNavigate} />
    </div>
  );
};
