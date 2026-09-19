import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { useLinkStore } from '../../store/useLinkStore';

const CHIP = 'h-7 hidden sm:flex whitespace-nowrap items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium';

/**
 * Says, at a glance and honestly, what is driving the numbers: the built-in
 * simulation, or the live ground segment — and whether the link to it is healthy.
 * Stale data is never presented as live: when the link drops this turns amber/red.
 */
export const LinkChip: React.FC = () => {
  const { mode, state, attempt, latency, lastMessageAt, liveSatellites } = useLinkStore();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (mode === 'mock') {
    return (
      <span className={clsx(CHIP, 'border-[#2B303B] text-[#A1A7B3] bg-[#14161B]')}
        title="No backend answered: the built-in simulation is driving this console.">
        Simulated data
      </span>
    );
  }

  const age = lastMessageAt ? Math.max(0, Math.round((now - lastMessageAt) / 1000)) : 0;
  const detail = latency
    ? `End-to-end (gateway receive → stores) P50 ${latency.p50.toFixed(0)} ms · P99 ${latency.p99.toFixed(0)} ms · ${latency.samples} samples`
    : 'Waiting for telemetry';
  const title = `${liveSatellites.length} satellites live from the Realtime Gateway. ${detail}. Last frame ${age}s ago.`;

  if (state === 'CONNECTED') {
    return (
      <span className={clsx(CHIP, 'border-[#4CAF81]/60 text-[#4CAF81] bg-[#4CAF81]/12')} title={title}>
        <span className="w-[7px] h-[7px] rounded-full bg-[#4CAF81]" />
        Live{latency ? ` · ${latency.p50.toFixed(0)} ms` : ''}
      </span>
    );
  }
  if (state === 'DISCONNECTED') {
    return (
      <span className={clsx(CHIP, 'border-[#C62828]/60 text-[#FF6B6B] bg-[#C62828]/16')}
        title={`Link lost — retrying with backoff. Telemetry on screen is ageing and will be marked stale. ${title}`}>
        Link lost · retrying
      </span>
    );
  }
  return (
    <span className={clsx(CHIP, 'border-[#E8943A]/60 text-[#E8943A] bg-[#E8943A]/12')}
      title={`Reconnecting (attempt ${attempt}). Telemetry on screen is ageing. ${title}`}>
      {state === 'CONNECTING' ? 'Connecting…' : `Reconnecting · ${attempt}`}
    </span>
  );
};
