import React from 'react';
import { Logo } from '../../components/atoms/Logo';
import { ArrowRight, Antenna, Moon, Radio, ShieldCheck, Sparkles, Sun } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { DottedGlobe } from '../../components/organisms/DottedGlobe';
import { FLEET, STATIONS } from '../../data/fleet';
import { FACTS } from '../../data/facts';
import { canOpen, homeOf } from '../../auth/policy';
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
  { n: `≤ ${FACTS.latencyBudgetMs} ms`, l: 'budget from antenna to screen; the console shows the measured figure when the backend runs' },
  { n: String(FACTS.liveSatellites), l: 'satellites flown by the real ground-segment services (12 simulated, plus an ESA OPS-SAT replay)' },
  { n: String(FACTS.demoFleet), l: 'satellites in the console demo fleet, across three tenants' },
  { n: '2', l: 'people needed to release a critical command' },
];

const PLANE_COLOR: Record<string, string> = { 'Plane A': '#6CB8FF', 'Plane B': '#9B8CFF', 'Plane C': '#3DD9C1', 'Plane D': '#F5C451' };
/** Positions are calculated from orbital elements at page load, not received from a spacecraft (BR-S00-02). */
const GLOBE_SATS = FLEET.map((s) => ({ id: s.sat_id, lat: s.latitude, lon: s.longitude, color: PLANE_COLOR[s.constellation_group] ?? '#6CB8FF' }));
const GLOBE_STATIONS = STATIONS.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon }));

const TRY_AS = ['USR-001', 'USR-002', 'USR-004', 'USR-008'];

/** S00 · Product landing — no live data on the public page (BR-S00-02): positions are computed, not received. */
export const ProductLanding: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const startDemo = useDemoStore((s) => s.start);
  const signInAs = useAuthStore((s) => s.signInAs);
  const theme = useTheme();

  // The demo signs in as its first persona and opens the console with the guide running.
  // Already signed in: the guide still has to open inside the console, where its panel lives.
  const startGuided = () => {
    const signedIn = useAuthStore.getState().isAuthenticated;
    startDemo(onNavigate);
    if (signedIn) onNavigate(homeOf(useAuthStore.getState().activeRole));
  };
  // Plain anchors would change the hash, which is the router's; scroll instead.
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ block: 'start' });
  const tryAs = (id: string) => { signInAs(id); onNavigate('scope'); };

  const screensFor = (roles: string[]) => {
    const role = roles[0] as Parameters<typeof canOpen>[1];
    return SCREENS.filter((s) => s.flow !== 'public' && canOpen(s, role)).length;
  };

  return (
    <div className="min-h-screen bg-[#090B10] text-[#E9ECF1] font-sans-body overflow-x-hidden">
      <header className="sticky top-0 z-30 bg-[#090B10]/90 backdrop-blur border-b border-[#1A1E27]">
        <div className="h-[60px] px-6 md:px-10 flex items-center justify-between max-w-[1280px] mx-auto">
          <div className="flex items-center gap-2.5">
            <Logo size={22} />
          </div>
          <nav className="flex items-center gap-1 sm:gap-5" aria-label="Primary">
            <button onClick={() => jump('pipeline')} className="hidden sm:inline text-[13px] text-[#9AA3B2] hover:text-[#E9ECF1]">How it works</button>
            <button onClick={() => jump('about')} className="hidden sm:inline text-[13px] text-[#9AA3B2] hover:text-[#E9ECF1]">What it does</button>
            <button onClick={() => jump('roles')} className="hidden md:inline text-[13px] text-[#9AA3B2] hover:text-[#E9ECF1]">Roles</button>
            <button onClick={() => onNavigate('architecture')} className="hidden md:inline text-[13px] text-[#9AA3B2] hover:text-[#E9ECF1]">Architecture</button>
            <button onClick={() => onNavigate('contact')} className="hidden md:inline text-[13px] text-[#9AA3B2] hover:text-[#E9ECF1]">Contact</button>
            <button onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="w-8 h-8 flex items-center justify-center rounded-md text-[#9AA3B2] hover:text-[#E9ECF1] hover:bg-[#171B24]">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Button size="sm" onClick={() => onNavigate('signin')}>Sign in</Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 md:px-10 max-w-[1280px] mx-auto pt-16 md:pt-24 pb-16 grid lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
        <div className="flex flex-col gap-6 max-w-[620px]">
          <span className="self-start h-7 flex items-center gap-2 rounded-full border border-[#232936] bg-[#11141B] px-3 text-[12px] text-[#9AA3B2]">
            <span className="w-2 h-2 rounded-full bg-[#4ADE9A]" />
            Mission control for satellite constellations
          </span>
          <h1 className="text-[40px] md:text-[54px] leading-[1.06] font-semibold tracking-[-0.02em]">
            One console for every <span className="text-[#F2A65A]">satellite, pass and command.</span>
          </h1>
          <p className="text-[17px] leading-[1.65] text-[#9AA3B2]">
            VYUH-MCS runs a constellation end to end: telemetry on screen in a tenth of a second,
            commands that can never be sent twice, and AI that advises but never acts alone.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button size="lg" onClick={startGuided} className="gap-2">Start guided demo <ArrowRight size={18} /></Button>
            <Button size="lg" variant="secondary" onClick={() => onNavigate('signin')}>Sign in</Button>
          </div>

          <div className="flex flex-col gap-2 pt-3">
            <span className="text-[12px] text-[#7C8594]">Or jump in as</span>
            <div className="flex flex-wrap gap-2">
              {TRY_AS.map((id) => {
                const p = PEOPLE.find((x) => x.id === id)!;
                return (
                  <button key={id} onClick={() => tryAs(id)}
                    className="h-9 pl-1.5 pr-3.5 rounded-full border border-[#232936] bg-[#11141B] hover:border-[#F28C28] flex items-center gap-2 text-[12.5px]">
                    <span className="w-6 h-6 rounded-full bg-[#1A1E27] text-[#C9CED6] text-[10px] font-semibold flex items-center justify-center">
                      {p.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
                    </span>
                    <span className="font-medium">{p.roles[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Constellation */}
        <div className="rounded-2xl border border-[#1A1E27] bg-[#11141B] p-5 flex flex-col items-center gap-3">
          <DottedGlobe size={460} sats={GLOBE_SATS} stations={GLOBE_STATIONS} label={`${FACTS.demoFleet} demo satellites and ${FACTS.stations} ground stations`} />
          <div className="w-full flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px] text-[#9AA3B2]">
            <span className="flex flex-wrap items-center gap-3">
              {Object.entries(PLANE_COLOR).map(([p, c]) => (
                <span key={p} className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full" style={{ background: c }} />{p}</span>
              ))}
              <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-[2px] bg-[#F28C28]" />Stations</span>
            </span>
            <span className="tabular-nums">{FACTS.demoFleet} satellites · {FACTS.stations} stations</span>
          </div>
          <p className="w-full text-[12px] text-[#6B7383]">Positions are calculated from orbital elements when this page loads, not received from a spacecraft.</p>
        </div>
      </section>

      {/* Pipeline */}
      <section id="pipeline" className="px-6 md:px-10 max-w-[1280px] mx-auto pb-16 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px] text-[#F2A65A]">How it works</span>
          <h2 className="text-[26px] font-semibold tracking-[-0.01em]">From antenna to screen</h2>
        </div>
        <ol className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {PIPELINE.map(([name, sub], i) => (
            <li key={name} className="relative rounded-2xl border border-[#1A1E27] bg-[#11141B] p-4 flex flex-col gap-1">
              <span className="text-[11px] font-mono-code text-[#6B7383]">{String(i + 1).padStart(2, '0')}</span>
              <span className="text-[14px] font-semibold">{name}</span>
              <span className="text-[12px] text-[#7C8594] leading-snug">{sub}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Capabilities */}
      <section className="px-6 md:px-10 max-w-[1280px] mx-auto pb-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {CAPABILITIES.map(({ icon: Icon, title, text }) => (
          <article key={title} className="rounded-2xl border border-[#1A1E27] bg-[#11141B] p-5 flex flex-col gap-2.5">
            <span className="w-9 h-9 rounded-lg bg-[#161A22] flex items-center justify-center"><Icon size={18} className="text-[#F2A65A]" /></span>
            <h3 className="text-[15px] font-semibold">{title}</h3>
            <p className="text-[13px] leading-[1.55] text-[#9AA3B2]">{text}</p>
          </article>
        ))}
      </section>

      {/* Proof */}
      <section className="px-6 md:px-10 max-w-[1280px] mx-auto pb-16">
        <div className="rounded-2xl border border-[#1A1E27] bg-[#11141B] grid grid-cols-2 lg:grid-cols-4 divide-[#1A1E27] divide-x">
          {PROOF.map((p) => (
            <div key={p.l} className="px-6 py-6 flex flex-col gap-1.5">
              <span className="text-[32px] leading-none font-semibold tabular-nums text-[#E9ECF1]">{p.n}</span>
              <span className="text-[12.5px] text-[#9AA3B2] leading-snug">{p.l}</span>
            </div>
          ))}
        </div>
      </section>

      {/* About */}
      <section id="about" className="px-6 md:px-10 max-w-[1280px] mx-auto pb-16 flex flex-col gap-8">
        <div className="flex flex-col gap-2.5 max-w-[720px]">
          <span className="text-[12.5px] text-[#F2A65A]">What it does</span>
          <h2 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.01em]">One operational picture, from antenna to approval.</h2>
          <p className="text-[15px] leading-[1.65] text-[#9AA3B2]">
            The target architecture has {FACTS.architectureModules} modules; {FACTS.backendServices} ground-segment services are built and run in
            this demo, behind {FACTS.consoleScreens} console screens. The chain is built so the unsafe version of an action cannot be performed, rather than merely discouraged.
          </p>
        </div>
        <div className="grid lg:grid-cols-2 gap-3">
          {ABOUT.map((a, i) => (
            <article key={a.kicker} className="rounded-2xl border border-[#1A1E27] bg-[#11141B] p-6 flex flex-col gap-3">
              <span className="text-[12.5px] text-[#F2A65A]">{String(i + 1).padStart(2, '0')} · {a.kicker}</span>
              <h3 className="text-[19px] font-semibold leading-[1.25]">{a.title}</h3>
              <p className="text-[13.5px] leading-[1.65] text-[#9AA3B2]">{a.text}</p>
              <ul className="flex flex-col gap-1.5 pt-1 mt-auto">
                {a.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-[12.5px] text-[#9AA3B2]">
                    <span className="w-1 h-1 rounded-full bg-[#F28C28] mt-[7px] shrink-0" aria-hidden="true" />{p}
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
          <span className="text-[12.5px] text-[#F2A65A]">Built for every seat</span>
          <h2 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.01em]">Each role sees what it may act on.</h2>
          <p className="text-[15px] leading-[1.65] text-[#9AA3B2]">
            Access follows the role you choose at sign-in. A customer never sees another customer's data, and an
            operator can request a critical command but never approve their own.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {ROLE_CATEGORIES.map((cat) => (
            <article key={cat.id} className="rounded-2xl border border-[#1A1E27] bg-[#11141B] p-4 flex flex-col gap-3">
              <h3 className="text-[14px] font-semibold">{cat.label}</h3>
              <ul className="flex flex-col gap-2">
                {cat.roles.map((r) => (
                  <li key={r} className="flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span className="text-[#E9ECF1]">{r}</span>
                    <span className="text-[#7C8594] tabular-nums shrink-0">{screensFor([r])} screens</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 md:px-10 max-w-[1280px] mx-auto pb-20">
        <div className="rounded-2xl border border-[#1A1E27] bg-[#11141B] px-8 py-9 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="flex flex-col gap-1.5 max-w-[560px]">
            <h3 className="text-[22px] font-semibold">See it run</h3>
            <p className="text-[14px] text-[#9AA3B2] leading-[1.6]">
              The guided demo takes one heater fault from first advisory to recovery and audit in eleven steps, switching between the people who would really do each part.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <Button variant="secondary" onClick={() => onNavigate('architecture')}>How it is built</Button>
            <Button onClick={startGuided}>Start guided demo</Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#1A1E27]">
        <div className="px-6 md:px-10 py-9 max-w-[1280px] mx-auto flex flex-col gap-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex flex-col gap-2.5">
              <span className="flex items-center gap-2">
                <Logo />
              </span>
              <p className="text-[12px] text-[#6B7383] leading-[1.6]">Mission control for the Akashaveda constellation.</p>
            </div>
            {[
              { head: 'Product', links: [['Start guided demo', 'demo'], ['Sign in', 'signin']] },
              { head: 'Learn', links: [['Architecture', 'architecture'], ['How it works', '#pipeline'], ['Roles', '#roles']] },
              { head: 'Company', links: [['Request a briefing', 'contact']] },
            ].map((col) => (
              <nav key={col.head} className="flex flex-col gap-2" aria-label={col.head}>
                <span className="text-[12px] font-semibold text-[#9AA3B2]">{col.head}</span>
                {col.links.map(([label, to]) => (
                  <button key={label} onClick={() => (to === 'demo' ? startGuided() : to.startsWith('#') ? jump(to.slice(1)) : onNavigate(to))}
                    className="text-left text-[12.5px] text-[#6B7383] hover:text-[#F2A65A]">{label}</button>
                ))}
              </nav>
            ))}
          </div>
          <div className="border-t border-[#1A1E27] pt-5 flex flex-col md:flex-row gap-3 justify-between text-[12px] text-[#6B7383]">
            <span>Mission data stays in the agreed country and region. One customer never sees another's data.</span>
            <span>Akashaveda Space Technologies · Confidential</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
