/** 순수 함수. 사진 수 → 프레임 계획. 네이티브 의존 없음 → 테스트 가능. */

export const VIDEO_SIDE = 1080;
export const VIDEO_FPS = 8;
export const MIN_PHOTOS = 2;

/**
 * 한 장을 몇 프레임 유지할지. 사진이 적으면 오래, 많으면 짧게.
 * 2~8장: 0.5초(4f) · 9~24장: 0.25초(2f) · 25장~: 0.125초(1f)
 */
export function holdFrames(photoCount: number): number {
  if (photoCount <= 8) return 4;
  if (photoCount <= 24) return 2;
  return 1;
}

/** 시간순 사진 경로 → 인코더에 넘길 프레임 경로 배열 (반복 포함). 마지막 장은 1초 더 머문다. */
export function buildFrames(photoPaths: readonly string[]): string[] {
  const hold = holdFrames(photoPaths.length);
  const frames: string[] = [];
  photoPaths.forEach((p, i) => {
    const n = i === photoPaths.length - 1 ? hold + VIDEO_FPS : hold;
    for (let k = 0; k < n; k += 1) frames.push(p);
  });
  return frames;
}

export function estimateDurationMs(photoCount: number): number {
  if (photoCount === 0) return 0;
  return ((photoCount * holdFrames(photoCount) + VIDEO_FPS) * 1000) / VIDEO_FPS;
}
