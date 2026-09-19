/**
 * Realtime Gateway wire protocol (Architecture v2.2 §21.3), validated with Zod so a
 * malformed frame fails loudly at the edge instead of corrupting a store.
 *
 *   client -> server  SUBSCRIBE · UNSUBSCRIBE · RESUME · PING
 *   server -> client  HELLO · SNAPSHOT · DELTA · ALARM · STATUS · HEARTBEAT
 *                     SUBSCRIBED · RESUMED · RESUME_FAILED · ERROR · PONG
 */
import { z } from 'zod';

const level = z.union([z.literal(0), z.literal(1), z.literal(2)]);

export const LiveValueSchema = z.object({
  param_id: z.string(),
  eu_value: z.number(),
  unit: z.string().default(''),
  alarm_state: level, // 0 nominal · 1 warning · 2 critical
  quality: z.union([z.literal(0), z.literal(1)]), // 0 good · 1 stale / uncertain
  timestamp_utc: z.string(),
});
export type LiveValue = z.infer<typeof LiveValueSchema>;

export const AlarmViewSchema = z.object({
  alarm_id: z.string(),
  sat_id: z.string(),
  param_id: z.string(),
  alarm_state: level,
  level: z.string(), // LOW | LOW_LOW | HIGH | HIGH_HIGH
  eu_value: z.number(),
  unit: z.string().default(''),
  timestamp_utc: z.string(),
  status: z.enum(['ACTIVE', 'ACKNOWLEDGED', 'CLEARED']),
  acknowledged: z.boolean(),
  acknowledged_by: z.string().default(''),
  acknowledged_utc: z.string().default(''),
  cleared_utc: z.string().default(''),
});
export type AlarmView = z.infer<typeof AlarmViewSchema>;

export const CommandStatusSchema = z.object({
  kind: z.literal('COMMAND'),
  command_id: z.string(),
  sat_id: z.string(),
  apid: z.number(),
  status: z.string(), // PENDING QUEUED SENT ACKNOWLEDGED FAILED REJECTED_* CANCELLED
  operator_id: z.string().default(''),
  params: z.record(z.unknown()).nullish(),
  reason: z.string().default(''),
  submitted_utc: z.string().default(''),
  updated_utc: z.string().default(''),
});
export type CommandStatus = z.infer<typeof CommandStatusSchema>;

export const ServerFrameSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('HELLO'),
    instance_id: z.string(),
    event_seq: z.number(),
    heartbeat_ms: z.number(),
    resume_window_s: z.number(),
  }),
  z.object({
    type: z.literal('SNAPSHOT'),
    sub_id: z.string(),
    satellite: z.string(),
    values: z.array(LiveValueSchema),
  }),
  z.object({
    type: z.literal('DELTA'),
    sub_id: z.string(),
    satellite: z.string(),
    seq: z.number(),
    ert_ns: z.number().default(0), // Link Gateway receive time: the start of the latency clock
    gw_ns: z.number().default(0), // gateway send time
    values: z.array(LiveValueSchema),
  }),
  z.object({ type: z.literal('ALARM'), event_seq: z.number(), satellite: z.string(), alarm: AlarmViewSchema }),
  z.object({ type: z.literal('STATUS'), event_seq: z.number(), satellite: z.string(), status: CommandStatusSchema }),
  z.object({ type: z.literal('HEARTBEAT'), event_seq: z.number() }),
  z.object({ type: z.literal('SUBSCRIBED'), sub_id: z.string(), event_seq: z.number().default(0) }),
  z.object({ type: z.literal('RESUMED'), replayed: z.number(), to_seq: z.number() }),
  z.object({ type: z.literal('RESUME_FAILED'), reason: z.string(), event_seq: z.number().default(0) }),
  z.object({ type: z.literal('ERROR'), code: z.string(), sub_id: z.string().optional() }),
  z.object({ type: z.literal('PONG') }),
]);
export type ServerFrame = z.infer<typeof ServerFrameSchema>;

/** Parses one text frame; null (never a throw) when it is not a valid server frame. */
export function parseFrame(text: string): ServerFrame | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const r = ServerFrameSchema.safeParse(json);
  return r.success ? r.data : null;
}

export type Subscription =
  | { id: string; kind: 'PARAMS'; satellite: string; params?: string[] }
  | { id: string; kind: 'ALARMS' | 'STATUS'; scope: string[] };
