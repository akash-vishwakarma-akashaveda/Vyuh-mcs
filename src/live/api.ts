/** The console's calls to the backend, all through the Operator BFF (one origin, one contract). */
import { apiClient } from '../api/client';
import satellites from '../../config/satellites.json';
import { z } from 'zod';
import { AlarmViewSchema } from '../realtime/protocol';

/** The satellites the backend really flies, and their spacecraft ids (config/satellites.json). */
export const LIVE_SATELLITES: string[] = satellites.map((s) => s.sat_id);
export const scidOf = (satId: string): number | undefined => satellites.find((s) => s.sat_id === satId)?.scid;

const operatorHeader = (operator: string) => ({ headers: { 'X-Operator-ID': operator } });

const SubmitResponse = z.object({ commandId: z.string() });

export const liveApi = {
  injectFault: (satId: string, fault: string) => apiClient.post('/simulator/faults', { sat_id: satId, fault }),
  clearFault: (satId: string) => apiClient.delete(`/simulator/faults/${satId}`),

  async submitCommand(req: { scid: number; apid: number; priority: 'CRITICAL' | 'NORMAL'; params: Record<string, unknown> }, operator: string) {
    const r = await apiClient.post('/commands', req, operatorHeader(operator));
    return SubmitResponse.parse(r.data).commandId;
  },

  acknowledgeAlarm: (alarmId: string, operator: string) =>
    apiClient.post(`/alarms/${alarmId}/acknowledge`, null, operatorHeader(operator)),

  async listAlarms(openOnly = true) {
    const r = await apiClient.get('/alarms', { params: { open: openOnly } });
    return z.object({ alarms: z.array(AlarmViewSchema) }).parse(r.data).alarms;
  },

  /** Is a backend answering at all? (Used to decide between live and built-in simulation.) */
  async ping(): Promise<boolean> {
    try {
      await apiClient.get('/satellites', { timeout: 2500 });
      return true;
    } catch {
      return false;
    }
  },
};
