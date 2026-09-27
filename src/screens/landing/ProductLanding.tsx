import React, { useState } from 'react';
import { Logo } from '../../components/atoms/Logo';
import { ArrowRight, Antenna, Moon, Radio, ShieldCheck, Sparkles, Sun } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { ConstellationStats, LiveConstellation } from '../../components/organisms/LiveConstellation';
import { canOpen } from '../../auth/policy';
import { SCREENS } from '../../data/screens';
import { toggleTheme, useTheme } from '../../lib/theme';
import { useDemoStore } from '../../store/useDemoStore';
import { PEOPLE, ROLE_CATEGORIES, useAuthStore } from '../../store/useAuthStore';

const CAPABILITIES = [
  { icon: Radio, title: 'Live telemetry', text: 'Conflated CVT deltas from receipt to screen inside 100 ms, for 5 to 500 satellites.' },
  { icon: ShieldCheck, title: 'Commanding you can prove', text: 'Passkeys, two-person rule, single-writer leases and a hash-chained ledger behind every command.' },
  { icon: Antenna, title: 'Pass-aware ground link', text: 'CCSDS and SLE across agency, commercial and own stations, with gap ledgers and backfill.' },
  { icon: Sparkles, title: 'AI that advises', text: 'Anomaly advisories and health forecasts with evidence. People decide; the copilot cannot act.' },
];

const PIPELINE = [
  ['Ground station', 'SLE · CCSDS · AWS · MQTT'],
  ['Link Gateway', 'Frames spooled before ack'],
  ['Frame Processor', 'Dedup · reorder · gaps'],
  ['TM Processor', 'Signed dictionary decode'],
  ['Live Telemetry', 'Current values · limits'],
  ['Console', 'Conflated to the screen'],
] as const;

const ABOUT = [
  {
    kicker: 'Ground link',
    title: 'Every frame, from any station',
    text: 'CCSDS TM, AOS, USLP, TC and COP-1 over SLE for agency stations, provider APIs for commercial ones and our own antennas. Frames are spooled before they are acknowledged, so nothing is lost after receipt. Gaps open a backfill request on their own.',
    points: ['Pass orchestration from AOS−10 to drain', 'Gap ledger and station-recording backfill', 'Standby gateway takeover under 30 s'],
  },
  {
    kicker: 'Telemetry',
    title: 'Current values, not stale ones',
    text: 'Frames are decommutated against signed dictionaries and pushed as conflated deltas. Anything older than three periods dims itself and shows when it last updated — the console never lets a stale number look live.',
    points: ['Dictionary import with SCOS-2000 MIB', 'Limits, calibration and freshness on every card', 'History from hot store to lakehouse in one query'],
  },
  {
    kicker: 'Commanding',
    title: 'Unsafe actions made impossible',
    text: 'A command passes identity, dictionary, policy, interlock and second-person gates before it is encoded. One writer holds the lease for a satellite, and COP-1 sequence control does the rest. Stale interlock telemetry fails closed rather than open.',
    points: ['Passkeys and step-up at the moment of action', 'Requester and approver are never the same person', 'Hash-chained ledger anchored to write-once storage'],
  },
  {
    kicker: 'Intelligence',
    title: 'AI that advises, people who decide',
    text: 'Multivariate models raise advisories with evidence and contributing parameters, never alarms of their own. Forecasts always carry their uncertainty. The copilot answers from procedures and pass reports with citations, and holds no command permission.',
    points: ['Advisory within 5 s point / 60 s multivariate', 'Confirm or dismiss becomes a training label', 'Refuses to answer without a source'],
  },
];

const PROOF = [
  { n: '25 ms', l: 'median telemetry to screen, measured in this demo (target ≤ 100 ms)' },
  { n: '12', l: 'satellites flown by real ground-segment services in the demo' },
  { n: '2', l: 'people needed to release a critical command' },
  { n: '0', l: 'duplicate commands, by structure' },
];

const TRY_AS = ['USR-001', 'USR-002', 'USR-004', 'USR-008'];

/** S00 · Product landing — no live data on the public page (BR-S00-02): positions are computed, not received. */
export const ProductLanding: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const startDemo = useDemoStore((s) => s.start);
  const signInAs = useAuthStore((s) => s.signInAs);
  const theme = useTheme();
  const [stats, setStats] = useState<ConstellationStats | null>(null);

  const startGuided = () => {
    startDemo();       // BR-S00-01: Sign in opens with the demo guide running
    onNavigate('signin');
  };
  // Plain anchors would change the hash, which is the router's; scroll instead.
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ block: 'start' });
  const tryAs = (id: string) => { signInAs(id); onNavigate('scope'); };

  const screensFor = (roles: string[]) => {
    const role = roles[0] as Parameters<typeof canOpen>[1];
    return SCREENS.filter((s) => s.flow !== 'public' && canOpen(s, role)).length;
  };

  return (
    <div className="min-h-screen bg-[#0A1018] text-[#E6EDF3] font-sans-body overflow-x-hidden">
      <header className="sticky top-0 z-30 bg-[#0A1018]/90 backdrop-blur border-b border-[#213044]">
        <div className="h-[60px] px-6 md:px-10 flex items-center justify-between max-w-[1280px] mx-auto">
          <div className="flex items-center gap-2.5">
            <Logo size={22} />
          </div>
          <nav className="flex items-center gap-1 sm:gap-5" aria-label="Primary">
            <button onClick={() => jump('pipeline')} className="hidden sm:inline text-[13px] text-[#A3B1C2] hover:text-[#E6EDF3]">How it works</button>
            <button onClick={() => jump('about')} className="hidden sm:inline text-[13px] text-[#A3B1C2] hover:text-[#E6EDF3]">What it does</button>
            <button onClick={() => jump('roles')} className="hidden md:inline text-[13px] text-[#A3B1C2] hover:text-[#E6EDF3]">Roles</button>
            <button onClick={() => onNavigate('architecture')} className="hidden sm:inline text-[13px] text-[#A3B1C2] hover:text-[#E6EDF3]">Architecture</button>
            <button onClick={() => onNavigate('contact')} className="hidden md:inline text-[13px] text-[#A3B1C2] hover:text-[#E6EDF3]">Contact</button>
            <button onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="w-8 h-8 flex items-center justify-center rounded-md text-[#A3B1C2] hover:text-[#E6EDF3] hover:bg-[#172434]">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Button size="sm" onClick={() => onNavigate('signin')}>Sign in</Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 md:px-10 max-w-[1280px] mx-auto pt-16 md:pt-24 pb-16 grid lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
        <div className="flex flex-col gap-6 max-w-[620px]">
          <span className="self-start h-7 flex items-center gap-2 rounded-full border border-[#2A3B52] bg-[#111A25] px-3 text-[12px] text-[#A3B1C2]">
            <span className="w-2 h-2 rounded-full bg-[#56F000]" />
            Mission control for satellite constellations
          </span>
          <h1 className="text-[40px] md:text-[54px] leading-[1.06] font-bold tracking-[-0.02em]">
            One console for every <span className="text-[#4DACFF]">satellite, pass and command.</span>
          </h1>
          <p className="text-[17px] leading-[1.65] text-[#A3B1C2]">
            VYUH-MCS runs a constellation end to end: telemetry on screen in a tenth of a second,
            commands that can never be sent twice, and AI that advises but never acts alone.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button size="lg" onClick={startGuided} className="gap-2">Start guided demo <ArrowRight size={18} /></Button>
            <Button size="lg" variant="secondary" onClick={() => onNavigate('signin')}>Sign in</Button>
          </div>

          <div className="flex flex-col gap-2 pt-3">
            <span className="text-[12px] text-[#8496AB]">Or jump in as</span>
            <div className="flex flex-wrap gap-2">
              {TRY_AS.map((id) => {
                const p = PEOPLE.find((x) => x.id === id)!;
                return (
                  <button key={id} onClick={() => tryAs(id)}
                    className="h-9 pl-1.5 pr-3.5 rounded-full border border-[#2A3B52] bg-[#111A25] hover:border-[#4DACFF] flex items-center gap-2 text-[12.5px]">
                    <span className="w-6 h-6 rounded-full bg-[#1F2D40] text-[#4DACFF] text-[10px] font-bold flex items-center justify-center">
                      {p.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
                    </span>
                    <span className="font-medium">{p.roles[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live constellation */}
        <div className="rounded-2xl border border-[#213044] bg-[#111A25] p-5 flex flex-col items-center gap-3">
          <LiveConstellation size={440} onStats={setStats} />
          <div className="w-full flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px] text-[#A3B1C2]">
            <span className="flex items-center gap-3">
              {(['Plane A', 'Plane B', 'Plane C', 'Plane D'] as const).map((p, i) => (
                <span key={p} className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full" style={{ background: ['#5B8DEF', '#A78BFA', '#22D3EE', '#F472B6'][i] }} />{p.slice(-1)}</span>
              ))}
              <span className="flex items-center gap-1.5"><i className="w-2 h-2 rotate-45 bg-[#FACC15]" />Stations</span>
            </span>
            {stats && <span className="tabular-nums">{stats.total} satellites · {stats.inContact} in contact · {stats.inEclipse} in eclipse</span>}
          </div>
          <p className="w-full text-[11px] text-[#5F7087]">Positions are calculated from orbital elements for this instant, not received from a spacecraft.</p>
        </div>
      </section>

      {/* Pipeline */}
      <section id="pipeline" className="px-6 md:px-10 max-w-[1280px] mx-auto pb-16 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-[#4DACFF]">How it works</span>
          <h2 className="text-[26px] font-bold tracking-[-0.01em]">From antenna to screen</h2>
        </div>
        <ol className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {PIPELINE.map(([name, sub], i) => (
            <li key={name} className="relative rounded-xl border border-[#213044] bg-[#111A25] p-4 flex flex-col gap-1">
              <span className="text-[11px] font-mono-code text-[#5F7087]">{String(i + 1).padStart(2, '0')}</span>
              <span className="text-[14px] font-semibold">{name}</span>
              <span className="text-[12px] text-[#8496AB] leading-snug">{sub}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Capabilities */}
      <section className="px-6 md:px-10 max-w-[1280px] mx-auto pb-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {CAPABILITIES.map(({ icon: Icon, title, text }) => (
          <article key={title} className="rounded-xl border border-[#213044] bg-[#111A25] p-5 flex flex-col gap-2.5">
            <span className="w-9 h-9 rounded-lg bg-[#2E6FD8]/20 flex items-center justify-center"><Icon size={18} className="text-[#4DACFF]" /></span>
            <h3 className="text-[15px] font-semibold">{title}</h3>
            <p className="text-[13px] leading-[1.55] text-[#A3B1C2]">{text}</p>
          </article>
        ))}
      </section>

      {/* Proof */}
      <section className="px-6 md:px-10 max-w-[1280px] mx-auto pb-16">
        <div className="rounded-xl border border-[#213044] bg-[#111A25] grid grid-cols-2 lg:grid-cols-4 divide-[#213044] divide-x">
          {PROOF.map((p) => (
            <div key={p.l} className="px-6 py-6 flex flex-col gap-1.5">
              <span className="font-display-title text-[30px] leading-none font-bold tabular-nums text-[#E6EDF3]">{p.n}</span>
              <span className="text-[12.5px] text-[#A3B1C2] leading-snug">{p.l}</span>
            </div>
          ))}
        </div>
      </section>

      {/* About */}
      <section id="about" className="px-6 md:px-10 max-w-[1280px] mx-auto pb-16 flex flex-col gap-8">
        <div className="flex flex-col gap-2.5 max-w-[720px]">
          <span className="text-[12px] font-semibold text-[#4DACFF]">What it does</span>
          <h2 className="text-[30px] font-bold leading-[1.15] tracking-[-0.01em]">Thirty-one modules, one operational picture.</h2>
          <p className="text-[15px] leading-[1.65] text-[#A3B1C2]">
            The whole chain — ground link, telemetry, commands and the intelligence on top — is built so the unsafe
            version of an action cannot be performed, rather than merely discouraged.
          </p>
        </div>
        <div className="grid lg:grid-cols-2 gap-3">
          {ABOUT.map((a, i) => (
            <article key={a.kicker} className="rounded-xl border border-[#213044] bg-[#111A25] p-6 flex flex-col gap-3">
              <span className="text-[12px] font-semibold text-[#4DACFF]">{String(i + 1).padStart(2, '0')} · {a.kicker}</span>
              <h3 className="text-[19px] font-semibold leading-[1.25]">{a.title}</h3>
              <p className="text-[13.5px] leading-[1.65] text-[#A3B1C2]">{a.text}</p>
              <ul className="flex flex-col gap-1.5 pt-1 mt-auto">
                {a.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-[12.5px] text-[#A3B1C2]">
                    <span className="w-1 h-1 rounded-full bg-[#4DACFF] mt-[7px] shrink-0" aria-hidden="true" />{p}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* Roles */}
      <section id="roles" className="px-6 md:px-10 max-w-[1280px] mx-auto pb-16 flex flex-col gap-6">
        <div className="flex flex-col gap-2.5 max-w-[720px]">
          <span className="text-[12px] font-semibold text-[#4DACFF]">Built for every seat</span>
          <h2 className="text-[30px] font-bold leading-[1.15] tracking-[-0.01em]">Each role sees what it may act on.</h2>
          <p className="text-[15px] leading-[1.65] text-[#A3B1C2]">
            Access follows the role you choose at sign-in. A customer never sees another customer's data, and an
            operator can request a critical command but never approve their own.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {ROLE_CATEGORIES.map((cat) => (
            <article key={cat.id} className="rounded-xl border border-[#213044] bg-[#111A25] p-4 flex flex-col gap-3">
              <h3 className="text-[14px] font-semibold">{cat.label}</h3>
              <ul className="flex flex-col gap-2">
                {cat.roles.map((r) => (
                  <li key={r} className="flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span className="text-[#E6EDF3]">{r}</span>
                    <span className="text-[#8496AB] tabular-nums shrink-0">{screensFor([r])} screens</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 md:px-10 max-w-[1280px] mx-auto pb-20">
        <div className="rounded-2xl border border-[#213044] bg-gradient-to-r from-[#2E6FD8]/20 via-[#142030] to-[#111A25] px-8 py-9 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="flex flex-col gap-1.5 max-w-[560px]">
            <h3 className="text-[22px] font-bold">See it run</h3>
            <p className="text-[14px] text-[#A3B1C2] leading-[1.6]">
              The guided demo flies a real fault from first alarm to recovery in six minutes. The architecture reference
              walks the telemetry pipeline, uplink engine, AI stack and security model.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <Button variant="secondary" onClick={() => onNavigate('architecture')} className="gap-2">System architecture <ArrowRight size={16} /></Button>
            <Button onClick={startGuided}>Start guided demo</Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#213044]">
        <div className="px-6 md:px-10 py-9 max-w-[1280px] mx-auto flex flex-col gap-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex flex-col gap-2.5">
              <span className="flex items-center gap-2">
                <Logo />
              </span>
              <p className="text-[12px] text-[#5F7087] leading-[1.6]">Mission control for the Akashaveda constellation.</p>
            </div>
            {[
              { head: 'Product', links: [['System architecture', 'architecture'], ['Start guided demo', 'demo'], ['Sign in', 'signin']] },
              { head: 'Platform', links: [['Fleet overview', 'fleet'], ['Ops Copilot', 'copilot'], ['Platform health', 'platform']] },
              { head: 'Company', links: [['Request a briefing', 'contact'], ['Customer portal', 'customer']] },
            ].map((col) => (
              <nav key={col.head} className="flex flex-col gap-2" aria-label={col.head}>
                <span className="text-[12px] font-semibold text-[#A3B1C2]">{col.head}</span>
                {col.links.map(([label, to]) => (
                  <button key={label} onClick={() => (to === 'demo' ? startGuided() : onNavigate(to))}
                    className="text-left text-[12.5px] text-[#5F7087] hover:text-[#4DACFF]">{label}</button>
                ))}
              </nav>
            ))}
          </div>
          <div className="border-t border-[#213044] pt-5 flex flex-col md:flex-row gap-3 justify-between text-[12px] text-[#5F7087]">
            <span>Mission data stays in the agreed country and region. One customer never sees another's data.</span>
            <span>Akashaveda Space Technologies · Confidential</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
