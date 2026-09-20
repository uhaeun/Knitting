import { decodePopularCursor, encodePopularCursor, popularAfter } from '@/features/social/popularCursor';

describe('인기순 이어 받기', () => {
  it('좋아요 수와 시각을 함께 싣는다', () => {
    const c = { likeCount: 3, createdAt: '2026-09-20T01:02:03.000Z' };
    expect(encodePopularCursor(c)).toBe('3|2026-09-20T01:02:03.000Z');
    expect(decodePopularCursor(encodePopularCursor(c))).toEqual(c);
  });
  it('망가진 값은 처음부터', () => {
    expect(decodePopularCursor(null)).toBeNull();
    expect(decodePopularCursor('')).toBeNull();
    expect(decodePopularCursor('abc')).toBeNull();
    expect(decodePopularCursor('|2026-09-20')).toBeNull();
  });
  it('좋아요가 같으면 더 오래된 것만 가져온다', () => {
    expect(popularAfter({ likeCount: 0, createdAt: '2026-09-20T00:00:00.000Z' }))
      .toBe('like_count.lt.0,and(like_count.eq.0,created_at.lt.2026-09-20T00:00:00.000Z)');
  });
});
