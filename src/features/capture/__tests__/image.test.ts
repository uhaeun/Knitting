import { centerSquare, pinchedZoom, squareCapture } from '@/features/capture/image';

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

describe('squareCapture', () => {
  it('1배: 가운데 정사각 전체, 한 변이 상한(1440)을 넘으면 상한으로', () => {
    expect(squareCapture(3024, 4032, 1, 1440)).toEqual({ sx: 0, sy: 504, side: 3024, outSide: 1440 });
  });
  it('원본이 상한보다 작으면 늘리지 않는다', () => {
    expect(squareCapture(1080, 1920, 1, 1440)).toEqual({ sx: 0, sy: 420, side: 1080, outSide: 1080 });
  });
  it('디지털 줌 2배: 정사각의 가운데 절반만 오린다', () => {
    expect(squareCapture(2000, 2000, 2, 1440)).toEqual({ sx: 500, sy: 500, side: 1000, outSide: 1000 });
  });
  it('1보다 작은 배율은 1배로 취급', () => {
    expect(squareCapture(1000, 800, 0.5, 1440)).toEqual({ sx: 100, sy: 0, side: 800, outSide: 800 });
  });
});

describe('pinchedZoom', () => {
  it('손가락 거리가 두 배로 벌어지면 배율도 두 배', () => {
    expect(pinchedZoom(1, 100, 200, 1, 3)).toBe(2);
  });
  it('모으면 줄어든다', () => {
    expect(pinchedZoom(2, 200, 100, 1, 3)).toBe(1);
  });
  it('범위를 넘지 않는다', () => {
    expect(pinchedZoom(2, 100, 400, 1, 3)).toBe(3);
    expect(pinchedZoom(1.5, 400, 100, 1, 3)).toBe(1);
  });
  it('0.1 단위로 맞춘다', () => {
    expect(pinchedZoom(1, 100, 123, 1, 3)).toBe(1.2);
  });
  it('시작 거리가 0이면 배율을 바꾸지 않는다', () => {
    expect(pinchedZoom(1.5, 0, 100, 1, 3)).toBe(1.5);
  });
});
