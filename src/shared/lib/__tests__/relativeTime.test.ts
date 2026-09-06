import { relativeTime } from '@/shared/lib/relativeTime';

describe('relativeTime', () => {
  const now = new Date(2026, 8, 7, 12, 0, 0);
  const ago = (sec: number) => new Date(now.getTime() - sec * 1000).toISOString();

  it('1분 미만은 방금', () => expect(relativeTime(ago(30), now)).toBe('방금'));
  it('분 단위', () => expect(relativeTime(ago(180), now)).toBe('3분'));
  it('시간 단위', () => expect(relativeTime(ago(7200), now)).toBe('2시간'));
  it('일 단위', () => expect(relativeTime(ago(5 * 86400), now)).toBe('5일'));
  it('7일 넘으면 날짜', () => expect(relativeTime(ago(30 * 86400), now)).toBe('8월 8일'));
  it('미래 시각도 방금으로 (시계 어긋남 방어)', () => expect(relativeTime(ago(-100), now)).toBe('방금'));
});
