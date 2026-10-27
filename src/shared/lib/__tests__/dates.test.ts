import { formatDateTime, daysSince, formatMonthDay, toDateOnly, validateProjectDates } from '@/shared/lib/dates';

describe('daysSince', () => {
  it('시작 당일은 1일째', () => {
    expect(daysSince('2026-09-06', new Date(2026, 8, 6, 23, 59))).toBe(1);
  });
  it('시안 예시: 8월 8일 시작, 9월 3일 = 27일째', () => {
    expect(daysSince('2026-08-08', new Date(2026, 8, 3))).toBe(27);
  });
  it('미래 시작일도 1 아래로 안 내려감', () => {
    expect(daysSince('2026-12-01', new Date(2026, 8, 6))).toBe(1);
  });
});

describe('toDateOnly / formatMonthDay', () => {
  it('로컬 날짜를 YYYY-MM-DD로', () => {
    expect(toDateOnly(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('YYYY-MM-DD → M월 D일 (시간대 밀림 없음)', () => {
    expect(formatMonthDay('2026-08-08')).toBe('8월 8일');
  });
  it('ISO도 받는다', () => {
    expect(formatMonthDay(new Date(2026, 6, 14, 9).toISOString())).toBe('7월 14일');
  });
});

describe('formatDateTime', () => {
  it('오전·오후와 분까지', () => {
    expect(formatDateTime('2026-09-18T14:32:00')).toBe('9월 18일 오후 2:32');
    expect(formatDateTime('2026-09-18T09:05:00')).toBe('9월 18일 오전 9:05');
  });
  it('자정은 오전 12시, 정오는 오후 12시', () => {
    expect(formatDateTime('2026-09-18T00:00:00')).toBe('9월 18일 오전 12:00');
    expect(formatDateTime('2026-09-18T12:00:00')).toBe('9월 18일 오후 12:00');
  });
});

describe('project date acceptance', () => {
  it('allows today and same-day completion but rejects future or reversed dates', () => {
    expect(validateProjectDates('2026-10-27', '2026-10-27', '2026-10-27')).toBeNull();
    expect(validateProjectDates('2026-10-28', null, '2026-10-27')).not.toBeNull();
    expect(validateProjectDates('2026-10-27', '2026-10-26', '2026-10-27')).not.toBeNull();
  });
  it('does not accept normalized invalid calendar dates or empty input', () => {
    expect(validateProjectDates('2026-02-29', null, '2026-10-27')).not.toBeNull();
    expect(validateProjectDates('', null, '2026-10-27')).not.toBeNull();
    expect(validateProjectDates('2024-02-29', null, '2026-10-27')).toBeNull();
  });
});
