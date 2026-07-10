import { useQuery } from '@tanstack/react-query';
import { smartDb } from '@/lib/localDb';

export interface TimetableSettings {
  schoolStartTime: string;
  schoolEndTime:   string;
  periodDuration:  number;
  breakDuration:   number;
  periodsPerDay:   number;
  lunchDuration:   number;
  lunchAfterPeriod: number;
}

export const DEFAULT_SETTINGS: TimetableSettings = {
  schoolStartTime:  '08:00',
  schoolEndTime:    '15:00',
  periodDuration:   60,
  breakDuration:    15,
  periodsPerDay:    6,
  lunchDuration:    45,
  lunchAfterPeriod: 4,
};

function fmt(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function computeTimeSlots(s: TimetableSettings): string[] {
  const [h, m] = s.schoolStartTime.split(':').map(Number);
  const startMins = h * 60 + m;
  const slots: string[] = [];
  for (let i = 0; i < s.periodsPerDay; i++) {
    const begin = startMins
      + i * (s.periodDuration + s.breakDuration)
      + (i >= s.lunchAfterPeriod ? s.lunchDuration : 0);
    const end = begin + s.periodDuration;
    slots.push(`${fmt(begin)} - ${fmt(end)}`);
  }
  return slots;
}

export function useTimetableSettings(uid?: string) {
  const { data: settings = DEFAULT_SETTINGS, isLoading: loading } = useQuery({
    queryKey: ['timetable-settings', uid],
    queryFn: () => smartDb.getAll('TimetableSettings', uid).then((rows: any[]) =>
      rows && rows.length > 0 ? { ...DEFAULT_SETTINGS, ...rows[0] } : DEFAULT_SETTINGS
    ),
  });

  return { settings, timeSlots: computeTimeSlots(settings), loading };
}
