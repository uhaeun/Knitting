import { EncodeUnsupportedError, even, pickEncodeSize } from '@/shared/lib/encodeSize';

describe('pickEncodeSize', () => {
  it('1080이 되면 그대로', async () => {
    const s = await pickEncodeSize(1080, 1080, async () => true);
    expect([s.width, s.height, s.scale]).toEqual([1080, 1080, 1]);
  });
  it('1080이 안 되면 2/3(720)로 낮춘다', async () => {
    const s = await pickEncodeSize(1080, 1920, async (_c, w) => w <= 720);
    expect([s.width, s.height]).toEqual([720, 1280]);
  });
  it('High가 안 되면 Main·Baseline을 본다', async () => {
    const s = await pickEncodeSize(1080, 1080, async (c) => c === 'avc1.42e028');
    expect(s.codec).toBe('avc1.42e028');
  });
  it('어느 크기도 안 되면 한국어로 알린다', async () => {
    await expect(pickEncodeSize(1080, 1080, async () => false)).rejects.toBeInstanceOf(EncodeUnsupportedError);
  });
  it('크기는 언제나 짝수', () => {
    expect(even(1350 * (2 / 3))).toBe(900);
    expect(even(1081)).toBe(1082);
  });
});
