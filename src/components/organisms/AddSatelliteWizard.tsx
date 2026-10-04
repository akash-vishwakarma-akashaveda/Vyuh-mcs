import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { clsx } from 'clsx';
import { Check, Loader2, Radio, Satellite as SatelliteIcon, X as XIcon } from 'lucide-react';
import { Button } from '../atoms/Button';
import { overlay, modal } from '../../lib/motion';
import { PARAMETERS, STATIONS, TENANTS } from '../../data/fleet';
import { SampleTag } from '../molecules/Page';
import { can } from '../../auth/policy';
import { passes } from '../../orbit/orbit';
import { satElements } from '../../orbit/fleetOrbit';
import { mockEngine } from '../../mocks/mockTelemetryEngine';
import { useFleetStore } from '../../store/useFleetStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useMissionStore } from '../../store/useMissionStore';
import { Satellite } from '../../types';
import { Select } from '../molecules/Select';

const PREFIX: Record<string, string> = { Akashaveda: 'AKV', 'Nabhas Agritech': 'NBH', 'Terra Analytics': 'TRA' };
const REGIMES = ['LEO', 'MEO'] as const;

const STEPS = [
  'Register spacecraft',
  'Virtual channels',
  'Telemetry dictionary',
  'Alarm limits',
  'Clock correlation',
  'Book ground contacts',
  'Verify and enable',
] as const;

/**
 * The live version of Architecture §06's seven steps. Every field here maps to
 * a real config table named on that page (`satellite_config`, `vcid_config`,
 * `xtce_parameters`, `alarm_definitions`, `obt_correlation`); "Enable" calls
 * the same telemetry engine that runs the other 50 satellites, so the new one
 * starts ticking in front of whoever is watching, not just in a toast.
 */
export const AddSatelliteWizard: React.FC<{ onClose: () => void; onNavigate: (to: string) => void }> = ({
  onClose, onNavigate,
}) => {
  const liveFleet = useFleetStore((s) => s.satellites);
  const addAudit = useMissionStore((s) => s.appendAudit);
  const actor = useAuthStore((s) => s.user.name);
  const actorId = useAuthStore((s) => s.user.id);
  const role = useAuthStore((s) => s.activeRole);
  const allowed = can('platform:admin', role);

  const [step, setStep] = useState(0);
  const [tenant, setTenant] = useState(TENANTS[0]);
  const [regime, setRegime] = useState<(typeof REGIMES)[number]>('LEO');
  const [stations, setStations] = useState<string[]>(['HYD']);
  const [verifying, setVerifying] = useState(false);
  const [checks, setChecks] = useState<{ label: string; pass: boolean }[] | null>(null);
  const verified = !!checks && checks.every((c) => c.pass);
  const [enabling, setEnabling] = useState(false);

  // Next free SCID for this tenant's prefix — scans the *live* fleet, not the
  // static seed data, so this is correct after the second and third satellite
  // added in the same session, not just the first.
  const prefix = PREFIX[tenant];
  const nextNumber = useMemo(() => {
    const used = Object.keys(liveFleet)
      .filter((id) => id.startsWith(prefix))
      .map((id) => Number(id.slice(prefix.length + 1)))
      .filter((n) => !Number.isNaN(n));
    return (used.length ? Math.max(...used) : 0) + 1;
  }, [liveFleet, prefix]);
  const scid = `${prefix}-${String(nextNumber).padStart(2, '0')}`;

  const toggleStation = (id: string) =>
    setStations((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // Each new satellite gets its own place in the sky: RAAN and phase step with its number (golden angle),
  // so two satellites added in one session never share an orbit.
  const buildSat = (): Satellite => {
    const now = new Date().toISOString();
    const isMeo = regime === 'MEO';
    return {
      sat_id: scid,
      name: `${tenant.split(' ')[0]} ${scid}`,
      status: 'ACTIVE',
      orbit_regime: regime,
      constellation_group: 'Plane E', // new satellites land in their own plane until reassigned
      health_state: 'NOMINAL',
      last_contact_utc: null,
      next_contact_utc: now,
      latitude: 0,
      longitude: 0,
      altitude_km: isMeo ? 8062 : 521,
      velocity_kms: isMeo ? 4.87 : 7.61,
      period_minutes: isMeo ? 360.0 : 94.8,
      inclination_deg: isMeo ? 55.0 : 97.4,
      eccentricity: 0.0012,
      raan_deg: (nextNumber * 47 + (prefix.charCodeAt(0) % 9) * 11) % 360,
      arg_of_perigee_deg: 0,
      true_anomaly_deg: (nextNumber * 137.508) % 360,
      apogee_km: isMeo ? 8062 : 529,
      perigee_km: isMeo ? 8048 : 514,
      assigned_ground_stations: stations,
      mib_version: 'akv-mdb 4.19.0',
    };
  };

  /** Real checks the console can make itself; the simulator run is not connected, and the screen says so. */
  const runVerification = () => {
    setVerifying(true);
    const sat = buildSat();
    const t = Date.now();
    const contacts = stations.reduce((n, id) => {
      const st = STATIONS.find((x) => x.id === id);
      return n + (st ? passes(satElements(sat), st, t, 24 * 3600_000, 10, 120_000).length : 0);
    }, 0);
    const nParams = Object.values(PARAMETERS).flat().length;
    setChecks([
      { label: `${scid} is not already in the fleet`, pass: !liveFleet[scid] },
      { label: `Dictionary akv-mdb 4.19.0 defines ${nParams} parameters with limits`, pass: nParams > 0 },
      { label: `${stations.length} station${stations.length === 1 ? '' : 's'} chosen, all in the ground network`, pass: stations.length > 0 && stations.every((id) => STATIONS.some((x) => x.id === id)) },
      { label: `Orbit gives ${contacts} contact${contacts === 1 ? '' : 's'} over those stations in the next 24 h`, pass: contacts > 0 },
    ]);
    setVerifying(false);
  };

  const enable = () => {
    if (!allowed.allowed) return;
    setEnabling(true);
    const newSat = buildSat();

    window.setTimeout(() => {
      mockEngine.registerSatellite(newSat);
      addAudit({
        timestamp_utc: new Date().toISOString(), operator_id: actorId, operator_name: actor,
        sat_id: scid, command_mnemonic: 'SATELLITE_ONBOARD', procedure_id: '—', procedure_version: '—',
        sequence_count: 0, result: 'ACK',
        params_summary: `tenant=${tenant} orbit=${regime} stations=${stations.join('/')} dictionary=akv-mdb 4.19.0`,
      });
      onClose();
      onNavigate(`satellite?sat=${scid}`);
    }, 900);
  };

  const canNext =
    step === 5 ? stations.length > 0
    : step === 6 ? verified
    : true;

  return (
    <>
      <motion.div variants={overlay} initial="hidden" animate="show" exit="exit"
        onClick={onClose} className="fixed inset-0 bg-[#161A22]/60 backdrop-blur-[2px] z-50" />

      <motion.div variants={modal} initial="hidden" animate="show" exit="exit"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div role="dialog" aria-modal="true" aria-label="Add satellite"
          className="pointer-events-auto w-[720px] max-w-full max-h-[88vh] flex flex-col bg-[#11141B] border border-[#1A1E27] rounded-2xl overflow-hidden"
          style={{ boxShadow: 'var(--lift-3)' }}>

          <header className="flex items-center gap-3 px-6 h-16 shrink-0 border-b border-[#171B24]">
            <span className="w-9 h-9 rounded-lg bg-[#2F3A4F]/15 flex items-center justify-center">
              <SatelliteIcon size={18} className="text-[#6CB8FF]" />
            </span>
            <div className="flex flex-col">
              <h2 className="text-[15px] font-bold">Add satellite</h2>
              <p className="text-[11.5px] text-[#7C8594]">Configuration, not code — Architecture §06</p>
            </div>
            <button onClick={onClose} aria-label="Close"
              className="ml-auto w-8 h-8 rounded flex items-center justify-center text-[#7C8594] hover:text-[#E9ECF1] hover:bg-[#161A22]">
              ✕
            </button>
          </header>

          {/* Step rail */}
          <div className="flex items-center gap-1 px-6 py-3 border-b border-[#171B24] overflow-x-auto shrink-0">
            {STEPS.map((label, i) => (
              <React.Fragment key={label}>
                <div className={clsx('flex items-center gap-1.5 shrink-0', i > step && 'opacity-40')}>
                  <span className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                    i < step ? 'bg-[#2F3A4F] text-white' : i === step ? 'bg-[#2F3A4F]/20 text-[#6CB8FF] ring-1 ring-[#6CB8FF]' : 'bg-[#161A22] text-[#7C8594]')}>
                    {i < step ? <Check size={11} /> : i + 1}
                  </span>
                  <span className={clsx('text-[11.5px] whitespace-nowrap', i === step ? 'text-[#E9ECF1] font-bold' : 'text-[#7C8594]')}>{label}</span>
                </div>
                {i < STEPS.length - 1 && <span className="w-4 h-px bg-[#2A303D] shrink-0" />}
              </React.Fragment>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.16 }}>

                {step === 0 && (
                  <div className="flex flex-col gap-4">
                    <Field label="Tenant" hint="Who this spacecraft belongs to — decides its data scope for good (C-06).">
                      <Select value={tenant} onChange={(e) => setTenant(e.target.value)}
                        className="h-9 bg-[#161A22] border border-[#232936] rounded-xl px-2.5 text-[13px] w-full text-[#E9ECF1]">
                        {TENANTS.map((t) => <option key={t}>{t}</option>)}
                      </Select>
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Spacecraft ID (SCID)" hint="Assigned from the tenant's prefix — the key every engine partitions on.">
                        <div className="h-9 flex items-center px-2.5 rounded border border-[#2A303D] bg-[#171B24] mono text-[13px] text-[#6CB8FF] font-bold">
                          {scid}
                        </div>
                      </Field>
                      <Field label="Orbit regime">
                        <Select value={regime} onChange={(e) => setRegime(e.target.value as typeof regime)}
                          className="h-9 bg-[#161A22] border border-[#232936] rounded-xl px-2.5 text-[13px] w-full text-[#E9ECF1]">
                          {REGIMES.map((r) => <option key={r}>{r}</option>)}
                        </Select>
                      </Field>
                    </div>
                    <Field label="Two-line element (TLE)" hint="Supplied by Flight Dynamics on commissioning — shown here as it would arrive.">
                      <div className="mono text-[11.5px] text-[#7C8594] bg-[#171B24] border border-[#2A303D] rounded p-3 leading-[1.6]">
                        1 {90000 + nextNumber}U 26100A   26261.50000000  .00001000  00000-0  50000-4 0  9991<br />
                        2 {90000 + nextNumber} {regime === 'MEO' ? '55.0000' : '97.4000'} 072.0000 0012000 041.0000 029.0000 {regime === 'MEO' ? '4.00' : '15.12'}345678 1001
                      </div>
                    </Field>
                  </div>
                )}

                {step === 1 && (
                  <StepNote title="Declare its virtual channels" table="vcid_config">
                    <p>Housekeeping, events and bulk payload split onto separate channels so a stall in one is never confused with a stall in another.</p>
                    <div className="flex flex-col gap-2 mt-3">
                      {[['VC0', 'Housekeeping', '120 f/s'], ['VC1', 'Events', '18 f/s'], ['VC7', 'Payload bulk', '120 f/s']].map(([id, name, rate]) => (
                        <div key={id} className="flex items-center justify-between px-3 py-2 rounded border border-[#2A303D] bg-[#171B24]">
                          <span className="mono text-[12px] text-[#6CB8FF]">{id}</span>
                          <span className="text-[12.5px] text-[#C9CED6]">{name}</span>
                          <span className="mono text-[11.5px] text-[#7C8594]">{rate}</span>
                        </div>
                      ))}
                    </div>
                  </StepNote>
                )}

                {step === 2 && (
                  <StepNote title="Load the telemetry and command dictionary" table="xtce_parameters">
                    <p>This is the real work: every parameter's APID, bit offset, calibration and limits. Without it, a packet is bytes — with it, it's BAT_TEMP at 18.5 °C.</p>
                    <Field label="Dictionary bundle" className="mt-3">
                      <div className="h-9 flex items-center px-2.5 rounded border border-[#2A303D] bg-[#171B24] mono text-[13px] text-[#E9ECF1]">
                        akv-mdb 4.19.0 <span className="ml-2 text-[#4ADE9A] text-[11px]">ACTIVE</span>
                      </div>
                    </Field>
                    <p className="text-[12px] text-[#7C8594] mt-2">A tenant with its own instrument set releases its own bundle through S19 Mission database — two reviewers, compiled and signed, same as this one was.</p>
                  </StepNote>
                )}

                {step === 3 && (
                  <StepNote title="Set alarm limits" table="alarm_definitions">
                    <p>Inherited from the dictionary's AKV-class defaults below; override any one afterward in Mission database.</p>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      {[['BUS_VOLTAGE', '26 – 31 V'], ['BAT_TEMP', '10 – 40 °C'], ['CPU_LOAD', '0 – 85 %']].map(([p, r]) => (
                        <div key={p} className="rounded border border-[#2A303D] bg-[#171B24] px-3 py-2">
                          <div className="mono text-[11.5px] text-[#6CB8FF]">{p}</div>
                          <div className="text-[11.5px] text-[#7C8594]">{r}</div>
                        </div>
                      ))}
                    </div>
                  </StepNote>
                )}

                {step === 4 && (
                  <StepNote title="Correlate its clock" table="obt_correlation">
                    <p>On-board time maps to UTC per pass so archived values line up months later. Coefficients are generated at first contact.</p>
                    <div className="mono text-[12px] text-[#C9CED6] bg-[#171B24] border border-[#2A303D] rounded p-3 mt-3">
                      UTC = a0 + a1·OBT + a2·OBT²<br />
                      a0 = 0.000000&nbsp;&nbsp;a1 = 1.000002&nbsp;&nbsp;a2 = 0.000000
                    </div>
                  </StepNote>
                )}

                {step === 5 && (
                  <div className="flex flex-col gap-3">
                    <h3 className="text-[14px] font-bold">Book ground contacts</h3>
                    <p className="text-[12.5px] text-[#7C8594]">Pick at least one station. Only then does the satellite have anyone to talk to.</p>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      {STATIONS.map((s) => {
                        const on = stations.includes(s.id);
                        return (
                          <button key={s.id} type="button" onClick={() => toggleStation(s.id)}
                            className={clsx('flex items-center gap-2.5 px-3 py-2.5 rounded border text-left transition-colors',
                              on ? 'border-[#6CB8FF] bg-[#2F3A4F]/10' : 'border-[#2A303D] bg-[#171B24] hover:border-[#343B4A]')}>
                            <span className={clsx('w-4 h-4 rounded-[4px] flex items-center justify-center shrink-0',
                              on ? 'bg-[#2F3A4F]' : 'border border-[#343B4A]')}>
                              {on && <Check size={11} className="text-white" />}
                            </span>
                            <span className="flex flex-col min-w-0">
                              <span className="text-[12.5px] font-bold truncate">{s.name}</span>
                              <span className="mono text-[10.5px] text-[#7C8594]">{s.id} · {s.protocol}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {step === 6 && (
                  <div className="flex flex-col gap-4">
                    <h3 className="text-[14px] font-semibold">Check, then enable</h3>
                    <p className="text-[12.5px] text-[#7C8594]">
                      The console checks the registration, dictionary, stations and orbit it can see. The simulator run against real frames is not connected yet.
                    </p>

                    <span className="flex flex-wrap items-center gap-2">
                      <Button variant="secondary" onClick={runVerification} disabled={verifying} className="self-start">
                        {verifying ? <Loader2 size={14} className="animate-spin" /> : <Radio size={14} />}
                        {checks ? 'Run the checks again' : 'Run console checks'}
                      </Button>
                      <SampleTag>Simulator verification not connected</SampleTag>
                    </span>
                    {checks && (
                      <div className="flex flex-col gap-1.5">
                        {checks.map((c) => (
                          <div key={c.label} className={clsx('flex items-center gap-2 text-[12.5px]', c.pass ? 'text-[#4ADE9A]' : 'text-[#FF7A7A]')}>
                            {c.pass ? <Check size={14} /> : <XIcon size={14} />} {c.label}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="rounded border border-[#2A303D] bg-[#171B24] p-3 text-[12px] text-[#7C8594] mono">
                      {scid} · {tenant} · {regime} · {stations.join(', ')}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <footer className="flex items-center justify-between px-6 h-16 border-t border-[#171B24] shrink-0">
            <Button variant="ghost" onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}>
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>Continue</Button>
            ) : (
              <Button onClick={enable} disabled={!verified || enabling || !allowed.allowed} reason={!allowed.allowed ? allowed.reason : !verified ? 'Run the checks first; every one must pass' : undefined}>
                {enabling ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {enabling ? 'Enabling…' : `Enable ${scid}`}
              </Button>
            )}
          </footer>
        </div>
      </motion.div>
    </>
  );
};

const Field: React.FC<{ label: string; hint?: string; className?: string; children: React.ReactNode }> = ({
  label, hint, className, children,
}) => (
  <div className={clsx('flex flex-col gap-1.5', className)}>
    <label className="text-[12.5px] text-[#9AA3B2]">{label}</label>
    {children}
    {hint && <span className="text-[11.5px] text-[#7C8594] leading-snug">{hint}</span>}
  </div>
);

const StepNote: React.FC<{ title: string; table: string; children: React.ReactNode }> = ({ title, table, children }) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="text-[14px] font-bold">{title}</h3>
      <span className="mono text-[10.5px] text-[#7C8594]">{table}</span>
    </div>
    <div className="text-[12.5px] text-[#B9C2D8] leading-[1.55]">{children}</div>
  </div>
);
