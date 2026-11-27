import { toDateOnly } from '@/shared/lib/dates';
import type { MediaType } from '@/shared/types/models';

export type CalendarRecord = {
  id: string;
  projectId: string;
  projectName: string;
  takenAt: string;
  caption: string | null;
  thumb: string | null;
  mediaType: MediaType;
};

export const weekdays = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** YYYY-MM-DD is a local calendar day, whereas the database compares UTC instants. */
export function monthStart(day: string, offset = 0): Date {
  const [year, month] = day.split('-').map(Number);
  return new Date(year, month - 1 + offset, 1);
}

export function calendarWeeks(first: Date): (string | null)[][] {
  const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const start = first.getDay();
  return Array.from({ length: Math.ceil((start + length) / 7) }, (_, week) =>
    weekdays.map((_, column) => {
      const day = week * 7 + column + 1 - start;
      return day < 1 || day > length ? null : toDateOnly(new Date(first.getFullYear(), first.getMonth(), day));
    }));
}

export function recordsByDay(records: readonly CalendarRecord[]) {
  const days = new Map<string, CalendarRecord[]>();
  for (const record of records) {
    const key = toDateOnly(new Date(record.takenAt));
    const group = days.get(key);
    if (group) group.push(record);
    else days.set(key, [record]);
  }
  return days;
}

/** Records arrive newest first. Video-only days use their saved poster. */
export function dayCover(records: readonly CalendarRecord[]) {
  return records.find(r => r.mediaType === 'photo' && r.thumb)?.thumb ?? records.find(r => r.thumb)?.thumb;
}
