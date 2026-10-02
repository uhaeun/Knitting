/** CLAUDE.md 절대 규칙: 장변 1440 / JPEG q80, 썸네일 400, 중앙 정사각 크롭, EXIF 정규화 */
export const PHOTO_SIDE = 1440;
export const THUMB_SIDE = 400;
const JPEG_QUALITY = 0.8;

/** 순수 계산. 테스트 가능. */
export function centerSquare(width: number, height: number): {
  originX: number;
  originY: number;
  width: number;
  height: number;
} {
  const side = Math.min(width, height);
  return {
    originX: Math.floor((width - side) / 2),
    originY: Math.floor((height - side) / 2),
    width: side,
    height: side,
  };
}

/**
 * 카메라 프레임에서 찍을 영역: 가운데 정사각을 digitalZoom배 확대해 오려낸 부분(sx, sy, side)과 저장할 한 변(outSide).
 * 원본 해상도보다 크게 늘리지 않고, maxSide를 넘기지 않는다. 순수 계산. 테스트 가능.
 */
export function squareCapture(
  sourceWidth: number,
  sourceHeight: number,
  digitalZoom: number,
  maxSide: number,
): { sx: number; sy: number; side: number; outSide: number } {
  const side = Math.min(sourceWidth, sourceHeight) / Math.max(1, digitalZoom);
  return {
    sx: (sourceWidth - side) / 2,
    sy: (sourceHeight - side) / 2,
    side,
    outSide: Math.min(Math.round(side), maxSide),
  };
}

/** 두 손가락 벌리기·모으기: 시작 때 거리 대비 지금 거리의 비율만큼 배율을 바꾼다. 0.1 단위로 맞춘다. 순수 계산. 테스트 가능. */
export function pinchedZoom(startZoom: number, startDistance: number, distance: number, min: number, max: number): number {
  const raw = startDistance > 0 ? (startZoom * distance) / startDistance : startZoom;
  return Math.min(max, Math.max(min, Math.round(raw * 10) / 10));
}

export type EncodedImage = { blob: Blob; width: number; height: number };
export type ProcessedImage = { photo: EncodedImage; thumb: EncodedImage };

function newCanvas(side: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('사진을 만들지 못했어요');
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

/** source의 (sx, sy, side) 정사각 영역을 outSide × outSide 캔버스에 그린다 */
export function drawSquare(source: CanvasImageSource, sx: number, sy: number, side: number, outSide: number): HTMLCanvasElement {
  const { canvas, ctx } = newCanvas(outSide);
  ctx.drawImage(source, sx, sy, side, side, 0, 0, outSide, outSide);
  return canvas;
}

export function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('사진을 만들지 못했어요'))), 'image/jpeg', quality);
  });
}

async function loadImage(uri: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = uri;
  try {
    // 브라우저가 EXIF 방향을 적용해 디코딩한다. naturalWidth/Height도 적용 후 값이다 (EXIF 정규화)
    await img.decode();
  } catch {
    throw new Error('사진을 읽지 못했어요');
  }
  return img;
}

/**
 * 원본 URI → 정사각 사진 + 썸네일 JPEG. 캔버스에 곧바로 그려 JPEG으로 한 번씩만 인코딩한다.
 * (이전에 쓰던 ImageManipulator는 단계마다 전체 크기 PNG를 한 번 더 만들어 저장이 매우 느렸다)
 */
export async function processCapture(uri: string): Promise<ProcessedImage> {
  const img = await loadImage(uri);
  const crop = centerSquare(img.naturalWidth, img.naturalHeight);
  const side = Math.min(crop.width, PHOTO_SIDE);
  const photoCanvas = drawSquare(img, crop.originX, crop.originY, crop.width, side);
  const thumbSide = Math.min(THUMB_SIDE, side);
  const thumbCanvas = drawSquare(photoCanvas, 0, 0, side, thumbSide);
  const [photo, thumb] = await Promise.all([
    encodeJpeg(photoCanvas, JPEG_QUALITY),
    encodeJpeg(thumbCanvas, JPEG_QUALITY),
  ]);
  return {
    photo: { blob: photo, width: side, height: side },
    thumb: { blob: thumb, width: thumbSide, height: thumbSide },
  };
}
