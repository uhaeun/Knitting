/**
 * 결과 사진 계획. 순수 함수만 — 브라우저 의존 없음 → 테스트 가능.
 * 설계도 6장: 전체 1장(현재 + 편물명·경과일) · 전후 2분할(첫 | 현재) · 3분할(첫 | 시간 기준 중간 | 현재).
 * 그리기는 composeResult.ts(Canvas)가 이 장면(Scene)을 그대로 따른다.
 */
import { formatMonthDay } from '@/shared/lib/dates';
import { mediaOf, type MediaItem, type MediaPost } from '@/features/media/mediaItem';

export type ResultKind = 'single' | 'beforeAfter' | 'triple';

export const RESULT_KINDS: readonly { kind: ResultKind; label: string; minPhotos: number }[] = [
  { kind: 'single', label: '전체', minPhotos: 1 },
  { kind: 'beforeAfter', label: '전후', minPhotos: 2 },
  { kind: 'triple', label: '3분할', minPhotos: 3 },
];

/** 결과 비율. 인스타그램 규격 크기 그대로 (피드 4:5, 스토리·릴스 9:16) */
export type ResultRatio = '1:1' | '4:5' | '9:16' | '16:9';
export const RESULT_RATIOS: readonly { ratio: ResultRatio; label: string; width: number; height: number }[] = [
  { ratio: '1:1', label: '정사각', width: 1080, height: 1080 },
  { ratio: '4:5', label: '4:5', width: 1080, height: 1350 },
  { ratio: '9:16', label: '9:16', width: 1080, height: 1920 },
  { ratio: '16:9', label: '16:9', width: 1920, height: 1080 },
];
export const DEFAULT_RATIO: ResultRatio = '1:1';

export function ratioSize(ratio: ResultRatio): { width: number; height: number } {
  const r = RESULT_RATIOS.find((x) => x.ratio === ratio) ?? RESULT_RATIOS[0];
  return { width: r?.width ?? 1080, height: r?.height ?? 1080 };
}

/** 결과 이미지 짧은 변 (px) · JPEG 품질 */
export const RESULT_SIDE = 1080;
export const RESULT_JPEG_QUALITY = 0.9;
export const RESULT_VIDEO_FPS = 30;

/** 1080 캔버스 기준 그리기 치수. UI 스타일이 아니라 출력 이미지 좌표라 tokens.ts가 아닌 여기에 둔다 */
export const RESULT_METRICS = {
  gutter: 6, // 분할 사이 흰 줄
  margin: 28, // 라벨과 가장자리 간격
  labelPadX: 18,
  labelPadY: 10,
  labelRadius: 12,
  labelFont: 34, // 분할 라벨 "9월 17일"
  titleFont: 52, // 전체 1장 편물 이름
  subtitleFont: 34, // 전체 1장 "9월 17일 · 9번째 기록"
  captionGap: 8,
} as const;

export type Rect = { x: number; y: number; width: number; height: number };

type TimedPost = { taken_at: string; created_at: string };

export type ScenePanel = { media: MediaItem; dst: Rect; label: string | null };
export type Scene = {
  ratio: ResultRatio;
  width: number;
  height: number;
  panels: ScenePanel[];
  /** 전체 1장에만. 왼쪽 아래 두 줄 */
  caption: { title: string; subtitle: string } | null;
};

export function minPhotosFor(kind: ResultKind): number {
  return RESULT_KINDS.find((k) => k.kind === kind)?.minPhotos ?? 1;
}

/**
 * 시간순(오름차순) 사진에서 칸에 들어갈 사진을 고른다.
 * 3분할의 가운데는 첫·마지막 사진 사이 시간의 한가운데에 가장 가까운 사진 (같으면 앞의 것).
 */
export function pickPanels<T extends TimedPost>(kind: ResultKind, posts: readonly T[]): T[] {
  const need = minPhotosFor(kind);
  if (posts.length < need) throw new Error(`사진이 ${need}장 이상 있어야 해요`);
  const first = posts[0] as T;
  const last = posts[posts.length - 1] as T;
  if (kind === 'single') return [last];
  if (kind === 'beforeAfter') return [first, last];

  const t0 = Date.parse(first.taken_at);
  const mid = t0 + (Date.parse(last.taken_at) - t0) / 2;
  let best = posts[1] as T;
  for (let i = 1; i < posts.length - 1; i += 1) {
    const p = posts[i] as T;
    if (Math.abs(Date.parse(p.taken_at) - mid) < Math.abs(Date.parse(best.taken_at) - mid)) best = p;
  }
  return [first, best, last];
}

/**
 * n칸으로 나눈다. 정사각·가로는 옆으로, 세로가 긴 비율은 위아래로 쌓는다. stack=true면 비율과 상관없이 위아래로.
 * 칸 사이에 gutter. 반올림 오차는 마지막 칸이 흡수해 합이 정확히 캔버스 크기가 된다.
 */
export function layoutPanels(
  count: number,
  width: number,
  height: number,
  gutter: number = RESULT_METRICS.gutter,
  stack: boolean = false,
): Rect[] {
  const stacked = stack || height > width;
  const total = stacked ? height : width;
  const each = Math.floor((total - gutter * (count - 1)) / count);
  return Array.from({ length: count }, (_, i) => {
    const at = i * (each + gutter);
    const len = i === count - 1 ? total - at : each;
    return stacked ? { x: 0, y: at, width, height: len } : { x: at, y: 0, width: len, height };
  });
}

/** 원본(imageW×imageH)에서 dst와 같은 비율의 가운데 영역. 늘이지 않고 잘라서 채운다 */
export function centerCropFor(dst: Pick<Rect, 'width' | 'height'>, imageW: number, imageH: number): Rect {
  const target = dst.width / dst.height;
  if (imageW / imageH > target) {
    const width = imageH * target;
    return { x: (imageW - width) / 2, y: 0, width, height: imageH };
  }
  const height = imageW / target;
  return { x: 0, y: (imageH - height) / 2, width: imageW, height };
}

export function buildScene<T extends TimedPost & MediaPost>(input: {
  kind: ResultKind;
  project: { name: string; started_at: string };
  posts: readonly T[];
  ratio?: ResultRatio;
}): Scene {
  const ratio = input.ratio ?? DEFAULT_RATIO;
  const { width, height } = ratioSize(ratio);
  const picked = pickPanels(input.kind, input.posts);
  // 3분할은 셋로그처럼 가로 띠 셋을 위아래로 (하은 결정 2026-09-20). 전후는 비율에 따라
  const rects = layoutPanels(picked.length, width, height, RESULT_METRICS.gutter, input.kind === 'triple');
  const labelOf = (p: T) => formatMonthDay(p.taken_at);

  const panels = picked.map((p, i) => ({
    media: mediaOf(p),
    dst: rects[i] as Rect,
    label: input.kind === 'single' ? null : labelOf(p),
  }));
  const current = picked[picked.length - 1] as T;
  return {
    ratio,
    width,
    height,
    panels,
    caption:
      input.kind === 'single'
        ? { title: input.project.name, subtitle: `${formatMonthDay(current.taken_at)} · ${input.posts.length}번째 기록` }
        : null,
  };
}

/** 칸 중 영상이 하나라도 있으면 MP4 */
export function outputKindOf(scene: Scene): 'jpeg' | 'mp4' {
  return scene.panels.some((p) => p.media.kind === 'video') ? 'mp4' : 'jpeg';
}

/** MP4 길이 = 칸 중 가장 긴 영상. 사진뿐이면 0 */
export function sceneDurationMs(scene: Scene): number {
  return Math.max(0, ...scene.panels.map((p) => (p.media.kind === 'video' ? p.media.durationMs : 0)));
}

export function resultFileName(projectId: string, kind: ResultKind, ext: 'jpg' | 'mp4', ratio: ResultRatio = DEFAULT_RATIO): string {
  const suffix = ratio === '1:1' ? '' : `-${ratio.replace(':', 'x')}`;
  return `knitting-${projectId.slice(0, 8)}-${kind}${suffix}.${ext}`;
}
