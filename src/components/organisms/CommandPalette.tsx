import React, { useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import { CornerDownLeft, Satellite as SatelliteIcon, Search } from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';
import { useAuthStore } from '../../store/useAuthStore';
import { SCREENS } from '../../data/screens';
import { canOpen } from '../../auth/policy';
import { FLEET } from '../../data/fleet';
import { overlay, modal } from '../../lib/motion';

type Hit =
  | { kind: 'screen'; key: string; title: string; sub: string; route: string }
  | { kind: 'satellite'; key: string; title: string; sub: string; route: string };

/** Global find: real screens this role may open, real satellites, one keystroke away. */
export const CommandPalette: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const isOpen = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const role = useAuthStore((s) => s.activeRole);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (isOpen) { setQuery(''); setActive(0); } }, [isOpen]);

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    const screenHits: Hit[] = SCREENS
      .filter((s) => s.flow !== 'public' && canOpen(s, role))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.route.includes(q))
      .map((s) => ({ kind: 'screen', key: s.route, title: s.name, sub: `${s.id} · go to screen`, route: s.route }));

    const satHits: Hit[] = q.length >= 2
      ? FLEET
          .filter((s) => s.sat_id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
          .slice(0, 8)
          .map((s) => ({ kind: 'satellite', key: s.sat_id, title: s.sat_id, sub: `${s.name} · ${s.health_state.toLowerCase()}`, route: `satellite?sat=${s.sat_id}` }))
      : [];

    return [...screenHits.slice(0, 8), ...satHits];
  }, [query, role]);

  const go = (hit: Hit) => { onNavigate(hit.route); setOpen(false); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); go(hits[active]); }
  };

  if (!isOpen) return null;

  return (
    <>
      <motion.div variants={overlay} initial="hidden" animate="show" exit="exit"
        onClick={() => setOpen(false)} className="fixed inset-0 z-50 bg-[#1B1F26]/60 backdrop-blur-[2px]" />

      <motion.div variants={modal} initial="hidden" animate="show" exit="exit"
        className="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4 pointer-events-none">
        <div role="dialog" aria-modal="true" aria-label="Command palette"
          className="pointer-events-auto w-full max-w-[560px] bg-[#181B21] border border-[#2E3440] rounded-xl overflow-hidden flex flex-col"
          style={{ boxShadow: 'var(--lift-3)' }}>

          <div className="flex items-center gap-3 px-4 h-14 border-b border-[#1A1D24] shrink-0">
            <Search size={17} className="text-[#3CB992]" />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onKeyDown}
              placeholder="Jump to a screen or a satellite…"
              aria-label="Search screens and satellites"
              className="flex-1 bg-transparent text-[14px] text-[#F3F4F6] outline-none placeholder:text-[#8B92A0]"
            />
            <kbd onClick={() => setOpen(false)}
              className="px-1.5 py-0.5 rounded border border-[#2E3440] text-[10px] mono text-[#8B92A0] cursor-pointer">
              ESC
            </kbd>
          </div>

          <div className="max-h-[360px] overflow-y-auto p-1.5">
            {hits.length === 0 ? (
              <div className="p-6 text-center text-[12.5px] text-[#8B92A0]">Nothing matches "{query}".</div>
            ) : (
              hits.map((hit, i) => (
                <button
                  key={`${hit.kind}-${hit.key}`}
                  onClick={() => go(hit)}
                  onMouseEnter={() => setActive(i)}
                  className={clsx('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                    i === active ? 'bg-[#1B1F26]' : 'hover:bg-[#181B21]')}
                >
                  {hit.kind === 'satellite'
                    ? <SatelliteIcon size={15} className="text-[#3CB992] shrink-0" />
                    : <span className="mono text-[10px] font-bold text-[#3CB992] w-9 shrink-0">{SCREENS.find((s) => s.route === hit.route)?.id}</span>}
                  <span className="flex flex-col min-w-0 flex-1">
                    <span className="text-[13px] text-[#F3F4F6] truncate">{hit.title}</span>
                    <span className="text-[11px] text-[#8B92A0] truncate">{hit.sub}</span>
                  </span>
                  {i === active && <CornerDownLeft size={13} className="text-[#8B92A0] shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
};
