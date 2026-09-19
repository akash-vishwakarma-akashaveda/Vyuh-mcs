import React from 'react';
import { clsx } from 'clsx';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Starfield } from '../../components/atoms/Starfield';

/* ------------------------------------------------------------------ pieces */

const Section: React.FC<{ n: string; title: string; lead?: string; children: React.ReactNode }> = ({ n, title, lead, children }) => (
  <section className="flex flex-col gap-5">
    <div className="flex flex-col gap-2 max-w-[820px]">
      <span className="font-mono-code text-[10.5px] font-bold tracking-[0.06em] text-[#3CB992]">{n}</span>
      <h2 className="text-[26px] leading-[1.15] font-bold tracking-[-0.01em]">{title}</h2>
      {lead && <p className="text-[14.5px] leading-[1.65] text-[#A1A7B3]">{lead}</p>}
    </div>
    {children}
  </section>
);

type Tone = 'teal' | 'blue' | 'amber' | 'violet' | 'slate' | 'red';
const TONE: Record<Tone, { border: string; text: string; fill: string }> = {
  teal:   { border: 'border-[#0F6E56]',    text: 'text-[#3CB992]', fill: 'bg-[#0F6E56]/[0.10]' },
  blue:   { border: 'border-[#2B3140]',    text: 'text-[#4A9EFF]', fill: 'bg-[#4A9EFF]/[0.08]' },
  amber:  { border: 'border-[#E8943A]/60', text: 'text-[#E8943A]', fill: 'bg-[#E8943A]/[0.08]' },
  violet: { border: 'border-[#8B7CF6]/60', text: 'text-[#8B7CF6]', fill: 'bg-[#8B7CF6]/[0.08]' },
  slate:  { border: 'border-[#2B303B]',    text: 'text-[#A1A7B3]', fill: 'bg-[#14161B]' },
  red:    { border: 'border-[#C62828]/60', text: 'text-[#FF6B6B]', fill: 'bg-[#C62828]/[0.08]' },
};

/** One block in a diagram. */
const Block: React.FC<{ tone?: Tone; kicker?: string; title: string; lines?: string[]; out?: string; wide?: boolean }> = ({
  tone = 'slate', kicker, title, lines, out, wide,
}) => {
  const t = TONE[tone];
  return (
    <div className={clsx('rounded-md border px-3.5 py-3 flex flex-col gap-1.5 backdrop-blur-sm', t.border, t.fill, wide ? 'min-w-[260px]' : 'min-w-[190px]')}>
      {kicker && <span className={clsx('font-mono-code text-[10px] font-bold tracking-[0.06em]', t.text)}>{kicker}</span>}
      <span className="text-[13.5px] font-bold leading-[1.25]">{title}</span>
      {lines?.map((l) => (
        <span key={l} className="text-[12px] text-[#A1A7B3] leading-[1.45]">{l}</span>
      ))}
      {out && (
        <span className="font-mono-code text-[11px] text-[#4A9EFF] mt-1 pt-1.5 border-t border-[#23272F] break-all">{out}</span>
      )}
    </div>
  );
};

/** Horizontal flow that stacks on narrow screens. Arrows follow the axis. */
const Flow: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const items = React.Children.toArray(children);
  return (
    <div className="flex flex-col lg:flex-row lg:items-stretch gap-2 lg:gap-0 overflow-x-auto pb-1">
      {items.map((child, i) => (
        <React.Fragment key={i}>
          <div className="flex-1 flex">{child}</div>
          {i < items.length - 1 && (
            <div className="flex items-center justify-center text-[#3D4452] px-1 shrink-0" aria-hidden="true">
              <span className="lg:hidden">↓</span>
              <span className="hidden lg:inline">→</span>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

const Step: React.FC<{ n: number; title: string; where?: string; children: React.ReactNode }> = ({ n, title, where, children }) => (
  <li className="flex gap-4">
    <span className="w-8 h-8 shrink-0 rounded-full border border-[#0F6E56] bg-[#0F6E56]/12 text-[#3CB992] font-bold text-[13px] flex items-center justify-center">
      {n}
    </span>
    <div className="flex flex-col gap-1.5 pb-6 border-l border-[#23272F] -ml-[17px] pl-[21px]">
      <span className="text-[15px] font-bold">{title}</span>
      <p className="text-[13.5px] leading-[1.6] text-[#A1A7B3]">{children}</p>
      {where && <span className="font-mono-code text-[11.5px] text-[#3CB992]">{where}</span>}
    </div>
  </li>
);

/* ------------------------------------------------------------------- data */

const ENGINES = [
  { name: 'Frame Ingest', pkg: 'internal/ingest', eats: 'Antenna modem · TCP :5050 / UDP :5051', emits: 'telemetry.raw.frames', job: 'Takes the raw bitstream off the antenna without ever blocking it, slices frame boundaries and stamps each frame with antenna, pass and receive time.' },
  { name: 'TFPE', pkg: 'internal/tfpe', eats: 'telemetry.raw.frames', emits: 'telemetry.space.packets · clcw.events · telemetry.gaps', job: 'Locks the CCSDS sync marker, checks CRC-16, counts virtual-channel frames to spot losses, pulls the CLCW out of the OCF and reassembles packets that span frames.' },
  { name: 'TPPP', pkg: 'internal/tppp', eats: 'telemetry.space.packets', emits: 'telemetry.processed · alarm.events', job: 'Looks the packet up in the XTCE dictionary by SCID and APID, pulls each parameter out bit by bit, converts raw counts to engineering units and checks limits with hysteresis.' },
  { name: 'TDAE', pkg: 'internal/tdae', eats: 'telemetry.processed', emits: 'Redis CVT · TimescaleDB · WebSocket :8088', job: 'Writes the current value of every parameter to Redis, archives the history, and pushes conflated deltas to every subscribed browser.' },
  { name: 'Command Gateway', pkg: 'internal/cmdgw', eats: 'POST /api/v1/commands :8080', emits: 'raw.commands', job: 'The only door commands come in through. Validates the request, assigns an idempotency key and records who asked.' },
  { name: 'UPE', pkg: 'internal/upe', eats: 'raw.commands', emits: 'tc.packets · cmd.ack.events', job: 'Runs the safety checks — parameter ranges, spacecraft state and interlocks, authorisation — then encodes the telecommand packet. A failed check never reaches the encoder.' },
  { name: 'UTFE', pkg: 'internal/utfe', eats: 'tc.packets · clcw.events', emits: 'CLTU to station · cmd.ack.events', job: 'Runs COP-1 FOP-1: sequence numbers, retransmission, lockout handling. The CLCW coming back down closes the loop and marks the command acknowledged.' },
  { name: 'BFF', pkg: 'internal/bff', eats: 'HTTP :8085', emits: 'JSON to the console', job: 'One tailored API for the console: fleet list, satellite snapshot, telemetry, alarms. The browser never talks to an engine directly.' },
  { name: 'Alarm Manager', pkg: 'internal/alarm', eats: 'alarm.events', emits: 'notifications · alarm state', job: 'De-duplicates repeats inside a 30-second window so one flapping sensor cannot flood the console, then drives escalation.' },
  { name: 'Gap Replay', pkg: 'internal/gapreplay', eats: 'telemetry.gaps', emits: 'backfill requests', job: 'Turns a detected frame-counter jump into an explicit list of missing frames and asks the station recording for them.' },
  { name: 'Dead Letter Monitor', pkg: 'internal/dlm', eats: 'dead.letter', emits: 'alerts', job: 'Watches everything the pipeline refused — lost sync, bad CRC, unknown APID — so failures are visible instead of silent.' },
  { name: 'Simulator', pkg: 'internal/simulator', eats: 'scenario definition', emits: 'CCSDS frames to :5050', job: 'A spacecraft that is not there. It speaks the same bitstream as a real antenna, so the whole chain can run with no hardware.' },
];

const UI_CAPABILITIES = [
  { flow: 'Fleet & telemetry', screens: 'S03–S07', items: ['See every satellite, its status and its next contact', 'Open one satellite and read every parameter by subsystem, with limits, freshness and history', 'Work alarms through their lifecycle: acknowledge, shelve with a reason, escalate', 'Replay a past pass at up to 100× to investigate what happened'] },
  { flow: 'Passes & ground', screens: 'S08–S11', items: ['Watch a live pass: frames per second, gaps, latency, COP-1 state', 'Book and review contact windows across agency, commercial and own stations', 'Compare station availability, quality and cost per minute', 'Close a pass report once every gap is backfilled or declared unrecoverable'] },
  { flow: 'Commanding', screens: 'S12–S16', items: ['Build a command from the dictionary with typed, range-checked parameters', 'See every safety gate before you send: identity, dictionary, policy, interlocks, second person', 'Approve or reject someone else’s critical command with a passkey touch', 'Run a procedure step by step, with waits, checks and operator decisions', 'Watch the uplink queue and the COP-1 sliding window'] },
  { flow: 'Planning & mission data', screens: 'S17–S19', items: ['Solve a plan of imaging, downlinks and maintenance against real resource limits', 'Track bulk payload downloads from chunks to delivered L0 products', 'Review, verify and release dictionary changes like software, with two reviewers'] },
  { flow: 'Intelligence', screens: 'S20–S22', items: ['Read AI advisories with their evidence and contributing parameters, then confirm or dismiss', 'See remaining useful life per component, always with its uncertainty interval', 'Ask the copilot a question and get an answer with citations — it cannot act'] },
  { flow: 'Simulation & customers', screens: 'S23–S24', items: ['Run fault scenarios against simulated satellites and record a verdict', 'Give a customer a tenant-scoped view of their own satellites, passes and deliveries'] },
  { flow: 'Governance & platform', screens: 'S25–S28', items: ['Manage users, roles, satellite scope and two-person rules', 'Verify the audit chain against its write-once anchor', 'Watch service health, SLOs, Kafka lag, zones and deploy freezes', 'Set routing rules, escalation policy and the on-call rota'] },
];

/* ------------------------------------------------------------------- page */

export const Architecture: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => (
  <div className="relative min-h-screen bg-[#0C0D10] text-[#F3F4F6] font-sans-body">
    <Starfield count={90} />

    <div className="relative max-w-[1280px] mx-auto px-6 py-8 flex flex-col gap-16">
      {/* head */}
      <header className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => onNavigate('landing')}>
            <ArrowLeft size={16} /> Back to landing page
          </Button>
          <span className="font-mono-code text-[11px] text-[#3CB992]">VYUH-MCS · SYSTEM ARCHITECTURE</span>
        </div>

        <div className="flex flex-col gap-3 max-w-[820px]">
          <h1 className="text-[34px] md:text-[42px] leading-[1.1] font-bold tracking-[-0.02em]">
            How the whole thing works, end to end
          </h1>
          <p className="text-[16px] leading-[1.65] text-[#A1A7B3]">
            A satellite sends a stream of bits to an antenna. A few milliseconds later an operator
            sees a number on screen, and if that number is wrong, an alarm is already on its way to
            a person. This page walks that path one step at a time — then the path back up, how you
            add a new satellite, and what you can actually do from the console.
          </p>
        </div>
      </header>

      {/* 01 — mental model */}
      <Section
        n="01 · THE SHORT VERSION"
        title="Twelve small engines on one message bus"
        lead="Nothing in VYUH-MCS is a monolith. Each engine does one job, reads from a Kafka topic and writes to another. That is the whole trick: an engine can be restarted, scaled or replaced without anyone else noticing, and every message is replayable, so nothing is lost after it has been received."
      >
        <Flow>
          <Block tone="slate" kicker="OUTSIDE" title="Ground station" lines={['Antenna and modem', 'CCSDS bitstream']} />
          <Block tone="teal" kicker="INGEST + PROCESS" title="Four telemetry engines" lines={['Frames → packets → parameters', 'Limits checked on the way through']} />
          <Block tone="blue" kicker="STORE" title="Redis + TimescaleDB" lines={['Current value of everything', 'Full history for later']} />
          <Block tone="blue" kicker="SERVE" title="BFF + WebSocket" lines={['One API for the console', 'Live deltas at :8088']} />
          <Block tone="teal" kicker="SEE + ACT" title="The console" lines={['29 screens', 'Commands go back the other way']} />
        </Flow>

        <p className="text-[13.5px] leading-[1.65] text-[#A1A7B3] max-w-[820px]">
          Everything is keyed by <span className="font-mono-code text-[12.5px] text-[#3CB992]">SCID</span>, the spacecraft
          identifier carried in every frame. That single choice is why the system grows from five
          satellites to five hundred by adding capacity rather than being rewritten: work for
          different spacecraft never shares a queue.
        </p>
      </Section>

      {/* 02 — start here */}
      <Section
        n="02 · WHERE IT STARTS"
        title="What happens in the first second"
        lead="Two starting points matter: how a running system comes up, and what happens the moment you open the console."
      >
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-md border border-[#2B303B] bg-[#14161B]/70 p-5">
            <h3 className="text-[15px] font-bold mb-3">Starting the system</h3>
            <ol className="flex flex-col gap-2.5 text-[13.5px] text-[#A1A7B3] leading-[1.55]">
              <li><span className="font-mono-code text-[12px] text-[#3CB992]">1</span> Kafka, Redis, TimescaleDB and Postgres come up — the bus and the stores.</li>
              <li><span className="font-mono-code text-[12px] text-[#3CB992]">2</span> Each engine starts, loads its slice of configuration from Postgres and subscribes to its input topic.</li>
              <li><span className="font-mono-code text-[12px] text-[#3CB992]">3</span> Frame Ingest opens its listeners on <span className="font-mono-code text-[12px]">:5050</span> and waits for an antenna. No antenna? Start the simulator instead — it connects to the same port.</li>
              <li><span className="font-mono-code text-[12px] text-[#3CB992]">4</span> TDAE opens the WebSocket server and BFF opens its HTTP API.</li>
              <li><span className="font-mono-code text-[12px] text-[#3CB992]">5</span> The console is served, and the first operator signs in with a passkey.</li>
            </ol>
          </div>

          <div className="rounded-md border border-[#2B303B] bg-[#14161B]/70 p-5">
            <h3 className="text-[15px] font-bold mb-3">Opening the console</h3>
            <ol className="flex flex-col gap-2.5 text-[13.5px] text-[#A1A7B3] leading-[1.55]">
              <li><span className="font-mono-code text-[12px] text-[#3CB992]">1</span> Sign in with a passkey. The session lives in an httpOnly cookie — no token ever reaches JavaScript.</li>
              <li><span className="font-mono-code text-[12px] text-[#3CB992]">2</span> Choose tenant and role. That decides which satellites exist for this session at all.</li>
              <li><span className="font-mono-code text-[12px] text-[#3CB992]">3</span> The console asks the BFF for a snapshot: the fleet and the current value of everything in scope.</li>
              <li><span className="font-mono-code text-[12px] text-[#3CB992]">4</span> It opens the WebSocket and subscribes. From here only changes are sent, not whole states.</li>
              <li><span className="font-mono-code text-[12px] text-[#3CB992]">5</span> Values start landing. Anything that stops arriving dims itself rather than lying to you.</li>
            </ol>
          </div>
        </div>
      </Section>

      {/* 03 — downlink */}
      <Section
        n="03 · THE WAY DOWN"
        title="From radio waves to a number on screen"
        lead="This is the path a single temperature reading takes. Each block is a separate engine; the blue line under each one is the Kafka topic it publishes to."
      >
        <Flow>
          <Block tone="slate" kicker="STEP 1" title="Frame Ingest" lines={['Reads the modem stream', 'Tags antenna, pass, receive time']} out="telemetry.raw.frames" />
          <Block tone="teal" kicker="STEP 2" title="TFPE" lines={['Sync marker 0x1ACFFC1D', 'CRC-16 check', 'Counts frames, spots gaps', 'Reassembles split packets']} out="telemetry.space.packets" />
          <Block tone="teal" kicker="STEP 3" title="TPPP" lines={['Finds the XTCE definition', 'Pulls out each parameter', 'Raw counts → °C, V, RPM', 'Checks limits with hysteresis']} out="telemetry.processed" />
          <Block tone="blue" kicker="STEP 4" title="TDAE" lines={['Writes the current value to Redis', 'Archives history to TimescaleDB', 'Pushes deltas to browsers']} out="ws :8088/ws/telemetry" />
          <Block tone="teal" kicker="STEP 5" title="The console" lines={['Renders without easing', 'Stale values dim themselves']} />
        </Flow>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="rounded-md border border-[#C62828]/40 bg-[#C62828]/[0.06] p-4">
            <h4 className="text-[13.5px] font-bold text-[#FF6B6B] mb-1.5">When a frame is broken</h4>
            <p className="text-[13px] leading-[1.55] text-[#A1A7B3]">
              Lost sync or a failed CRC does not get quietly dropped. The frame goes to
              <span className="font-mono-code text-[12px] text-[#FF6B6B]"> dead.letter</span>, where the Dead Letter
              Monitor counts it and raises it. Silent loss is the one failure mode you can never debug.
            </p>
          </div>
          <div className="rounded-md border border-[#E8943A]/40 bg-[#E8943A]/[0.06] p-4">
            <h4 className="text-[13.5px] font-bold text-[#E8943A] mb-1.5">When frames are missing</h4>
            <p className="text-[13px] leading-[1.55] text-[#A1A7B3]">
              TFPE counts virtual-channel frames. A jump means loss, so it publishes to
              <span className="font-mono-code text-[12px] text-[#E8943A]"> telemetry.gaps</span> and Gap Replay expands
              that into the exact missing frame numbers and asks the station recording for them.
            </p>
          </div>
          <div className="rounded-md border border-[#2B303B] bg-[#14161B]/70 p-4">
            <h4 className="text-[13.5px] font-bold mb-1.5">When a limit is crossed</h4>
            <p className="text-[13px] leading-[1.55] text-[#A1A7B3]">
              TPPP raises <span className="font-mono-code text-[12px] text-[#4A9EFF]">alarm.events</span> in the same
              pass as the value. Alarm Manager removes repeats inside a 30-second window, so one
              flapping sensor cannot bury the operator.
            </p>
          </div>
        </div>
      </Section>

      {/* 04 — uplink */}
      <Section
        n="04 · THE WAY UP"
        title="From a click to a command the spacecraft accepts"
        lead="Commanding is deliberately the narrowest path in the system. There is one door in, the checks happen before encoding rather than after, and a critical command stops dead until a second person touches their passkey."
      >
        <Flow>
          <Block tone="slate" kicker="STEP 1" title="Console" lines={['Typed parameters from the dictionary', 'Every gate shown before you send']} out="POST /api/v1/commands" />
          <Block tone="teal" kicker="STEP 2" title="Command Gateway" lines={['The only entry point', 'Idempotency key', 'Records who asked']} out="raw.commands" />
          <Block tone="amber" kicker="STEP 3" title="UPE — safety" lines={['L1 parameter ranges', 'L2 spacecraft state + interlocks', 'L3 authorisation', 'Stale telemetry fails closed']} out="tc.packets" />
          <Block tone="teal" kicker="STEP 4" title="UTFE — COP-1" lines={['FOP-1 sequence control', 'Builds the CLTU', 'Retransmits when told to']} out="CLTU → station" />
          <Block tone="blue" kicker="STEP 5" title="CLCW comes back" lines={['Rides down with telemetry', 'TFPE extracts it', 'Command marked acknowledged']} out="clcw.events" />
        </Flow>

        <div className="rounded-md border border-[#9C9AEC]/40 bg-[#9C9AEC]/[0.06] p-5 max-w-[880px]">
          <h4 className="text-[14px] font-bold text-[#9C9AEC] mb-2">Why a command cannot be sent twice</h4>
          <p className="text-[13.5px] leading-[1.65] text-[#A1A7B3]">
            Three things stack up. Only one encoder holds the lease for a given satellite, and that
            lease carries a fencing epoch — a frame stamped with an older epoch is refused, so a
            process that was presumed dead cannot wake up and transmit. Each command carries an
            idempotency key, so a retried request is recognised rather than repeated. And COP-1
            itself numbers every frame, so the spacecraft rejects anything out of order. It is not a
            rule somebody has to remember; there is no path through the code where it happens.
          </p>
        </div>
      </Section>

      {/* 05 — engines table */}
      <Section
        n="05 · THE ENGINES"
        title="Who does what"
        lead="Twelve services. Read this as a directory — each row is one engine, what it consumes, what it produces, and the job it owns."
      >
        <div className="overflow-x-auto rounded-md border border-[#2B303B]">
          <table className="w-full border-collapse min-w-[860px]">
            <thead>
              <tr className="bg-[#14161B]">
                {['Engine', 'Reads', 'Writes', 'What it owns'].map((h) => (
                  <th key={h} className="text-left font-bold text-[10.5px] uppercase tracking-[0.06em] text-[#A1A7B3] px-3.5 py-2.5 border-b border-[#2B303B]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ENGINES.map((e) => (
                <tr key={e.name} className="align-top hover:bg-[#1A1D24]/60">
                  <td className="px-3.5 py-3 border-b border-[#23272F]">
                    <div className="text-[13.5px] font-bold">{e.name}</div>
                    <div className="font-mono-code text-[11px] text-[#5E6572]">{e.pkg}</div>
                  </td>
                  <td className="px-3.5 py-3 border-b border-[#23272F] font-mono-code text-[11.5px] text-[#A1A7B3]">{e.eats}</td>
                  <td className="px-3.5 py-3 border-b border-[#23272F] font-mono-code text-[11.5px] text-[#4A9EFF]">{e.emits}</td>
                  <td className="px-3.5 py-3 border-b border-[#23272F] text-[13px] text-[#A1A7B3] leading-[1.5] max-w-[420px]">{e.job}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 06 — adding a satellite */}
      <Section
        n="06 · ADDING A SATELLITE"
        title="Seven steps, no redeployment"
        lead="A new spacecraft is configuration, not code. Every engine keys its work on SCID, so the moment the configuration exists and the satellite is enabled, the pipeline starts handling it. The fleet below is 50 satellites across three tenants and two orbit regimes for exactly this reason: growth is rows, not a rewrite."
      >
        <div className="flex items-center justify-between gap-4 rounded-md border border-[#3CB992]/40 bg-[#3CB992]/[0.06] px-5 py-4">
          <p className="text-[13px] text-[#A1A7B3]">
            This isn't a diagram of the idea — it's the actual flow. Open Fleet overview and press
            <span className="text-[#F3F4F6] font-bold"> + Add satellite</span> to run these seven steps
            and watch a new spacecraft start ticking on the live console.
          </p>
          <Button size="sm" onClick={() => onNavigate('fleet')} className="shrink-0 gap-2">
            Try it live <ArrowRight size={14} />
          </Button>
        </div>
        <ol className="flex flex-col">
          <Step n={1} title="Register the spacecraft" where="satellite_config · S19 Mission database">
            Give it its SCID — the identifier inside every frame it will ever send — plus a name, its
            two TLE lines for orbit prediction, and the antennas allowed to work it. The SCID is the
            primary key the whole system partitions on, so this row has to exist first.
          </Step>
          <Step n={2} title="Declare its virtual channels" where="vcid_config">
            A spacecraft splits its downlink into virtual channels: housekeeping on one, events on
            another, bulk payload on a third. Declaring them with their expected frame rates is what
            lets TFPE notice when frames stop arriving on a channel.
          </Step>
          <Step n={3} title="Load the telemetry and command dictionary" where="xtce_parameters · S19 Mission database">
            This is the real work. The XTCE file says, for every parameter: which APID carries it,
            which bits inside the packet it occupies, its type and byte order, how to turn raw counts
            into engineering units, and its limits. Without it a packet is just bytes — with it, it
            is BAT_TEMP at 18.5 °C.
          </Step>
          <Step n={4} title="Set alarm limits" where="alarm_definitions · S06 Alarm console">
            Warning and critical limits at each end, plus a hysteresis percentage so a value sitting
            exactly on a threshold does not raise and clear an alarm every second.
          </Step>
          <Step n={5} title="Correlate its clock" where="obt_correlation">
            Spacecraft keep their own time. Three coefficients map on-board time to UTC per pass, so
            a value archived today lines up with a value from last month.
          </Step>
          <Step n={6} title="Book ground contacts" where="S09 Contact schedule · S10 Ground stations">
            Predicted windows come from the orbit; bookings turn a window into a real pass on a real
            station. Only then does the satellite have anyone to talk to.
          </Step>
          <Step n={7} title="Verify on the simulator, then enable it" where="S23 Simulator">
            Run the new dictionary against simulated frames and confirm every parameter decodes and
            every limit behaves. Then set the satellite enabled — the engines pick it up on the next
            frame. Nothing is rebuilt and nothing is restarted.
          </Step>
        </ol>

        <div className="rounded-md border border-[#0F6E56] bg-[#0F6E56]/[0.08] p-5 max-w-[880px]">
          <h4 className="text-[14px] font-bold text-[#3CB992] mb-2">Why the hundredth satellite is no harder than the second</h4>
          <p className="text-[13.5px] leading-[1.65] text-[#A1A7B3]">
            Because nothing in the pipeline holds global state. Kafka partitions by SCID, Redis keys
            include it, the archive is partitioned by it, and every authorisation decision is scoped
            by tenant and satellite. Adding spacecraft adds partitions and pods; it does not add
            coordination between them. The dictionary is compiled into memory at load time rather
            than queried per packet, so decoding cost per satellite stays flat.
          </p>
        </div>
      </Section>

      {/* 07 — what you can do */}
      <Section
        n="07 · FROM THE CONSOLE"
        title="What an operator can actually do"
        lead="Twenty-nine screens in eight groups. The navigation follows the work, not the services behind it."
      >
        <div className="grid md:grid-cols-2 gap-4">
          {UI_CAPABILITIES.map((c) => (
            <div key={c.flow} className="rounded-md border border-[#2B303B] bg-[#14161B]/70 p-5 flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[15px] font-bold">{c.flow}</h3>
                <span className="font-mono-code text-[11px] text-[#3CB992]">{c.screens}</span>
              </div>
              <ul className="flex flex-col gap-2">
                {c.items.map((i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] leading-[1.55] text-[#A1A7B3]">
                    <span className="text-[#3CB992] mt-[1px]" aria-hidden="true">▸</span>{i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* 08 — presentation */}
      <Section
        n="08 · HOW IT REACHES THE SCREEN"
        title="Why the number in front of you can be trusted"
        lead="Getting data to a browser is easy. Getting it there fast, and never showing something that is no longer true, is the part worth explaining."
      >
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { t: 'Conflation', d: 'If a parameter updates ten times while the browser is busy, the browser gets the latest value, not ten. Queues cannot build a backlog that puts the display behind reality.' },
            { t: 'A priority lane', d: 'Alarms and command status never share the conflated lane. They arrive unconflated so nothing can delay the one message that needs a person.' },
            { t: 'Staleness, shown', d: 'Every value carries its own timestamp. Miss three expected updates and the console dims it and labels its last update. A frozen number never looks live.' },
            { t: 'No animation on data', d: 'Values snap to what arrived. A number easing from 18 to 12 is a lie about a rate of change, and on a pass that lasts eight minutes, that lie is expensive.' },
          ].map((x) => (
            <div key={x.t} className="rounded-md border border-[#2B303B] bg-[#14161B]/70 p-4 flex flex-col gap-1.5">
              <h4 className="text-[13.5px] font-bold">{x.t}</h4>
              <p className="text-[13px] leading-[1.55] text-[#A1A7B3]">{x.d}</p>
            </div>
          ))}
        </div>

        <div className="rounded-md border border-[#2B303B] bg-[#14161B]/70 p-5">
          <h4 className="text-[14px] font-bold mb-3">The 100 ms budget, spent</h4>
          <div className="flex flex-col gap-2.5">
            {[['Link Gateway receive → Kafka', 18], ['TFPE deframe + CRC', 21], ['TPPP decommutate + limits', 24], ['TDAE → WebSocket → render', 13]].map(([label, ms]) => (
              <div key={label as string}>
                <div className="flex justify-between text-[12.5px] mb-1">
                  <span>{label}</span>
                  <span className="font-mono-code tabular-nums text-[#A1A7B3]">{ms} ms</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#1A1D24]">
                  <div className="h-full rounded-full bg-[#4A9EFF]" style={{ width: `${ms as number}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[13px] text-[#A1A7B3] mt-3.5 leading-[1.55]">
            Seventy-six milliseconds of the hundred, measured at the 99th percentile from the moment
            the antenna hands over the frame to the moment the browser paints it. The remainder is
            headroom for a bad day.
          </p>
        </div>
      </Section>

      {/* CTA */}
      <div className="rounded-lg border border-[#2B303B] bg-gradient-to-r from-[#23272F]/40 to-[#14161B]/60 px-6 py-7 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[18px] font-bold">See it running</h3>
          <p className="text-[13.5px] text-[#A1A7B3]">
            The guided demo takes one heater fault through detection, diagnosis, approval and recovery in six minutes.
          </p>
        </div>
        <div className="flex gap-3 shrink-0">
          <Button variant="secondary" onClick={() => onNavigate('fleet')}>Open the console</Button>
          <Button onClick={() => onNavigate('landing')} className="gap-2">
            Start guided demo <ArrowRight size={16} />
          </Button>
        </div>
      </div>

      <footer className="border-t border-[#23272F] pt-6 pb-4 text-[12px] text-[#5E6572] flex flex-col md:flex-row justify-between gap-2">
        <span>CCSDS 132.0 · 133.0 · 232.0 · 232.1 (COP-1) · 660.0 (XTCE)</span>
        <span>Akashaveda Space Technologies · Confidential</span>
      </footer>
    </div>
  </div>
);
