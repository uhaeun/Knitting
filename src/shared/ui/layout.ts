import { Platform, useWindowDimensions } from 'react-native';

import { size } from '@/shared/ui/tokens';

/**
 * 화면 콘텐츠 너비. 앱은 창 너비 그대로, 웹은 폰 너비 한 칸(size.webColumn)을 넘지 않는다.
 * useWindowDimensions().width를 사진 크기 계산에 직접 쓰지 않고 이 훅을 쓴다.
 */
export function useContentWidth(): number {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' ? Math.min(width, size.webColumn) : width;
}

/**
 * 정사각 사진의 한 변. 앱은 창 너비(기존 동작 유지).
 * 웹은 창이 낮으면 버튼이 밀려나지 않게 높이에서 사진 외 공간(chrome)을 뺀 만큼으로 줄인다.
 */
export function useSquareSide(chrome: number): number {
  const { height } = useWindowDimensions();
  const width = useContentWidth();
  if (Platform.OS !== 'web') return width;
  return Math.max(size.webPhotoMin, Math.min(width, height - chrome));
}
