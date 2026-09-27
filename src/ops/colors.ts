import { STATIONS } from '../data/fleet';

/** One colour per ground station, used on the globe, the contact timeline and the schedule. */
export const STATION_COLOR = ['#22D3EE', '#F472B6', '#A3E635', '#FB923C', '#C084FC', '#94A3B8'];
export const stationColor = (id: string) => STATION_COLOR[Math.max(0, STATIONS.findIndex((s) => s.id === id)) % STATION_COLOR.length];
