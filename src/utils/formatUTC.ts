import { formatInTimeZone } from 'date-fns-tz';

export function formatUTC(date: Date | string | number, formatStr: string = 'yyyy-MM-dd HH:mm:ss') {
  try {
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    return formatInTimeZone(d, 'UTC', formatStr) + ' UTC';
  } catch (e) {
    return 'INVALID_DATE';
  }
}

export function formatISO(date: Date = new Date()) {
  return date.toISOString();
}
