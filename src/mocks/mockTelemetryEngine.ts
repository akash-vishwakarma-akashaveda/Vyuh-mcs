import { useFleetStore } from '../store/useFleetStore';
import { useAlarmStore } from '../store/useAlarmStore';
import { useMissionStore, demoAdvisoryNow } from '../store/useMissionStore';
import { FLEET, PARAMETERS, PASSES, STATIONS } from '../data/fleet';
import { ContactWindow, Param, Satellite } from '../types';
import { passes, propagate } from '../orbit/orbit';
import { satElements } from '../orbit/fleetOrbit';

const BAT_TEMP_NOMINAL = 18.5;
const FALL_RATE = 0.9;   // °C per tick once heater A has failed
const RISE_RATE = 0.7;   // °C per tick once heater B is on
const WARN_LOW = 10.0;   // BAT_TEMP warning limit — raises AL-801
const ADVISORY_DELAY_TICKS = 10; // Q-07: multivariate advisory arrives within ~10 s

/**
 * Satellites that sit permanently off-nominal, so the fleet is not uniformly
 * green and every subsystem gets a turn — seven different real conditions
 * across three tenants and two orbit regimes, not one fault repeated seven
 * times. Must match `SEEDED_WARNING` in data/fleet.ts (that set is what the
 * console paints on first frame, before the engine's first tick lands).
 */
const SEEDED: Record<string, { param: string; value: number }[]> = {
  'AKV-08': [{ param: 'RW1_SPEED', value: 5240 }],   // ADCS   — wheel friction rising
  'AKV-14': [{ param: 'BUS_VOLTAGE', value: 26.3 }], // POWER  — bus voltage trending low
  'AKV-22': [{ param: 'TX_TEMP', value: 61.4 }],     // COMMS  — transmitter running hot
  'AKV-31': [{ param: 'STORAGE_USED', value: 902 }], // PAYLOAD — mass memory filling up
  'AKV-39': [{ param: 'RAD_TEMP', value: 11.2 }],    // THERMAL — radiator elevated
  'NBH-02': [{ param: 'BAT_SOC', value: 38.4 }],     // POWER  — low charge after eclipse
  'TRA-01': [{ param: 'SNR', value: 7.4 }],          // COMMS  — downlink SNR degraded (MEO)
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 1 Hz simulation of 12 satellites × ~42 parameters. Values wander inside their
 * limits by their own drift rate; the AKV-03 heater story is deterministic so the
 * demo tells the same story every time. No easing anywhere — a value is shown the
 * moment it arrives (SRS §3.7).
 */
class MockTelemetryEngine {
  private timer: number | null = null;
  private tick = 0;
  private faultTick = 0;
  private batTemp = BAT_TEMP_NOMINAL;
  private running = false;
  /** Satellites driven by the live backend instead of this simulation. */
  private live = new Set<string>();
  /** Per satellite, per parameter: the wandering value the engine keeps between ticks. */
  private values: Record<string, Record<string, number>> = {};

  start() {
    if (this.running) return;
    this.running = true;

    const fleet = useFleetStore.getState();
    fleet.setSatellites(FLEET);
    fleet.setContactWindows(contactWindows());

    for (const sat of FLEET) this.seedSatellite(sat.sat_id);

    this.timer = window.setInterval(() => this.step(), 1000);
  }

  /**
   * Populates a satellite's whole CVT from the dictionary once. Called at
   * startup for the base fleet and again — live, mid-session — whenever the
   * onboarding wizard enables a new one: the same code path either way, which
   * is the point (a new satellite is data, never a special case in the engine).
   */
  private seedSatellite(satId: string) {
    const fleet = useFleetStore.getState();
    this.values[satId] = {};
    for (const [subsystem, params] of Object.entries(PARAMETERS)) {
      for (const p of params) {
        const seeded = SEEDED[satId]?.find((s) => s.param === p.param_id);
        // Spread the fleet out so no two satellites read identically.
        const offset = seeded ? 0 : (hash(satId + p.param_id) % 100 - 50) / 100 * p.drift * 6;
        const value = seeded ? seeded.value : p.value + offset;
        this.values[satId][p.param_id] = value;

        fleet.updateParam(satId, p.param_id, {
          name: p.name,
          subsystem: subsystem as Param['subsystem'],
          eu_value: round(value),
          unit: p.unit,
          limit_low_soft: p.warnLo, limit_hi_soft: p.warnHi,
          limit_low_hard: p.critLo, limit_hi_hard: p.critHi,
          alarm_state: alarmState(value, p),
          quality: 0,
          timestamp_utc: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * Brings a satellite onto the live fleet: adds it to the store and seeds its
   * telemetry from the same dictionary every other satellite reads from. From
   * the next tick it drifts and alarms exactly like one that was there at boot.
   */
  registerSatellite(sat: Satellite) {
    useFleetStore.getState().addSatellite(sat);
    this.seedSatellite(sat.sat_id);
  }

  /** Hand these satellites to the live link; the simulation leaves their telemetry alone from now on. */
  setLiveSatellites(ids: string[]) {
    this.live = new Set(ids);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
  }

  reset() {
    this.tick = 0;
    this.faultTick = 0;
    this.batTemp = BAT_TEMP_NOMINAL;
  }

  private step() {
    this.tick++;
    const fleet = useFleetStore.getState();
    if (this.tick % 300 === 0) fleet.setContactWindows(contactWindows()); // passes roll forward with the clock
    const mission = useMissionStore.getState();
    const now = new Date().toISOString();

    const updates: { sat_id: string; params: Record<string, Partial<Param>> }[] = [];

    for (const sat of Object.values(fleet.satellites)) {
      // Position follows the satellite's real orbit; nothing here is a random walk.
      const pos = propagate(satElements(sat), Date.now());
      fleet.updateSatellite(sat.sat_id, {
        latitude: Number(pos.lat.toFixed(4)),
        longitude: Number(pos.lon.toFixed(4)),
        velocity_kms: Number(pos.speedKms.toFixed(2)),
      });

      // A satellite the backend is really flying is not simulated: its telemetry arrives
      // over the live link, and if that link drops its values age and read as stale.
      if (this.live.has(sat.sat_id)) continue;

      const params: Record<string, Partial<Param>> = {};
      const store = this.values[sat.sat_id] ?? {};

      for (const defs of Object.values(PARAMETERS)) {
        for (const p of defs) {
          if (p.drift === 0) continue;                                   // discrete states hold
          if (sat.sat_id === 'AKV-03' && p.param_id === 'BAT_TEMP') continue; // story-driven

          // Random walk pulled gently back toward the seed so nothing runs away.
          const current = store[p.param_id] ?? p.value;
          const pull = (p.value - current) * 0.02;
          const next = clamp(current + pull + (Math.random() - 0.5) * 2 * p.drift, p.critLo, p.critHi);
          store[p.param_id] = next;

          params[p.param_id] = { eu_value: round(next), alarm_state: alarmState(next, p), quality: 0, timestamp_utc: now };
        }
      }

      updates.push({ sat_id: sat.sat_id, params });
    }

    fleet.applyTick(updates);
    this.stepDemoScenario(mission, now);
    this.refreshHealth();
  }

  /** AKV-03 heater story — drives S03, S04, S06, S20 and the procedure runner. */
  private stepDemoScenario(mission: ReturnType<typeof useMissionStore.getState>, now: string) {
    if (this.live.has('AKV-03')) return; // the real spacecraft plays this part; see live/director.ts
    if (mission.heaterFault && !mission.heaterBOn) {
      this.faultTick++;
      this.batTemp = Math.max(4.5, this.batTemp - FALL_RATE);
    } else if (mission.heaterBOn) {
      this.batTemp = Math.min(BAT_TEMP_NOMINAL, this.batTemp + RISE_RATE);
    }

    const state: 0 | 1 | 2 = this.batTemp < 4.0 ? 2 : this.batTemp < WARN_LOW ? 1 : 0;
    const fleet = useFleetStore.getState();
    fleet.updateParam('AKV-03', 'BAT_TEMP', {
      eu_value: round(this.batTemp), alarm_state: state, timestamp_utc: now, quality: 0,
    });
    fleet.updateParam('AKV-03', 'HTR_A_DUTY', {
      eu_value: mission.heaterFault && !mission.heaterBOn ? 97 : 22, timestamp_utc: now, quality: 0,
    });
    fleet.updateParam('AKV-03', 'HTR_B_STATE', {
      eu_value: mission.heaterBOn ? 1 : 0, timestamp_utc: now, quality: 0,
    });

    // Q-07: the model notices before the limit is crossed.
    if (mission.heaterFault && this.faultTick === ADVISORY_DELAY_TICKS) {
      mission.addAdvisory(demoAdvisoryNow());
    }

    const alarms = useAlarmStore.getState();
    const existing = alarms.active.find((a) => a.alarm_id === 'AL-801');
    if (state > 0 && !existing) {
      alarms.addAlarm({
        alarm_id: 'AL-801', sat_id: 'AKV-03', param_id: 'BAT_TEMP', subsystem: 'POWER',
        alarm_state: 1, eu_value: round(this.batTemp), limit_low_soft: WARN_LOW,
        unit: '°C', timestamp_utc: now, acknowledged: false, state: 'UNACK',
        condition: `BAT_TEMP below ${WARN_LOW.toFixed(1)} °C`,
        advisory_id: 'AN-401',
        timeline: [{ utc: now, text: `BAT_TEMP crossed ${WARN_LOW.toFixed(1)} °C warning low` }],
      });
    } else if (existing && this.batTemp >= WARN_LOW + 2) {
      alarms.returnToNormal('AL-801');
    }
  }

  /** A satellite is as unhealthy as its worst parameter. */
  private refreshHealth() {
    const fleet = useFleetStore.getState();
    for (const sat of Object.values(fleet.satellites)) {
      const params = Object.values(fleet.cvt[sat.sat_id] ?? {});
      const worst = params.reduce((w, p) => Math.max(w, p.alarm_state ?? 0), 0);
      const health = worst === 2 ? 'CRITICAL' : worst === 1 ? 'WARNING' : 'NOMINAL';
      if (sat.health_state !== health) fleet.updateSatellite(sat.sat_id, { health_state: health });
    }
  }
}

const round = (v: number) => Number(v.toFixed(Math.abs(v) >= 100 ? 0 : 2));

function alarmState(v: number, p: { warnLo: number; warnHi: number; critLo: number; critHi: number }): 0 | 1 | 2 {
  if (v <= p.critLo || v >= p.critHi) return 2;
  if (v <= p.warnLo || v >= p.warnHi) return 1;
  return 0;
}

/** Cheap stable hash so each satellite's offsets are the same on every reload. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Contact windows from orbit geometry: every satellite over each of its three assigned stations,
 * next 12 hours, above 10° elevation. AKV-03 keeps its scripted passes — the guided demo relies on them.
 */
function contactWindows(): ContactWindow[] {
  const scripted: ContactWindow[] = PASSES.map((p) => ({
    window_id: p.session_id,
    sat_id: p.sat_id,
    ground_station: p.station_id,
    aos_utc: p.aos_utc,
    los_utc: p.los_utc,
    duration_seconds: Math.round((Date.parse(p.los_utc) - Date.parse(p.aos_utc)) / 1000),
    max_elevation_deg: p.max_elevation_deg,
    frequency_band: 'X',
    quality_score: 95,
    status: p.state === 'ACTIVE' ? 'AOS' : p.state === 'COMPLETE' ? 'LOS' : 'UPCOMING',
  }));
  const scriptedSats = new Set(scripted.map((w) => w.sat_id));

  const now = Date.now();
  const computed: ContactWindow[] = [];
  for (const sat of FLEET) {
    if (scriptedSats.has(sat.sat_id)) continue;
    const el = satElements(sat);
    for (const stId of sat.assigned_ground_stations) {
      const st = STATIONS.find((x) => x.id === stId);
      if (!st) continue;
      passes(el, st, now, 12 * 3600_000, 10, 60_000).forEach((p, n) => {
        computed.push({
          window_id: `W-${sat.sat_id}-${stId}-${n}`,
          sat_id: sat.sat_id,
          ground_station: stId,
          aos_utc: new Date(p.aos).toISOString(),
          los_utc: new Date(p.los).toISOString(),
          duration_seconds: Math.round((p.los - p.aos) / 1000),
          max_elevation_deg: Math.round(p.maxElevationDeg),
          frequency_band: st.bands.includes('X') ? 'X' : st.bands[0],
          quality_score: 90,
          status: p.aos <= now ? 'AOS' : 'UPCOMING',
        });
      });
    }
  }
  computed.sort((a, b) => Date.parse(a.aos_utc) - Date.parse(b.aos_utc));
  return [...scripted, ...computed];
}

export const mockEngine = new MockTelemetryEngine();
