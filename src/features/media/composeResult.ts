import { createMp4Writer, loadBitmap, openClip, type OpenClip } from '@/features/media/mediaWriter';
import {
  centerCropFor,
  outputKindOf,
  RESULT_JPEG_QUALITY,
  RESULT_METRICS as M,
  RESULT_VIDEO_FPS,
  resultFileName,
  sceneDurationMs,
  type ResultKind,
  type Scene,
} from '@/features/media/resultPlan';
import { color } from '@/shared/ui/tokens';

/**
 * 결과 사진 합성. 칸이 모두 사진이면 JPEG, 하나라도 영상이면 MP4(30fps, 길이 = 가장 긴 영상).
 * 결과는 미리보기용 blob URL과 저장용 File.
 */

export type ComposedResult = { output: 'jpeg' | 'mp4'; uri: string; file: File };
type Drawable = ImageBitmap | HTMLCanvasElement | OffscreenCanvas;

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
const font = (size: number, bold: boolean) => `${bold ? 600 : 400} ${size}px ${FONT_FAMILY}`;

export async function composeResult(
  scene: Scene,
  projectId: string,
  kind: ResultKind,
  onProgress?: (ratio: number) => void,
): Promise<ComposedResult> {
  return outputKindOf(scene) === 'mp4' ? composeVideo(scene, projectId, kind, onProgress) : composeJpeg(scene, projectId, kind);
}

async function composeJpeg(scene: Scene, projectId: string, kind: ResultKind): Promise<ComposedResult> {
  const canvas = document.createElement('canvas');
  canvas.width = scene.side;
  canvas.height = scene.side;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('합성 화면을 만들지 못했어요');
  const settled = await Promise.allSettled(scene.panels.map((p) => loadBitmap(p.media.uri)));
  const images = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
  const failed = settled.find((s) => s.status === 'rejected');
  if (failed) {
    for (const b of images) b.close(); // 하나라도 못 불러오면 불러온 것도 닫는다
    throw failed.reason;
  }
  try {
    drawFrame(ctx, scene, images);
  } finally {
    for (const b of images) b.close();
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', RESULT_JPEG_QUALITY));
  if (!blob) throw new Error('결과 사진을 만들지 못했어요');
  return { output: 'jpeg', uri: URL.createObjectURL(blob), file: new File([blob], resultFileName(projectId, kind, 'jpg'), { type: 'image/jpeg' }) };
}

async function composeVideo(scene: Scene, projectId: string, kind: ResultKind, onProgress?: (ratio: number) => void): Promise<ComposedResult> {
  const writer = await createMp4Writer(scene.side, RESULT_VIDEO_FPS);
  const bitmaps = new Map<number, ImageBitmap>();
  const clips = new Map<number, OpenClip>();
  try {
    for (const [i, p] of scene.panels.entries()) {
      if (p.media.kind === 'video') clips.set(i, await openClip(p.media.uri, scene.side));
      else bitmaps.set(i, await loadBitmap(p.media.uri));
    }
    const frameCount = Math.max(1, Math.ceil((sceneDurationMs(scene) * RESULT_VIDEO_FPS) / 1000));
    const dt = 1 / RESULT_VIDEO_FPS;
    for (let f = 0; f < frameCount; f += 1) {
      const t = f * dt;
      const images: (Drawable | null)[] = [];
      for (const i of scene.panels.keys()) {
        const clip = clips.get(i);
        images.push(clip ? await clip.cursor.frameAt(t) : (bitmaps.get(i) ?? null));
      }
      drawFrame(writer.ctx, scene, images);
      await writer.add(t, dt);
      onProgress?.((f + 1) / frameCount);
    }
    const blob = await writer.finish();
    return { output: 'mp4', uri: URL.createObjectURL(blob), file: new File([blob], resultFileName(projectId, kind, 'mp4'), { type: 'video/mp4' }) };
  } catch (e) {
    await writer.cancel().catch(() => {});
    throw e;
  } finally {
    for (const b of bitmaps.values()) b.close();
    for (const c of clips.values()) c.close();
  }
}

/** 칸 이미지 + 라벨 + 캡션을 한 프레임으로. 이미지가 없는 칸(아직 프레임 없음)은 바탕색 */
function drawFrame(ctx: CanvasRenderingContext2D, scene: Scene, images: readonly (Drawable | null)[]) {
  ctx.fillStyle = color.surface;
  ctx.fillRect(0, 0, scene.side, scene.side);
  ctx.textBaseline = 'top';
  scene.panels.forEach((panel, i) => {
    const image = images[i];
    if (image) {
      const src = centerCropFor(panel.dst, image.width, image.height);
      ctx.drawImage(image, src.x, src.y, src.width, src.height, panel.dst.x, panel.dst.y, panel.dst.width, panel.dst.height);
    }
    if (panel.label) drawLabel(ctx, panel.label, panel.dst.x + M.margin, panel.dst.y + panel.dst.height - M.margin);
  });

  if (scene.caption) {
    const maxW = scene.side - M.margin * 2 - M.labelPadX * 2;
    const title = fit(ctx, scene.caption.title, font(M.titleFont, true), maxW);
    const subtitle = fit(ctx, scene.caption.subtitle, font(M.subtitleFont, false), maxW);
    const boxW = Math.max(title.width, subtitle.width) + M.labelPadX * 2;
    const boxH = M.titleFont + M.captionGap + M.subtitleFont + M.labelPadY * 2;
    const top = scene.side - M.margin - boxH;
    drawBox(ctx, M.margin, top, boxW, boxH);
    ctx.fillStyle = color.onDark;
    ctx.font = font(M.titleFont, true);
    ctx.fillText(title.text, M.margin + M.labelPadX, top + M.labelPadY);
    ctx.font = font(M.subtitleFont, false);
    ctx.fillText(subtitle.text, M.margin + M.labelPadX, top + M.labelPadY + M.titleFont + M.captionGap);
  }
}

/** 한 줄에 안 들어가면 말줄임 */
function fit(ctx: CanvasRenderingContext2D, text: string, f: string, maxWidth: number): { text: string; width: number } {
  ctx.font = f;
  if (ctx.measureText(text).width <= maxWidth) return { text, width: ctx.measureText(text).width };
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return { text: `${t}…`, width: ctx.measureText(`${t}…`).width };
}

function drawBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = color.photoLabelBg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, M.labelRadius);
  ctx.fill();
}

/** 왼쪽 아래 기준점(x, bottom)에 라벨 */
function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, bottom: number) {
  ctx.font = font(M.labelFont, true);
  const w = ctx.measureText(text).width + M.labelPadX * 2;
  const h = M.labelFont + M.labelPadY * 2;
  drawBox(ctx, x, bottom - h, w, h);
  ctx.fillStyle = color.onDark;
  ctx.fillText(text, x + M.labelPadX, bottom - h + M.labelPadY);
}
