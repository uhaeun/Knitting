/**
 * 결과 사진 계획. 순수 함수만 — 네이티브 의존 없음 → 테스트 가능.
 * 설계도 6장: 전체 1장(현재 + 편물명·경과일) · 전후 2분할(첫 | 현재) · 3분할(첫 | 시간 기준 중간 | 현재).
 * 그리기는 composeResult.ts(앱, Skia) · composeResult.web.ts(웹, Canvas)가 이 장면(Scene)을 그대로 따른다.
 */
import { daysSince, formatMonthDay } from '@/shared/lib/dates';

export type ResultKind = 'single' | 'beforeAfter' | 'triple';

export const RESULT_KINDS: readonly { kind: ResultKind; label: string; minPhotos: number }[] = [
  { kind: 'single', label: '전체', minPhotos: 1 },
  { kind: 'beforeAfter', label: '전후', minPhotos: 2 },
  { kind: 'triple', label: '3분할', minPhotos: 3 },
];

/** 결과 이미지 한 변 (px) · JPEG 품질. 설계도: 1080×1080, q90 */
export const RESULT_SIDE = 1080;
export const RESULT_JPEG_QUALITY = 0.9;

/** 1080 캔버스 기준 그리기 치수. UI 스타일이 아니라 출력 이미지 좌표라 tokens.ts가 아닌 여기에 둔다 */
export const RESULT_METRICS = {
  gutter: 6, // 분할 사이 흰 줄
  margin: 28, // 라벨과 가장자리 간격
  labelPadX: 18,
  labelPadY: 10,
  labelRadius: 12,
  labelFont: 34, // 분할 라벨 "12일째"
  titleFont: 52, // 전체 1장 편물 이름
  subtitleFont: 34, // 전체 1장 "12일째 · 9월 17일"
  captionGap: 8,
} as const;

export type Rect = { x: number; y: number; width: number; height: number };

type TimedPost = { taken_at: string; created_at: string };

export type ScenePanel = { uri: string; dst: Rect; label: string | null };
export type Scene = {
  side: number;
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

/** 세로로 n칸. 칸 사이에 gutter. 반올림 오차는 마지막 칸이 흡수해 합이 정확히 side가 된다 */
export function layoutPanels(count: number, side: number, gutter: number = RESULT_METRICS.gutter): Rect[] {
  const width = Math.floor((side - gutter * (count - 1)) / count);
  return Array.from({ length: count }, (_, i) => {
    const x = i * (width + gutter);
    return { x, y: 0, width: i === count - 1 ? side - x : width, height: side };
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

/** 편물 시작일 기준 그 사진이 며칠째인가. 시작 당일 = 1 */
export function dayOf(startedAt: string, takenAt: string): number {
  return daysSince(startedAt, new Date(takenAt));
}

export function buildScene<T extends TimedPost>(input: {
  kind: ResultKind;
  project: { name: string; started_at: string };
  posts: readonly T[];
  uriOf: (post: T) => string;
  side?: number;
}): Scene {
  const side = input.side ?? RESULT_SIDE;
  const picked = pickPanels(input.kind, input.posts);
  const rects = layoutPanels(picked.length, side);
  const labelOf = (p: T) => `${dayOf(input.project.started_at, p.taken_at)}일째`;

  const panels = picked.map((p, i) => ({
    uri: input.uriOf(p),
    dst: rects[i] as Rect,
    label: input.kind === 'single' ? null : labelOf(p),
  }));
  const current = picked[picked.length - 1] as T;
  return {
    side,
    panels,
    caption:
      input.kind === 'single'
        ? { title: input.project.name, subtitle: `${labelOf(current)} · ${formatMonthDay(current.taken_at)}` }
        : null,
  };
}

export function resultFileName(projectId: string, kind: ResultKind): string {
  return `knitting-${projectId.slice(0, 8)}-${kind}.jpg`;
}
