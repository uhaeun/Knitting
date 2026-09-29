import { captureCanvasSize, centerSquare } from '@/features/capture/image';

describe('centerSquare', () => {
  it('세로 사진: 가로 기준 정사각, 위아래 잘라냄', () => {
    expect(centerSquare(3024, 4032)).toEqual({ originX: 0, originY: 504, width: 3024, height: 3024 });
  });
  it('가로 사진: 좌우 잘라냄', () => {
    expect(centerSquare(4032, 3024)).toEqual({ originX: 504, originY: 0, width: 3024, height: 3024 });
  });
  it('홀수 차이는 내림', () => {
    expect(centerSquare(101, 100).originX).toBe(0);
  });
});

describe('captureCanvasSize', () => {
  it('카메라 해상도가 상한보다 작으면 그대로 둔다', () => {
    expect(captureCanvasSize(1920, 1080, 2560)).toEqual({ width: 1920, height: 1080 });
  });
  it('상한보다 크면 긴 변 기준으로 줄인다 (안드로이드가 ideal 힌트보다 큰 해상도를 줄 때)', () => {
    expect(captureCanvasSize(4032, 3024, 2560)).toEqual({ width: 2560, height: 1920 });
  });
  it('세로 사진도 같은 비율로 줄인다', () => {
    expect(captureCanvasSize(3024, 4032, 2560)).toEqual({ width: 1920, height: 2560 });
  });
});
