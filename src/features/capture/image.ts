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

export type ProcessedImage = { photo: ImageResult; thumb: ImageResult };

/**
 * 원본 URI → 정사각 사진 + 썸네일 (둘 다 캐시 디렉터리의 임시 파일).
 * ImageManipulator는 렌더 시 EXIF 방향을 적용해 픽셀을 다시 쓰므로 정규화가 여기서 끝난다.
 * width/height는 EXIF 적용 후 값을 넘겨야 한다 (expo-camera 결과가 그렇다).
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
