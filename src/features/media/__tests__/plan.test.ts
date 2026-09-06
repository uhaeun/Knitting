import { buildFrames, estimateDurationMs, holdFrames } from '@/features/media/plan';

describe('holdFrames', () => {
  it('적으면 오래, 많으면 짧게', () => {
    expect(holdFrames(2)).toBe(4);
    expect(holdFrames(8)).toBe(4);
    expect(holdFrames(9)).toBe(2);
    expect(holdFrames(24)).toBe(2);
    expect(holdFrames(25)).toBe(1);
    expect(holdFrames(100)).toBe(1);
  });
});

describe('buildFrames', () => {
  it('마지막 장은 1초(8f) 더 머문다', () => {
    const f = buildFrames(['a', 'b']);
    expect(f.length).toBe(4 + 4 + 8);
    expect(f.slice(0, 4)).toEqual(['a', 'a', 'a', 'a']);
    expect(f[f.length - 1]).toBe('b');
  });
  it('30장이면 30 + 8 프레임', () => {
    const paths = Array.from({ length: 30 }, (_, i) => `p${i}`);
    expect(buildFrames(paths).length).toBe(38);
  });
  it('순서를 유지한다', () => {
    const f = buildFrames(['x', 'y', 'z']);
    expect(f.indexOf('y')).toBeGreaterThan(f.lastIndexOf('x'));
    expect(f.indexOf('z')).toBeGreaterThan(f.lastIndexOf('y'));
  });
});

describe('estimateDurationMs', () => {
  it('2장 = 2초, 30장 = 4.75초', () => {
    expect(estimateDurationMs(2)).toBe(2000);
    expect(estimateDurationMs(30)).toBe(4750);
    expect(estimateDurationMs(0)).toBe(0);
  });
});
