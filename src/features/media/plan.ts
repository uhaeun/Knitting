/** 성장 영상 시간 구간. 순수 함수 — 브라우저 의존 없음 → 테스트 가능. */
import type { MediaItem } from '@/features/media/mediaItem';

export const VIDEO_SIDE = 1080;
export const GROWTH_FPS = 30;
export const MIN_RECORDS = 2;
export const LAST_HOLD_MS = 1000;

/** 사진 한 장이 머무는 시간. 기록이 적으면 오래, 많으면 짧게 (8fps 시절 4·2·1프레임과 같은 시간) */
export function photoHoldMs(recordCount: number): number {
  if (recordCount <= 8) return 500;
  if (recordCount <= 24) return 250;
  return 125;
}

export type Segment = { item: MediaItem; startMs: number; durationMs: number };

/** 사진은 머무는 시간, 영상은 클립 길이. 마지막 기록은 1초 더 (영상이면 마지막 장면 정지) */
export function buildSegments(items: readonly MediaItem[]): Segment[] {
  const hold = photoHoldMs(items.length);
  let startMs = 0;
  return items.map((item, i) => {
    const base = item.kind === 'video' ? item.durationMs : hold;
    const durationMs = i === items.length - 1 ? base + LAST_HOLD_MS : base;
    const seg = { item, startMs, durationMs };
    startMs += durationMs;
    return seg;
  });
}

export function totalDurationMs(segments: readonly Segment[]): number {
  const last = segments[segments.length - 1];
  return last ? last.startMs + last.durationMs : 0;
}

/** tMs가 속한 구간. 끝을 넘으면 마지막 구간. segments는 비어 있지 않아야 한다 */
export function segmentAt(segments: readonly Segment[], tMs: number): Segment {
  let found = segments[0] as Segment;
  for (const s of segments) {
    if (s.startMs <= tMs) found = s;
    else break;
  }
  return found;
}

export function estimateDurationMs(items: readonly MediaItem[]): number {
  return totalDurationMs(buildSegments(items));
}
