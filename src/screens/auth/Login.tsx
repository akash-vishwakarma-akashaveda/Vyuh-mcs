import React, { useState } from 'react';
import { Fingerprint, Building2, KeyRound, Loader2, ArrowLeft, Sun, Moon } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Banner } from '../../components/molecules/Page';
import { toggleTheme, useTheme } from '../../lib/theme';
import { GuidePanel } from '../../components/organisms/GuidePanel';
import { PEOPLE, ROLE_CATEGORIES, categoryOf, tenantOfPerson, useAuthStore } from '../../store/useAuthStore';

type State = 'DEFAULT' | 'WAITING' | 'LOCKED';

const initials = (name: string) => name.split(' ').map((w) => w[0]).join('').slice(0, 2);

/** S01 · Sign in — quick account selector for the demo; no passwords are typed (BR-S01-01). */
export const Login: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const [state, setState] = useState<State>('DEFAULT');
  const signInAs = useAuthStore((s) => s.signInAs);
  const theme = useTheme();

  const pick = (id: string) => {
    setState('WAITING');
    signInAs(id);
    onNavigate('scope');
  };

  return (
    <div className="min-h-screen bg-[#0C0D10] text-[#F3F4F6] font-sans-body flex flex-col">
      <header className="h-14 px-6 flex items-center justify-between border-b border-[#2B303B]">
        <button onClick={() => onNavigate('landing')} className="flex items-center gap-1.5 text-[13px] text-[#A1A7B3] hover:text-[#F3F4F6]">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex items-center gap-3">
          <button onClick={toggleTheme} aria-label="Toggle light / dark mode" className="w-8 h-8 flex items-center justify-center rounded-md text-[#A1A7B3] hover:text-[#F3F4F6] hover:bg-[#1A1D24]">
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <span className="font-mono-code text-[10.5px] font-bold rounded-full border border-[#E8943A]/50 text-[#E8943A] px-2 h-5 flex items-center">ENV · DEMO</span>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1040px] mx-auto px-6 py-10 grid lg:grid-cols-[340px_1fr] gap-10">
        <section className="flex flex-col gap-5">
          <div className="flex items-center gap-2.5">
            <span className="w-[34px] h-[34px] rounded-full border-[2.6px] border-[#0F6E56] flex items-center justify-center">
              <span className="w-[7px] h-[7px] rounded-full bg-[#3CB992]" />
            </span>
            <span className="text-[15px] font-bold tracking-[0.04em]">VYUH<span className="font-mono-code text-[#3CB992] tracking-[0.18em] ml-1.5 text-[10px]">MCS</span></span>
          </div>
          <h1 className="text-[26px] font-bold leading-tight">Sign in to mission control</h1>
          <p className="text-[13px] text-[#A1A7B3] leading-[1.6]">
            Choose an account on the right to enter as that person. Each account holds specific roles; you pick one active role on the next step.
          </p>

          {state === 'LOCKED' && <Banner kind="crit" lead="Account locked.">Contact the Security Officer. Break-glass access is audited.</Banner>}

          <div className="flex flex-col gap-2.5 pt-2">
            <Button size="lg" onClick={() => { setState('WAITING'); onNavigate('scope'); }} disabled={state !== 'DEFAULT'} className="w-full gap-2">
              {state === 'WAITING' ? <Loader2 size={18} className="animate-spin" /> : <Fingerprint size={18} />}
              Sign in with passkey
            </Button>
            <Button size="lg" variant="secondary" onClick={() => onNavigate('scope')} className="w-full gap-2">
              <Building2 size={18} /> Continue with corporate SSO
            </Button>
            <button onClick={() => setState('LOCKED')} className="flex items-center gap-1.5 text-[12px] text-[#A1A7B3] hover:text-[#F3F4F6] self-start mt-1">
              <KeyRound size={14} /> Break-glass access
            </button>
          </div>
          <p className="text-[11.5px] text-[#5E6572]">Every sign-in is written to the audit ledger.</p>
        </section>

        <section className="flex flex-col gap-6" aria-label="Quick account selector">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#A1A7B3]">Quick account selector</h2>
          {ROLE_CATEGORIES.map((cat) => {
            const people = PEOPLE.filter((p) => categoryOf(p).id === cat.id);
            if (!people.length) return null;
            return (
              <div key={cat.id} className="flex flex-col gap-2">
                <span className="text-[12px] font-semibold text-[#A1A7B3]">{cat.label}</span>
                <div className="grid sm:grid-cols-2 gap-2">
                  {people.map((p) => (
                    <button key={p.id} onClick={() => pick(p.id)}
                      className="text-left flex items-center gap-3 rounded-lg border border-[#2B303B] bg-[#14161B] hover:border-[#3CB992] hover:bg-[#1A1D24] px-3 py-2.5">
                      <span className="w-9 h-9 rounded-full bg-[#22262F] text-[#3CB992] text-[12px] font-bold flex items-center justify-center shrink-0">{initials(p.name)}</span>
                      <span className="flex flex-col min-w-0">
                        <span className="text-[13.5px] font-semibold truncate">{p.name}</span>
                        <span className="text-[11.5px] text-[#A1A7B3] truncate">{p.roles.join(' · ')}</span>
                        <span className="text-[10.5px] text-[#5E6572] font-mono-code truncate">{tenantOfPerson(p)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      </main>

      <GuidePanel onNavigate={onNavigate} />
    </div>
  );
};
