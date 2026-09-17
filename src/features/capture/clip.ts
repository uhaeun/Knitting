/**
 * 영상 기록 순수 계산. 브라우저 의존 없음 → 테스트 가능.
 * 설계: docs/superpowers/specs/2026-09-17-video-records-design.md
 */

export const CLIP_MAX_MS = 5000;
export const CLIP_MIN_MS = 1000;
export const CLIP_SIDE = 1080;
export const CLIP_FPS = 30;
export const CLIP_BITRATE = 4_000_000;
/** 자동 정지(100ms 간격 확인)와 녹화기 마무리로 5초를 조금 넘기는 건 "잘렸다"고 알리지 않는다 */
export const CLIP_TRIM_NOTICE_TOLERANCE_MS = 500;

/** 코덱까지 명시한다. 'video/mp4'만 주면 브라우저마다 안에 넣는 코덱이 달라 다시 못 읽는 경우가 있다 */
export const RECORDER_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.640028',
  'video/mp4;codecs=avc1',
  'video/webm;codecs=vp8',
  'video/webm;codecs=vp9',
] as const;

export function pickRecorderMime(isSupported: (mime: string) => boolean): string | null {
  return RECORDER_MIME_CANDIDATES.find((m) => isSupported(m)) ?? null;
}

/** 회전·픽셀비율을 반영한 화면 크기 기준 가운데 정사각 */
export function squareCrop(displayWidth: number, displayHeight: number) {
  const side = Math.min(displayWidth, displayHeight);
  return {
    left: Math.floor((displayWidth - side) / 2),
    top: Math.floor((displayHeight - side) / 2),
    width: side,
    height: side,
  };
}

export function trimEndSec(durationSec: number): number {
  return Math.min(durationSec, CLIP_MAX_MS / 1000);
}

/** 원본이 5초보다 눈에 띄게 길 때만 true. 자르는 위치(trimEndSec)는 정확히 5초 그대로 */
export function isTrimmed(durationSec: number): boolean {
  return durationSec * 1000 > CLIP_MAX_MS + CLIP_TRIM_NOTICE_TOLERANCE_MS;
}

export function shouldAutoStop(elapsedMs: number): boolean {
  return elapsedMs >= CLIP_MAX_MS;
}

export function isLongEnough(elapsedMs: number): boolean {
  return elapsedMs >= CLIP_MIN_MS;
}

export function formatClipTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
