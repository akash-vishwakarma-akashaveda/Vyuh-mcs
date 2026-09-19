import { HealthState } from '../types';

export function getHealthBadgeColor(state: HealthState): string {
  switch (state) {
    case 'NOMINAL':
      return 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_30%,transparent)]';
    case 'WARNING':
      return 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)] pulse-warning';
    case 'CRITICAL':
      return 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger-text)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] pulse-critical';
    case 'NO_DATA':
    default:
      return 'bg-[color-mix(in_srgb,var(--color-border-hover)_20%,transparent)] text-[var(--color-text-secondary)] border-[color-mix(in_srgb,var(--color-border-hover)_40%,transparent)]';
  }
}

export function getAlarmStateBadge(state: 0 | 1 | 2): { label: string; color: string } {
  switch (state) {
    case 0:
      return { label: 'NOMINAL', color: 'text-[var(--success)]' };
    case 1:
      return { label: 'WARNING', color: 'text-[var(--warning)]' };
    case 2:
      return { label: 'CRITICAL', color: 'text-[var(--danger-text)]' };
  }
}
