import { ClipCursor, type ClipFrame } from '@/features/media/clipCursor';

async function* frames(ts: number[]): AsyncGenerator<ClipFrame<string>> {
  for (const t of ts) yield { timestamp: t, image: `f${t}` };
}

describe('ClipCursor', () => {
  it('각 시각에 그 시각 이전의 가장 최근 프레임', async () => {
    const c = new ClipCursor(frames([0, 0.5, 1, 1.5]));
    expect(await c.frameAt(0)).toBe('f0');
    expect(await c.frameAt(0.49)).toBe('f0');
    expect(await c.frameAt(0.5)).toBe('f0.5');
    expect(await c.frameAt(1.2)).toBe('f1');
  });
  it('끝을 넘으면 마지막 프레임에 머문다', async () => {
    const c = new ClipCursor(frames([0, 0.5]));
    expect(await c.frameAt(3)).toBe('f0.5');
    expect(await c.frameAt(4)).toBe('f0.5');
  });
  it('프레임이 하나도 없으면 null', async () => {
    const c = new ClipCursor(frames([]));
    expect(await c.frameAt(0)).toBeNull();
  });
});
