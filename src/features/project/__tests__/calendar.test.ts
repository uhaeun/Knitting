import { calendarWeeks, dayCover, monthStart, recordsByDay, type CalendarRecord } from '../calendar';
import { toDateOnly } from '@/shared/lib/dates';

const record = (id: string, date: Date, mediaType: CalendarRecord['mediaType'] = 'photo'): CalendarRecord => ({
  id, projectId: id, projectName: id, takenAt: date.toISOString(), caption: null, mediaType, thumb: id + '.jpg',
});

test('월력은 일요일부터 시작하고 윤년과 여섯 줄인 달에 없는 날짜를 만들지 않는다', () => {
  const leap = calendarWeeks(monthStart('2024-02-29'));
  expect(leap[0]).toEqual([null, null, null, null, '2024-02-01', '2024-02-02', '2024-02-03']);
  expect(leap.flat().filter(Boolean)).toHaveLength(29);
  const six = calendarWeeks(monthStart('2025-03-31'));
  expect(six).toHaveLength(6);
  expect(six.at(-1)).toEqual(['2025-03-30', '2025-03-31', null, null, null, null, null]);
  expect(calendarWeeks(monthStart('2026-02-01'))).toHaveLength(4);
});

test('31일과 연말에서 월 이동은 자정에 다음 달 1일로 이어진다', () => {
  expect(toDateOnly(monthStart('2026-01-31', 1))).toBe('2026-02-01');
  expect(toDateOnly(monthStart('2026-12-31', 1))).toBe('2027-01-01');
  expect(toDateOnly(monthStart('2026-01-01', -1))).toBe('2025-12-01');
  expect(monthStart('2026-03-31').getHours()).toBe(0);
});

test('로컬 자정으로 날짜를 나누고 다른 편물과 동영상도 하루 기록에 보존한다', () => {
  const one = record('one', new Date(2026, 10, 27, 0, 0));
  const two = record('two', new Date(2026, 10, 26, 23, 59));
  const video = record('clip', new Date(2026, 10, 27, 20), 'video');
  const groups = recordsByDay([video, one, two]);
  expect(groups.get('2026-11-27')).toEqual([video, one]);
  expect(groups.get('2026-11-26')).toEqual([two]);
  expect(dayCover([video, one, two])).toBe(one.thumb);
  expect(dayCover([video, { ...one, thumb: null }])).toBe(video.thumb);
  expect(dayCover([])).toBeUndefined();
});
