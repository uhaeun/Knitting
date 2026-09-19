import { describeRule, formatReminder, nextOccurrences, REMINDER_BODY } from '@/features/reminder/reminder';

// 2026-09-19(토) 20:00 기준
const NOW = new Date(2026, 8, 19, 20, 0);
const T9 = { hour: 21, minute: 0 };
const ymd = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('formatReminder / describeRule', () => {
  it('시각', () => {
    expect(formatReminder({ hour: 21, minute: 0 })).toBe('오후 9:00');
    expect(formatReminder({ hour: 0, minute: 5 })).toBe('오전 12:05');
  });
  it('규칙 설명', () => {
    expect(describeRule({ kind: 'daily' }, T9)).toBe('매일 오후 9:00');
    expect(describeRule({ kind: 'weekly', days: [5, 1, 3] }, T9)).toBe('매주 월·수·금 오후 9:00');
    expect(describeRule({ kind: 'interval', everyDays: 3, anchor: '2026-09-19' }, T9)).toBe('3일마다 오후 9:00');
    expect(describeRule({ kind: 'weekly', days: [] }, T9)).toBe('요일을 골라 주세요');
  });
});

describe('nextOccurrences', () => {
  it('매일: 오늘 시각이 아직 안 지났으면 오늘부터', () => {
    expect(nextOccurrences({ kind: 'daily' }, T9, NOW, 3).map(ymd)).toEqual(['9/19 21:00', '9/20 21:00', '9/21 21:00']);
  });
  it('매일: 이미 지났으면 내일부터', () => {
    expect(nextOccurrences({ kind: 'daily' }, { hour: 8, minute: 0 }, NOW, 2).map(ymd)).toEqual(['9/20 8:00', '9/21 8:00']);
  });
  it('매주 월·목 (9/19는 토요일)', () => {
    expect(nextOccurrences({ kind: 'weekly', days: [1, 4] }, T9, NOW, 4).map(ymd))
      .toEqual(['9/21 21:00', '9/24 21:00', '9/28 21:00', '10/1 21:00']);
  });
  it('3일마다: 기준일부터 3일 간격', () => {
    expect(nextOccurrences({ kind: 'interval', everyDays: 3, anchor: '2026-09-19' }, T9, NOW, 3).map(ymd))
      .toEqual(['9/19 21:00', '9/22 21:00', '9/25 21:00']);
  });
  it('기준일이 과거여도 간격이 맞는다', () => {
    // 9/10 기준 3일마다 → 9/10, 13, 16, 19, 22…
    expect(nextOccurrences({ kind: 'interval', everyDays: 3, anchor: '2026-09-10' }, T9, NOW, 2).map(ymd))
      .toEqual(['9/19 21:00', '9/22 21:00']);
  });
  it('요일을 하나도 안 고르면 예약하지 않는다', () => {
    expect(nextOccurrences({ kind: 'weekly', days: [] }, T9, NOW)).toEqual([]);
  });
  it('예약 개수 제한을 넘지 않는다', () => {
    expect(nextOccurrences({ kind: 'daily' }, T9, NOW)).toHaveLength(48);
  });
});

describe('문구', () => {
  it('재촉하지 않는다', () => {
    expect(REMINDER_BODY.includes('매일')).toBe(false);
  });
});
