import { centerSquare } from '@/features/capture/image';

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
