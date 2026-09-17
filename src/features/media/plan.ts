/** 성장 영상 시간 구간. 순수 함수 — 브라우저 의존 없음 → 테스트 가능. */
import type { MediaItem } from '@/features/media/mediaItem';

export const VIDEO_SIDE = 1080;
export const GROWTH_FPS = 30;
export const MIN_RECORDS = 2;
export const LAST_HOLD_MS = 1000;
/** 성장 영상 전체 상한. 영상 기록이 많으면 클립을 앞부분만 재생해 맞춘다 (iPhone Safari 메모리) */
export const MAX_GROWTH_MS = 60_000;
/** 잘려도 클립 하나는 이만큼은 재생한다. 사진이 아주 많으면 상한을 넘을 수 있다 */
export const MIN_CLIP_MS = 1000;

/** 사진 한 장이 머무는 시간. 기록이 적으면 오래, 많으면 짧게 (8fps 시절 4·2·1프레임과 같은 시간) */
export function photoHoldMs(recordCount: number): number {
  if (recordCount <= 8) return 500;
  if (recordCount <= 24) return 250;
  return 125;
}

/** playMs: 영상이면 실제 재생할 클립 길이 (잘렸으면 앞부분만, 이후는 그 장면에서 정지). 사진은 0 */
export type Segment = { item: MediaItem; startMs: number; durationMs: number; playMs: number };

/** 클립 길이들을 예산에 맞추는 공통 상한. 짧은 클립은 그대로 두고 긴 클립만 같은 길이로 자른다. 안 넘으면 Infinity */
export function clipCapMs(clipMs: readonly number[], budgetMs: number): number {
  const sorted = [...clipMs].sort((a, b) => a - b);
  let remaining = budgetMs;
  for (let i = 0; i < sorted.length; i += 1) {
    const each = remaining / (sorted.length - i);
    const clip = sorted[i] as number;
    if (clip > each) return Math.max(MIN_CLIP_MS, Math.floor(each));
    remaining -= clip;
  }
  return Infinity;
}

/** 사진은 머무는 시간, 영상은 클립 길이 (전체가 MAX_GROWTH_MS를 넘으면 잘라서). 마지막 기록은 1초 더 (영상이면 마지막 장면 정지) */
export function buildSegments(items: readonly MediaItem[]): Segment[] {
  const hold = photoHoldMs(items.length);
  const clips = items.flatMap((item) => (item.kind === 'video' ? [item.durationMs] : []));
  const photoMs = (items.length - clips.length) * hold;
  const cap = clipCapMs(clips, MAX_GROWTH_MS - LAST_HOLD_MS - photoMs);
  let startMs = 0;
  return items.map((item, i) => {
    const playMs = item.kind === 'video' ? Math.min(item.durationMs, cap) : 0;
    const base = item.kind === 'video' ? playMs : hold;
    const durationMs = i === items.length - 1 ? base + LAST_HOLD_MS : base;
    const seg = { item, startMs, durationMs, playMs };
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
