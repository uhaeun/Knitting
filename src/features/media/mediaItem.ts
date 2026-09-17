/** 결과물·성장 영상이 다루는 기록 한 개. 순수 — 브라우저 의존 없음 */
export type MediaItem = { kind: 'photo'; uri: string } | { kind: 'video'; uri: string; durationMs: number };

export type MediaPost = {
  media_type: 'photo' | 'video';
  photo_path: string; // 읽어 온 값은 서명 URL
  video_path: string | null;
  duration_ms: number | null;
};

/** 영상인데 주소나 길이가 없으면(서명 실패 등) 대표 사진으로 대신한다 */
export function mediaOf(post: MediaPost): MediaItem {
  if (post.media_type === 'video' && post.video_path && post.duration_ms) {
    return { kind: 'video', uri: post.video_path, durationMs: post.duration_ms };
  }
  return { kind: 'photo', uri: post.photo_path };
}
