import { ImageManipulator, SaveFormat, type ImageResult } from 'expo-image-manipulator';

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
 * 촬영 캔버스 크기 상한. 안드로이드는 getUserMedia의 ideal 힌트보다 훨씬 큰(카메라 원본) 해상도를
 * 그대로 줄 때가 많다. 최종 저장은 어차피 1440px로 다시 줄어들므로, 화질 손해 없이
 * 찍는 순간의 캔버스 그리기·JPEG 인코딩 비용만 줄인다. 순수 계산. 테스트 가능.
 */
export function captureCanvasSize(
  sourceWidth: number,
  sourceHeight: number,
  maxSide: number,
): { width: number; height: number } {
  const longest = Math.max(sourceWidth, sourceHeight);
  if (longest <= maxSide) return { width: sourceWidth, height: sourceHeight };
  const scale = maxSide / longest;
  return { width: Math.round(sourceWidth * scale), height: Math.round(sourceHeight * scale) };
}

export type ProcessedImage = { photo: ImageResult; thumb: ImageResult };

/**
 * 원본 URI → 정사각 사진 + 썸네일 (둘 다 브라우저 메모리의 임시 이미지).
 * ImageManipulator는 렌더 시 EXIF 방향을 적용해 픽셀을 다시 쓰므로 정규화가 여기서 끝난다.
 * width/height는 EXIF 적용 후 값을 넘겨야 한다 (Camera.tsx·앨범 선택 결과가 그렇다).
 */
export async function processCapture(
  uri: string,
  width: number,
  height: number,
): Promise<ProcessedImage> {
  const crop = centerSquare(width, height);
  const side = Math.min(crop.width, PHOTO_SIDE);

  const photoRef = await ImageManipulator.manipulate(uri)
    .crop(crop)
    .resize({ width: side, height: side })
    .renderAsync();
  const photo = await photoRef.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });

  const thumbRef = await ImageManipulator.manipulate(photo.uri)
    .resize({ width: THUMB_SIDE, height: THUMB_SIDE })
    .renderAsync();
  const thumb = await thumbRef.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });

  return { photo, thumb };
}
