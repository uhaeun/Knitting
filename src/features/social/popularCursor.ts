/**
 * 인기순은 좋아요 수 → 최신순으로 정렬한다. 두 값이 같은 글이 여럿이라
 * "몇 번째부터"가 아니라 "이 값보다 뒤"로 이어 받는다 (중간에 좋아요가 눌려도 건너뛰거나 겹치지 않는다).
 */
export type PopularCursor = { likeCount: number; createdAt: string };

export function encodePopularCursor(c: PopularCursor): string {
  return `${c.likeCount}|${c.createdAt}`;
}

export function decodePopularCursor(raw: string | null): PopularCursor | null {
  if (!raw) return null;
  const at = raw.indexOf('|');
  if (at <= 0) return null;
  const likeCount = Number(raw.slice(0, at));
  const createdAt = raw.slice(at + 1);
  if (!Number.isFinite(likeCount) || !createdAt) return null;
  return { likeCount, createdAt };
}

/** Supabase .or()에 넣는 조건: 좋아요가 더 적거나, 같으면 더 오래된 것 */
export function popularAfter(c: PopularCursor): string {
  return `like_count.lt.${c.likeCount},and(like_count.eq.${c.likeCount},created_at.lt.${c.createdAt})`;
}
