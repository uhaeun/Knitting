import {
  CLIP_MAX_MS,
  formatClipTime,
  isLongEnough,
  isTrimmed,
  pickRecorderMime,
  RECORDER_MIME_CANDIDATES,
  shouldAutoStop,
  squareCrop,
  trimEndSec,
} from '@/features/capture/clip';

describe('pickRecorderMime', () => {
  it('코덱을 명시한 H.264 MP4를 가장 먼저 고른다', () => {
    expect(pickRecorderMime(() => true)).toBe('video/mp4;codecs=avc1.640028');
  });
  it('H.264가 안 되면 WebM(VP8)으로 내려간다', () => {
    expect(pickRecorderMime((m) => m.startsWith('video/webm'))).toBe('video/webm;codecs=vp8');
  });
  it('코덱 없는 video/mp4만 되는 경우는 고르지 않는다 (브라우저마다 안에 넣는 코덱이 다름)', () => {
    expect(RECORDER_MIME_CANDIDATES).not.toContain('video/mp4');
    expect(pickRecorderMime((m) => m === 'video/mp4')).toBeNull();
  });
});

describe('squareCrop', () => {
  it('세로 화면은 위아래를 잘라 가운데 정사각', () => {
    expect(squareCrop(1080, 1920)).toEqual({ left: 0, top: 420, width: 1080, height: 1080 });
  });
  it('가로 화면은 좌우를 잘라 가운데 정사각', () => {
    expect(squareCrop(1920, 1080)).toEqual({ left: 420, top: 0, width: 1080, height: 1080 });
  });
  it('홀수 차이는 내림', () => {
    expect(squareCrop(1081, 1080)).toEqual({ left: 0, top: 0, width: 1080, height: 1080 });
  });
});

describe('trim', () => {
  it('5초보다 길면 5초에서 자르고 잘렸다고 알린다', () => {
    expect(trimEndSec(9.47)).toBe(5);
    expect(isTrimmed(9.47)).toBe(true);
  });
  it('5초 이하는 그대로', () => {
    expect(trimEndSec(4.98)).toBe(4.98);
    expect(isTrimmed(4.98)).toBe(false);
  });
  it('자동 정지로 5초를 조금 넘긴 녹화는 잘렸다고 알리지 않는다 (0.5초 여유)', () => {
    expect(trimEndSec(5.3)).toBe(5);
    expect(isTrimmed(5.3)).toBe(false);
    expect(isTrimmed(5.51)).toBe(true);
  });
});

describe('녹화 시간', () => {
  it('5초에 자동 정지', () => {
    expect(shouldAutoStop(CLIP_MAX_MS - 1)).toBe(false);
    expect(shouldAutoStop(CLIP_MAX_MS)).toBe(true);
  });
  it('1초 미만은 저장하지 않는다', () => {
    expect(isLongEnough(999)).toBe(false);
    expect(isLongEnough(1000)).toBe(true);
  });
  it('표시는 m:ss', () => {
    expect(formatClipTime(0)).toBe('0:00');
    expect(formatClipTime(3400)).toBe('0:03');
    expect(formatClipTime(5000)).toBe('0:05');
  });
});
