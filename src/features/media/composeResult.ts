import { centerCropFor, RESULT_JPEG_QUALITY, RESULT_METRICS as M, type Scene } from '@/features/media/resultPlan';
import { color } from '@/shared/ui/tokens';

/**
 * 결과 사진 합성 (Canvas 2D, 서버 왕복 없음). 장면은 resultPlan.ts가 정한다.
 * 결과는 미리보기용 blob URL과 저장용 File.
 */

export type ComposedResult = { uri: string; file: File };

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
const font = (size: number, bold: boolean) => `${bold ? 600 : 400} ${size}px ${FONT_FAMILY}`;

export async function composeResult(scene: Scene, fileName: string): Promise<ComposedResult> {
  const canvas = document.createElement('canvas');
  canvas.width = scene.side;
  canvas.height = scene.side;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('합성 화면을 만들지 못했어요');
  ctx.fillStyle = color.surface;
  ctx.fillRect(0, 0, scene.side, scene.side);
  ctx.textBaseline = 'top';

  for (const panel of scene.panels) {
    const image = await loadBitmap(panel.uri);
    try {
      const src = centerCropFor(panel.dst, image.width, image.height);
      ctx.drawImage(image, src.x, src.y, src.width, src.height, panel.dst.x, panel.dst.y, panel.dst.width, panel.dst.height);
    } finally {
      image.close();
    }
    if (panel.label) drawLabel(ctx, panel.label, panel.dst.x + M.margin, panel.dst.y + panel.dst.height - M.margin);
  }

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

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', RESULT_JPEG_QUALITY));
  if (!blob) throw new Error('결과 사진을 만들지 못했어요');
  return { uri: URL.createObjectURL(blob), file: new File([blob], fileName, { type: 'image/jpeg' }) };
}

async function loadBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`사진을 내려받지 못했어요 (${res.status})`);
  return createImageBitmap(await res.blob());
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
