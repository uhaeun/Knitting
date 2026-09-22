import { centerSquare, zoomCropRect } from '@/features/capture/image';

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

describe('zoomCropRect', () => {
  it('1배는 원본 그대로', () => {
    expect(zoomCropRect(1000, 1000, 1)).toEqual({ x: 0, y: 0, width: 1000, height: 1000 });
  });
  it('2배는 가운데 절반만 (가로세로 각각 1/2배 크기)', () => {
    expect(zoomCropRect(1000, 1000, 2)).toEqual({ x: 250, y: 250, width: 500, height: 500 });
  });
  it('1보다 작은 값은 1로 취급 (원본보다 넓게 찍을 수는 없다)', () => {
    expect(zoomCropRect(1000, 800, 0.5)).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
  });
});
