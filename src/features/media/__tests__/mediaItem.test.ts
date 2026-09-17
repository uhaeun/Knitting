import { mediaOf } from '@/features/media/mediaItem';

describe('mediaOf', () => {
  it('사진 기록은 사진 URL', () => {
    expect(mediaOf({ media_type: 'photo', photo_path: 'p.jpg', video_path: null, duration_ms: null })).toEqual({ kind: 'photo', uri: 'p.jpg' });
  });
  it('영상 기록은 영상 URL과 길이', () => {
    expect(mediaOf({ media_type: 'video', photo_path: 'p.jpg', video_path: 'v.mp4', duration_ms: 3200 })).toEqual({ kind: 'video', uri: 'v.mp4', durationMs: 3200 });
  });
  it('영상인데 주소나 길이가 비면 대표 사진으로 대신한다 (서명 실패 등)', () => {
    expect(mediaOf({ media_type: 'video', photo_path: 'p.jpg', video_path: null, duration_ms: 3200 })).toEqual({ kind: 'photo', uri: 'p.jpg' });
    expect(mediaOf({ media_type: 'video', photo_path: 'p.jpg', video_path: '', duration_ms: 3200 })).toEqual({ kind: 'photo', uri: 'p.jpg' });
  });
});
