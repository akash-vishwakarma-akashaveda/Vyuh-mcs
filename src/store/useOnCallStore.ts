import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NotificationDelivery, OnCallEntry, RoutingRule } from '../types';
import { ROUTING_RULES } from '../data/fleet';
import { ONCALL, PAGES } from '../demo/scenario';
import { demoKey, demoStorage } from '../demo/persist';
import { useAuthStore } from './useAuthStore';
import { recordAudit } from './govern';

/**
 * Notifications and on-call (S28).
 * ponytail: browser-side store seeded from the demo scenario; the Notification Service API replaces it.
 */

export type Page = NotificationDelivery & { ackBy?: string; ackAt?: string; test?: boolean };
export type Rule = RoutingRule & { id: string };
export interface Step { atMin: number; text: string }

interface OnCallStore {
  rota: OnCallEntry[];
  rules: Rule[];
  steps: Step[];
  pages: Page[];
  acknowledge: (id: string) => string | null;
  takeOver: (position: OnCallEntry['position']) => string | null;
  testPage: (position: OnCallEntry['position'], channel: string) => string | null;
  updateRule: (id: string, patch: Partial<RoutingRule>) => string | null;
}

const me = () => useAuthStore.getState();

export const useOnCallStore = create<OnCallStore>()(persist((set, get) => ({
  rota: ONCALL,
  rules: ROUTING_RULES.map((r, i) => ({ ...r, id: `RR-${i + 1}` })),
  steps: [
    { atMin: 0, text: 'Notify primary on-call (push and SMS)' },
    { atMin: 5, text: 'Page secondary on-call' },
    { atMin: 15, text: 'Escalate to the Flight Director' },
  ],
  pages: PAGES,

  acknowledge: (id) => {
    const p = get().pages.find((x) => x.id === id);
    if (!p || p.state === 'ACKNOWLEDGED') return 'Already acknowledged.';
    const by = me().user.name, at = new Date().toISOString();
    set((s) => ({ pages: s.pages.map((x) => (x.id === id ? { ...x, state: 'ACKNOWLEDGED', ackBy: by, ackAt: at } : x)) }));
    recordAudit('PAGE_ACK', `Page ${id} (${p.trigger}) acknowledged`, { target: p.recipient });
    return null;
  },

  takeOver: (position) => {
    const { user, activeRole } = me();
    if (position === 'Flight Director' && activeRole !== 'Flight Director') return 'Only a Flight Director can take the Flight Director slot.';
    const cur = get().rota.find((r) => r.position === position);
    if (cur?.name === user.name) return 'You already hold this slot.';
    const until = new Date(Date.now() + 8 * 3_600_000).toISOString();
    set((s) => ({ rota: s.rota.map((r) => (r.position === position ? { ...r, name: user.name, until_utc: until } : r)) }));
    recordAudit('ONCALL_TAKEOVER', `${user.name} took over ${position} on-call from ${cur?.name ?? 'nobody'} for 8 h`, { target: position });
    return null;
  },

  testPage: (position, channel) => {
    const r = get().rota.find((x) => x.position === position);
    if (!r) return 'Nobody holds that slot.';
    const id = `ND-${5522 + get().pages.length}`;
    set((s) => ({ pages: [{ id, trigger: `Test page from ${me().user.name}`, channel, recipient: r.name, sent_utc: new Date().toISOString(), state: 'DELIVERED', test: true }, ...s.pages] }));
    recordAudit('PAGE_TEST', `Test page ${id} sent to ${r.name} (${position}) by ${channel}`, { target: r.name });
    return null;
  },

  updateRule: (id, patch) => {
    const r = get().rules.find((x) => x.id === id);
    if (!r) return 'Unknown rule.';
    if (!patch.target?.trim()) return 'A rule needs a target.';
    if (patch.after_min !== undefined && (patch.after_min < 1 || patch.after_min > 240)) return 'Escalation must be between 1 and 240 minutes.';
    set((s) => ({ rules: s.rules.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
    recordAudit('ROUTING_RULE_CHANGE', `Rule "${r.trigger}": ${r.target} → ${patch.target}${patch.after_min ? `, escalate after ${patch.after_min} min to ${patch.escalate_to}` : ', no escalation'}`, { target: r.trigger });
    return null;
  },
}), { name: demoKey('oncall'), storage: demoStorage, partialize: (s) => ({ rota: s.rota, rules: s.rules, pages: s.pages }) as unknown as OnCallStore }));
