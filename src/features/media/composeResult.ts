import { ImageFormat, Skia, type SkCanvas } from '@shopify/react-native-skia';
import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

import { centerCropFor, RESULT_JPEG_QUALITY, RESULT_METRICS as M, type Scene } from '@/features/media/resultPlan';
import { color } from '@/shared/ui/tokens';

/**
 * 앱 전용 결과 사진 합성 (Skia 오프스크린, 서버 왕복 없음). 웹은 composeResult.web.ts.
 * 결과는 캐시 디렉터리의 JPEG. 원본 사진은 건드리지 않는다.
 */
export async function composeResult(scene: Scene, fileName: string): Promise<string> {
  const surface = Skia.Surface.MakeOffscreen(scene.side, scene.side);
  if (!surface) throw new Error('합성 화면을 만들지 못했어요');
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color(color.surface));

  const paint = Skia.Paint();
  for (const panel of scene.panels) {
    const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(panel.uri));
    if (!image) throw new Error('사진을 읽지 못했어요');
    const src = centerCropFor(panel.dst, image.width(), image.height());
    canvas.drawImageRect(
      image,
      Skia.XYWHRect(src.x, src.y, src.width, src.height),
      Skia.XYWHRect(panel.dst.x, panel.dst.y, panel.dst.width, panel.dst.height),
      paint,
    );
    if (panel.label) {
      drawLabel(canvas, panel.label, panel.dst.x + M.margin, panel.dst.y + panel.dst.height - M.margin, panel.dst.width - M.margin * 2);
    }
  }

  if (scene.caption) {
    const subtitle = paragraph(scene.caption.subtitle, M.subtitleFont, false, scene.side - M.margin * 2);
    const title = paragraph(scene.caption.title, M.titleFont, true, scene.side - M.margin * 2);
    const boxW = Math.max(title.getLongestLine(), subtitle.getLongestLine()) + M.labelPadX * 2;
    const boxH = title.getHeight() + M.captionGap + subtitle.getHeight() + M.labelPadY * 2;
    const top = scene.side - M.margin - boxH;
    drawBox(canvas, M.margin, top, boxW, boxH);
    title.paint(canvas, M.margin + M.labelPadX, top + M.labelPadY);
    subtitle.paint(canvas, M.margin + M.labelPadX, top + M.labelPadY + title.getHeight() + M.captionGap);
  }

  surface.flush();
  const bytes = surface.makeImageSnapshot().encodeToBytes(ImageFormat.JPEG, Math.round(RESULT_JPEG_QUALITY * 100));
  const dir = new Directory(Paths.cache, 'results');
  if (!dir.exists) dir.create({ intermediates: true });
  // 이전 결과는 지운다 (한 번에 하나만 필요). 이름에 시각을 붙여 expo-image가 옛 이미지를 캐시로 보여주지 않게 한다
  for (const entry of dir.list()) if (entry instanceof File) entry.delete();
  const file = new File(dir, fileName.replace(/\.jpg$/, `-${Date.now()}.jpg`));
  file.create();
  file.write(bytes);
  return file.uri;
}

export async function saveResult(uri: string, _fileName: string): Promise<void> {
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) throw new Error('앨범 저장 권한이 없어요. 설정에서 켜 주세요.');
  await MediaLibrary.saveToLibraryAsync(uri);
}

export async function shareResult(uri: string, _fileName: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('이 기기에서는 공유를 쓸 수 없어요');
  await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg' });
}

/** 시스템 폰트 관리자를 쓰는 문단 — 한글 글꼴 대체(fallback)가 여기서 된다 */
function paragraph(text: string, fontSize: number, bold: boolean, maxWidth: number) {
  const p = Skia.ParagraphBuilder.Make({ maxLines: 1, ellipsis: '…' })
    .pushStyle({ color: Skia.Color(color.onDark), fontSize, fontStyle: { weight: bold ? 600 : 400 } })
    .addText(text)
    .pop()
    .build();
  p.layout(maxWidth);
  return p;
}

function drawBox(canvas: SkCanvas, x: number, y: number, w: number, h: number) {
  const bg = Skia.Paint();
  bg.setColor(Skia.Color(color.photoLabelBg));
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x, y, w, h), M.labelRadius, M.labelRadius), bg);
}

/** 왼쪽 아래 기준점(x, bottom)에 라벨 */
function drawLabel(canvas: SkCanvas, text: string, x: number, bottom: number, maxWidth: number) {
  const p = paragraph(text, M.labelFont, true, maxWidth - M.labelPadX * 2);
  const w = p.getLongestLine() + M.labelPadX * 2;
  const h = p.getHeight() + M.labelPadY * 2;
  drawBox(canvas, x, bottom - h, w, h);
  p.paint(canvas, x + M.labelPadX, bottom - h + M.labelPadY);
}
