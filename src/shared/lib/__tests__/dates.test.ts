import { daysSince, formatMonthDay, toDateOnly } from '@/shared/lib/dates';

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
