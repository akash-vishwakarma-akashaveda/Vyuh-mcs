import React, { useEffect, useMemo, useState } from 'react';
import { Fingerprint, KeyRound, Building2, Sun, Moon, ArrowLeft } from 'lucide-react';
import { LogoMark } from '../../components/atoms/Logo';
import { Button } from '../../components/atoms/Button';
import { Pill } from '../../components/atoms/Badge';
import { Banner, Segmented } from '../../components/molecules/Page';
import { DottedGlobe } from '../../components/organisms/DottedGlobe';
import { GuidePanel } from '../../components/organisms/GuidePanel';
import { toggleTheme, useTheme } from '../../lib/theme';
import { SESSION_EXPIRED_KEY } from '../../notify/escalation';
import { capabilitiesOf } from '../../auth/policy';
import { INVITE_KEYS, PEOPLE, ROLE_CATEGORIES, categoryOf, tenantOfPerson, useAuthStore } from '../../store/useAuthStore';

const initials = (name: string) => name.split(' ').map((w) => w[0]).join('').slice(0, 2);

/** One line per person: their part in the demo story. */
const STORY: Record<string, string> = {
  'USR-001': 'On shift when AKV-03’s battery heater fails. Works the alarm and asks for the heater command.',
  'USR-002': 'Approves Vikram’s heater command with her passkey. Her own critical requests go to Arjun.',
  'USR-011': 'The second Flight Director, so the two-person rule always has someone to turn to.',
  'USR-003': 'Changes BAT_TEMP limits in dictionary 4.20 and sends it for review.',
  'USR-014': 'Second reviewer for Meera’s dictionary release and for procedure releases.',
  'USR-007': 'Reviews anomaly advisories and promotes a retrained model.',
  'USR-004': 'Solves tomorrow’s plan and books the downlinks a customer’s imaging needs.',
  'USR-012': 'Takes an antenna out for maintenance and hands its passes to the standby.',
  'USR-005': 'Issues invite keys and reviews the audit ledger after the heater recovery.',
  'USR-006': 'Watches platform health and approves role grants.',
  'USR-009': 'Opens every screen to support others, yet every spacecraft action is refused.',
  'USR-008': 'Asks for imagery of the Ludhiana wheat belt and downloads the result.',
  'USR-010': 'A second customer, to show Nabhas data never appears in his view.',
};

const ORBIT = Array.from({ length: 140 }, (_, i) => {
  const u = (i - 40) * 2.5 * Math.PI / 180, inc = 97.5 * Math.PI / 180;
  return { lat: Math.asin(Math.sin(inc) * Math.sin(u)) * 180 / Math.PI, lon: 82.9 + Math.atan2(Math.cos(inc) * Math.sin(u), Math.cos(u)) * 180 / Math.PI - 0.066 * (i - 40) * 2.5 };
});

/** S01 · Sign in. Passkey or SSO for the chosen person; invite keys for new accounts. No passwords. */
export const Login: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const signInAs = useAuthStore((s) => s.signInAs);
  const theme = useTheme();
  const people = useMemo(() => PEOPLE.filter((p) => p.status === 'ACTIVE'), []);
  const [picked, setPicked] = useState(people[0].id);
  const [tab, setTab] = useState<'account' | 'invite'>('account');
  const [key, setKey] = useState('AKV-INV-7Q4M-2KXP');
  const [waiting, setWaiting] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    try { if (sessionStorage.getItem(SESSION_EXPIRED_KEY)) { setExpired(true); sessionStorage.removeItem(SESSION_EXPIRED_KEY); } } catch { /* ignore */ }
  }, []);

  const person = people.find((p) => p.id === picked) ?? people[0];
  const caps = capabilitiesOf(person.roles[0]);
  const invite = INVITE_KEYS[key.trim().toUpperCase()];
  const invitee = invite && PEOPLE.find((p) => p.id === invite.personId);

  const signIn = (id: string) => {
    setWaiting(true);
    window.setTimeout(() => { signInAs(id); onNavigate('scope'); }, 600); // the passkey ceremony
  };

  return (
    <div className="min-h-screen bg-[#090B10] text-[#E9ECF1] font-sans-body flex flex-col">
      <header className="flex flex-wrap items-center gap-3 px-6 md:px-8 h-16">
        <button onClick={() => onNavigate('landing')} className="flex items-center gap-2.5 mr-auto" aria-label="Back to the product page">
          <span className="w-8 h-8 rounded-[9px] bg-[#F28C28] flex items-center justify-center"><LogoMark size={18} color="#1A0E02" /></span>
          <span className="flex flex-col leading-tight text-left"><span className="text-[15px] font-semibold">Vyuh</span><span className="text-[12px] text-[#7C8594]">Mission control</span></span>
        </button>
        <Pill tone="warn">Demo environment · simulated spacecraft</Pill>
        <button onClick={toggleTheme} aria-label="Toggle light or dark" className="w-9 h-9 rounded-lg flex items-center justify-center text-[#9AA3B2] hover:bg-[#171B24]">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      <main className="flex-1 w-full max-w-[1320px] mx-auto px-6 md:px-8 pb-10 flex flex-col gap-6">
        {expired && <Banner kind="warn" lead="Session ended.">You were signed out after 15 minutes without activity. Sign in again to continue.</Banner>}

        <div className="flex flex-wrap gap-6">
          <section className="flex-[1_1_420px] max-w-[520px] bg-[#11141B] border border-[#1A1E27] rounded-2xl p-7 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 className="text-[28px] font-semibold tracking-[-0.01em]">Sign in</h1>
              <p className="text-[14px] text-[#9AA3B2] leading-relaxed">Every session is tied to one person, one role and a set of satellites. Commanding needs a passkey; idle sessions lock after 15 minutes.</p>
            </div>
            <Segmented value={tab} onChange={setTab} className="self-start"
              options={[{ value: 'account', label: 'Existing account' }, { value: 'invite', label: 'Join with invite key' }]} />

            {tab === 'account' ? (
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-2 text-[13px] text-[#9AA3B2]">Work email
                  <input type="email" readOnly value={person.email}
                    className="h-11 rounded-xl bg-[#161A22] border border-[#232936] px-3.5 text-[15px] text-[#E9ECF1] outline-none" />
                </label>
                <span className="text-[12.5px] text-[#7C8594] -mt-2">Pick a demo person on the right to change who signs in.</span>
                <Button size="lg" onClick={() => signIn(person.id)} isLoading={waiting}><Fingerprint size={18} /> Continue with passkey</Button>
                <Button size="lg" variant="secondary" onClick={() => signIn(person.id)} disabled={waiting}><Building2 size={17} /> Single sign-on (Akashaveda)</Button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-2 text-[13px] text-[#9AA3B2]">Invite key
                  <input value={key} onChange={(e) => setKey(e.target.value)} spellCheck={false}
                    className="h-11 rounded-xl bg-[#161A22] border border-[#232936] px-3.5 font-mono-code text-[15px] tracking-[0.04em] text-[#E9ECF1] outline-none" />
                </label>
                {invite && invitee ? (
                  <div className="rounded-xl bg-[#161A22] px-4 py-3.5 flex flex-col gap-1.5 text-[14px]">
                    <span className="text-[12.5px] text-[#7C8594]">This key grants</span>
                    <span>{invitee.name} · {invite.role} · AKV-01 to AKV-10</span>
                    <span className="text-[13px] text-[#9AA3B2]">Issued by {invite.issuedBy}, approved by {invite.approvedBy} · expires in {invite.expiresInH} h</span>
                  </div>
                ) : (
                  <span className="text-[13px] text-[#FF7A7A]">That key is not valid or has expired. Ask a Security Officer for a new one.</span>
                )}
                <Button size="lg" disabled={!invite} reason={!invite ? 'Enter a valid invite key' : undefined} onClick={() => invite && signIn(invite.personId)} isLoading={waiting}>
                  <KeyRound size={17} /> Register a passkey and join
                </Button>
              </div>
            )}
            <p className="text-[12.5px] text-[#7C8594] leading-relaxed mt-auto">Accounts are invite-only. A key for a commanding role needs a second administrator. Lost your passkey? A Security Officer can issue a recovery key.</p>
          </section>

          <section className="flex-[999_1_560px] min-w-0 bg-[#0D1016] border border-[#1A1E27] rounded-2xl relative overflow-hidden min-h-[420px] flex items-center justify-center">
            <div className="w-full max-w-[520px] px-6">
              <DottedGlobe size={520} tracks={[{ points: ORBIT, color: '#6CB8FF', width: 1.6, opacity: 0.8 }]}
                stations={[{ id: 'HYD', name: 'Hyderabad', lat: 17.4, lon: 78.5 }, { id: 'BLR', name: 'Bengaluru', lat: 13, lon: 77.6 }]}
                sats={[{ id: 'AKV-03', lat: 19, lon: 79, color: '#F28C28', label: true, selected: true }, { id: 'AKV-07', lat: 6, lon: 60, color: '#4ADE9A', label: true }, { id: 'NBH-01', lat: -14, lon: 96, color: '#4ADE9A', label: true }]}
                label="Dotted Earth with the Akashaveda fleet over India" />
            </div>
            <div className="absolute left-6 bottom-5 flex flex-col gap-1">
              <span className="text-[15px] font-medium">Akashaveda constellation</span>
              <span className="text-[13px] text-[#7C8594]">13 satellites · CCSDS ground segment · live from the backend when it is running</span>
            </div>
          </section>
        </div>

        <div className="flex flex-wrap gap-6">
          <section className="flex-[999_1_560px] min-w-0 bg-[#11141B] border border-[#1A1E27] rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[16px] font-semibold">Demo accounts</h2>
              <span className="text-[13px] text-[#7C8594]">One person for each scenario. Pick one to see what they can do.</span>
            </div>
            {ROLE_CATEGORIES.map((cat) => {
              const group = people.filter((p) => categoryOf(p).id === cat.id);
              if (!group.length) return null;
              return (
                <div key={cat.id} className="flex flex-col gap-2">
                  <span className="text-[12.5px] text-[#7C8594]">{cat.label}</span>
                  <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                    {group.map((p) => (
                      <button key={p.id} onClick={() => setPicked(p.id)} aria-pressed={p.id === picked}
                        className={`text-left rounded-xl px-3 py-2.5 flex items-center gap-3 ${p.id === picked ? 'bg-[#1B2130] ring-1 ring-[#F28C28]/70' : 'bg-[#161A22] hover:bg-[#1A1F29]'}`}>
                        <span className="w-9 h-9 rounded-full bg-[#232936] flex items-center justify-center text-[12px] font-semibold shrink-0">{initials(p.name)}</span>
                        <span className="flex flex-col min-w-0">
                          <span className="text-[14px] font-medium truncate">{p.name}</span>
                          <span className="text-[12px] text-[#9AA3B2] truncate">{p.roles.join(' · ')}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>

          <aside className="flex-[1_1_340px] min-w-0 bg-[#11141B] border border-[#1A1E27] rounded-2xl p-6 flex flex-col gap-4 self-start">
            <div className="flex flex-col gap-1">
              <span className="text-[12.5px] text-[#7C8594]">{tenantOfPerson(person)}</span>
              <span className="text-[20px] font-semibold">{person.name}</span>
              <span className="text-[13.5px] text-[#9AA3B2]">{person.roles.join(' · ')} · {person.satellite_scope.join(', ')}</span>
            </div>
            <p className="text-[14px] leading-relaxed">{STORY[person.id]}</p>
            <div className="rounded-xl bg-[#161A22] p-3.5 flex flex-col gap-1.5">
              <Pill tone="ok" glyph="normal" className="self-start">Can</Pill>
              {caps.can.map((c) => <span key={c} className="text-[13.5px]">{c}</span>)}
            </div>
            {caps.second.length > 0 && (
              <div className="rounded-xl bg-[#161A22] p-3.5 flex flex-col gap-1.5">
                <Pill tone="warn" glyph="caution" className="self-start">Needs a second person</Pill>
                {caps.second.map((c) => <span key={c} className="text-[13.5px]">{c}</span>)}
              </div>
            )}
            <div className="rounded-xl bg-[#161A22] p-3.5 flex flex-col gap-1.5">
              <Pill tone="crit" glyph="critical" className="self-start">Cannot</Pill>
              {caps.cannot.map((c) => <span key={c} className="text-[13.5px] text-[#9AA3B2]">{c}</span>)}
            </div>
            <Button variant="outline" onClick={() => signIn(person.id)} disabled={waiting}>Sign in as {person.name.split(' ')[0]}</Button>
          </aside>
        </div>

        <button onClick={() => onNavigate('landing')} className="self-start flex items-center gap-1.5 text-[13px] text-[#7C8594] hover:text-[#E9ECF1]"><ArrowLeft size={14} /> Product page</button>
      </main>

      <GuidePanel onNavigate={onNavigate} />
    </div>
  );
};
