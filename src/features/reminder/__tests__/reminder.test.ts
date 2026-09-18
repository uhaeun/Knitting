import { DEFAULT_REMINDER, formatReminder, REMINDER_BODY, REMINDER_TIMES } from '@/features/reminder/reminder';

describe('reminder', () => {
  it('시간 표기', () => {
    expect(formatReminder({ hour: 21, minute: 0 })).toBe('오후 9:00');
    expect(formatReminder({ hour: 8, minute: 0 })).toBe('오전 8:00');
    expect(formatReminder({ hour: 12, minute: 30 })).toBe('오후 12:30');
  });
  it('기본값은 고를 수 있는 시간 중 하나', () => {
    expect(REMINDER_TIMES.some((t) => t.hour === DEFAULT_REMINDER.hour && t.minute === DEFAULT_REMINDER.minute)).toBe(true);
  });
  it('문구가 재촉하지 않는다', () => {
    expect(REMINDER_BODY.includes('매일')).toBe(false);
    expect(REMINDER_BODY.includes('했다면')).toBe(true);
  });
});
