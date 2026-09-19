import React from 'react';
import { useAlarmStore } from '../../store/useAlarmStore';
import { StatusBadge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { formatUTC } from '../../utils/formatUTC';
import { AlertTriangle, CheckCircle } from 'lucide-react';

interface AlarmPanelProps {
  onNavigateParam?: (satId: string, paramId: string) => void;
}

export const AlarmPanel: React.FC<AlarmPanelProps> = ({ onNavigateParam }) => {
  const activeAlarms = useAlarmStore((s) => s.active);
  const acknowledgeAlarm = useAlarmStore((s) => s.acknowledgeAlarm);

  return (
    /* Chrome-free: the caller supplies the card frame. */
    <div className="flex flex-col h-full overflow-hidden">
      {/* Alarm List */}
      <div className="flex-1 overflow-y-auto space-y-2 max-h-[560px]">
        {activeAlarms.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-[#A1A7B3] text-xs gap-2">
            <CheckCircle size={24} className="text-[#4CAF81]" />
            <span>No Active Alarms</span>
          </div>
        ) : (
          activeAlarms.map((alarm) => (
            <div
              key={alarm.alarm_id}
              className={`flex flex-col gap-2 p-2.5 rounded border text-xs font-mono-code transition-colors ${
                alarm.alarm_state === 2
                  ? 'bg-[#C62828]/10 border-[#C62828]/40 hover:border-[#C62828]'
                  : 'bg-[#E8943A]/10 border-[#E8943A]/40 hover:border-[#E8943A]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#F3F4F6]">{alarm.sat_id}</span>
                <StatusBadge status={alarm.alarm_state === 2 ? 'CRITICAL' : 'WARNING'} size="sm" />
              </div>

              <div
                onClick={() => onNavigateParam && onNavigateParam(alarm.sat_id, alarm.param_id)}
                className="cursor-pointer hover:underline text-[#0F6E56] font-semibold"
              >
                {alarm.param_id}
              </div>

              <div className="flex justify-between items-baseline text-[11px]">
                <span className="text-[#A1A7B3]">Breach:</span>
                <span className="font-bold text-[#F3F4F6]">
                  {alarm.eu_value} {alarm.unit}
                </span>
              </div>

              <div className="flex justify-between items-center pt-1.5 border-t border-[#2B303B]/50 text-[10px] text-[#A1A7B3]">
                <span>{formatUTC(alarm.timestamp_utc, 'HH:mm:ss')}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => acknowledgeAlarm(alarm.alarm_id)}
                  className="py-0.5 text-[10px] h-6"
                >
                  ACK
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
