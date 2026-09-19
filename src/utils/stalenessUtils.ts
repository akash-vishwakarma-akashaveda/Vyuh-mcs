import { Param } from '../types';

const STALE_THRESHOLD_MS = 10_000; // 10 seconds per SRS 7.2

export function isStale(param: Param): boolean {
  if (!param) return true;
  if (param.quality === 1) return true;
  const paramTime = new Date(param.timestamp_utc).getTime();
  return Date.now() - paramTime > STALE_THRESHOLD_MS;
}
