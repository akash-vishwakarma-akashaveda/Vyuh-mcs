export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
  factor: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 500, maxMs: 30_000, factor: 2 };

/**
 * Reconnect delay for the nth consecutive failed attempt: exponential growth
 * capped at maxMs, with "equal jitter" — half the ceiling is fixed, the other half
 * random — so a gateway restart that drops every console at once does not bring
 * them all back in the same instant, yet no client ever retries in a tight loop.
 */
export function backoffDelay(attempt: number, rand: () => number = Math.random, o: BackoffOptions = DEFAULT_BACKOFF): number {
  const ceiling = Math.min(o.maxMs, o.baseMs * o.factor ** Math.max(0, attempt));
  return Math.round(ceiling / 2 + (rand() * ceiling) / 2);
}
