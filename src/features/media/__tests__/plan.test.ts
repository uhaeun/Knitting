import { buildSegments, clipCapMs, estimateDurationMs, LAST_HOLD_MS, MAX_GROWTH_MS, MIN_CLIP_MS, photoHoldMs, segmentAlpha, segmentAt, totalDurationMs } from '@/features/media/plan';
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

describe('clipCapMs', () => {
  it('예산 안이면 자르지 않는다', () => {
    expect(clipCapMs([3000, 5000], 8000)).toBe(Infinity);
  });
  it('넘으면 모든 클립에 같은 상한 (짧은 클립은 그대로)', () => {
    // 1000은 그대로, 남은 5000을 두 클립이 2500씩
    expect(clipCapMs([5000, 1000, 5000], 6000)).toBe(2500);
  });
  it('상한은 MIN_CLIP_MS 아래로 내려가지 않는다', () => {
    expect(clipCapMs([5000, 5000], 100)).toBe(MIN_CLIP_MS);
  });
});

describe('buildSegments holdMs 지정', () => {
  it('holdMs를 주면 사진 수와 무관하게 그 값을 쓴다', () => {
    const s = buildSegments([photo('a'), photo('b'), photo('c')], { holdMs: 2000 });
    expect(s.map((x) => x.durationMs)).toEqual([2000, 2000, 2000 + LAST_HOLD_MS]);
  });
  it('holdMs를 안 주면 기존처럼 기록 수에 맞춰 자동', () => {
    const s = buildSegments([photo('a'), photo('b')], {});
    expect(s[0]?.durationMs).toBe(500);
  });
});

describe('segmentAlpha (전환 효과)', () => {
  it('cut이면 항상 1 (안 어두워짐)', () => {
    expect(segmentAlpha(0, 1000, false, false, 'cut')).toBe(1);
    expect(segmentAlpha(999, 1000, false, false, 'cut')).toBe(1);
  });
  it('fade: 맨 첫 구간은 시작할 때 페이드인 하지 않는다', () => {
    expect(segmentAlpha(0, 1000, true, false, 'fade', 250)).toBe(1);
  });
  it('fade: 첫 구간이 아니면 0에서 서서히 밝아진다', () => {
    expect(segmentAlpha(0, 1000, false, false, 'fade', 250)).toBe(0);
    expect(segmentAlpha(125, 1000, false, false, 'fade', 250)).toBe(0.5);
    expect(segmentAlpha(250, 1000, false, false, 'fade', 250)).toBe(1);
  });
  it('fade: 마지막 구간이 아니면 끝에서 서서히 어두워진다', () => {
    expect(segmentAlpha(1000, 1000, false, false, 'fade', 250)).toBe(0);
    expect(segmentAlpha(875, 1000, false, false, 'fade', 250)).toBe(0.5);
  });
  it('fade: 맨 마지막 구간은 끝에서 어두워지지 않는다', () => {
    expect(segmentAlpha(1000, 1000, false, true, 'fade', 250)).toBe(1);
  });
  it('구간이 짧으면(사진이 아주 많을 때) fade 폭을 구간 길이의 절반으로 줄인다', () => {
    expect(segmentAlpha(50, 200, false, false, 'fade', 250)).toBe(0.5);
  });
});

describe('buildSegments 전체 길이 상한', () => {
  const clips = (n: number) => Array.from({ length: n }, (_, i) => video(`v${i}`, 5000));
  it(`영상이 많아도 전체 ${MAX_GROWTH_MS / 1000}초 이하`, () => {
    const s = buildSegments(clips(50));
    expect(totalDurationMs(s)).toBeLessThanOrEqual(MAX_GROWTH_MS);
    expect(totalDurationMs(s)).toBeGreaterThan(MAX_GROWTH_MS - 50);
  });
  it('잘린 클립은 playMs만큼 재생, 마지막 클립은 거기서 1초 정지', () => {
    const s = buildSegments(clips(20));
    const last = s[s.length - 1]!;
    expect(s[0]!.playMs).toBeLessThan(5000);
    expect(s[0]!.durationMs).toBe(s[0]!.playMs);
    expect(last.durationMs).toBe(last.playMs + LAST_HOLD_MS);
  });
  it('상한 안이면 클립 전체 재생, 사진 playMs는 0', () => {
    const s = buildSegments([photo('a'), video('b', 3200)]);
    expect(s.map((x) => x.playMs)).toEqual([0, 3200]);
  });
});
