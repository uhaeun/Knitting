import { buildSegments, estimateDurationMs, LAST_HOLD_MS, photoHoldMs, segmentAt, totalDurationMs } from '@/features/media/plan';
import type { MediaItem } from '@/features/media/mediaItem';

const photo = (uri: string): MediaItem => ({ kind: 'photo', uri });
const video = (uri: string, durationMs: number): MediaItem => ({ kind: 'video', uri, durationMs });

describe('photoHoldMs', () => {
  it('기록이 적으면 오래, 많으면 짧게 (현행과 같은 시간)', () => {
    expect(photoHoldMs(2)).toBe(500);
    expect(photoHoldMs(8)).toBe(500);
    expect(photoHoldMs(9)).toBe(250);
    expect(photoHoldMs(24)).toBe(250);
    expect(photoHoldMs(25)).toBe(125);
  });
});

describe('buildSegments', () => {
  it('사진은 머무는 시간, 영상은 클립 길이, 마지막 기록 +1초', () => {
    const s = buildSegments([photo('a'), video('b', 3200), photo('c')]);
    expect(s.map((x) => [x.startMs, x.durationMs])).toEqual([[0, 500], [500, 3200], [3700, 500 + LAST_HOLD_MS]]);
    expect(totalDurationMs(s)).toBe(5200);
  });
  it('마지막이 영상이면 클립 길이 + 1초', () => {
    const s = buildSegments([photo('a'), video('b', 2000)]);
    expect(s[1]?.durationMs).toBe(3000);
  });
  it('기록이 없으면 빈 목록, 길이 0', () => {
    expect(buildSegments([])).toEqual([]);
    expect(totalDurationMs([])).toBe(0);
  });
});

describe('segmentAt', () => {
  const s = buildSegments([photo('a'), video('b', 3200), photo('c')]);
  it('구간 시작 시각은 그 구간', () => {
    expect(segmentAt(s, 0).item.uri).toBe('a');
    expect(segmentAt(s, 499).item.uri).toBe('a');
    expect(segmentAt(s, 500).item.uri).toBe('b');
    expect(segmentAt(s, 3700).item.uri).toBe('c');
  });
  it('끝을 넘으면 마지막 구간', () => {
    expect(segmentAt(s, 99999).item.uri).toBe('c');
  });
});

describe('estimateDurationMs', () => {
  it('구간 합과 같다', () => {
    expect(estimateDurationMs([photo('a'), photo('b'), photo('c')])).toBe(2500);
    expect(estimateDurationMs([])).toBe(0);
  });
});
