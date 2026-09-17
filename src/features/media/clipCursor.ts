/** 영상 클립의 프레임을 시간순으로 꺼낸다. 시각은 초, 클립 시작 = 0 */
export type ClipFrame<T> = { timestamp: number; image: T };

/**
 * frameAt(t): t초에 보여야 할 프레임 (t 이전의 가장 최근 프레임). 끝을 넘으면 마지막 프레임에 머문다.
 * 시간은 앞으로만 간다 (디코더를 순서대로 한 번만 읽는다).
 * 현재·다음 두 프레임을 동시에 들고 있으므로, 프레임 이미지를 재사용하는 공급자는 풀을 3 이상으로 둔다.
 */
export class ClipCursor<T> {
  private current: ClipFrame<T> | null = null;
  private next: ClipFrame<T> | null = null;
  private started = false;
  private ended = false;

  constructor(private readonly frames: AsyncIterator<ClipFrame<T>>) {}

  async frameAt(t: number): Promise<T | null> {
    if (!this.started) {
      this.started = true;
      this.current = await this.pull();
      this.next = await this.pull();
    }
    while (this.next && this.next.timestamp <= t) {
      this.current = this.next;
      this.next = await this.pull();
    }
    return this.current?.image ?? null;
  }

  private async pull(): Promise<ClipFrame<T> | null> {
    if (this.ended) return null;
    const r = await this.frames.next();
    if (r.done) {
      this.ended = true;
      return null;
    }
    return r.value;
  }
}
