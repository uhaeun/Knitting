/**
 * 이 기기가 H.264로 인코딩할 수 있는 크기를 고른다.
 * 대부분의 폰은 1080을 되지만, 하드웨어 인코더가 약한 안드로이드는 1080이 안 될 수 있다.
 * 그러면 2/3(1080→720)로 낮춰 다시 본다. 둘 다 안 되면 이유를 한국어로 알린다.
 */

/** 넓은 호환 순서: High → Main → Baseline. 전부 레벨 4.0(1080p까지) */
const AVC_CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028'] as const;
export const ENCODE_SCALES = [1, 2 / 3] as const;

/** H.264는 짝수 크기만 받는다 */
export const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export type EncodeSize = { width: number; height: number; scale: number; codec: string };

export class EncodeUnsupportedError extends Error {
  constructor() {
    super('이 기기에서는 영상을 만들 수 없어요. 사진만으로 된 결과는 계속 만들 수 있어요.');
    this.name = 'EncodeUnsupportedError';
  }
}

type Probe = (codec: string, width: number, height: number) => Promise<boolean>;

const defaultProbe: Probe = async (codec, width, height) => {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    const { supported } = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: 4_000_000, framerate: 30 });
    return !!supported;
  } catch {
    return false;
  }
};

const cache = new Map<string, EncodeSize>();

/** width×height부터 시도해 되는 크기를 돌려준다. probe는 테스트용 */
export async function pickEncodeSize(width: number, height: number, probe: Probe = defaultProbe): Promise<EncodeSize> {
  const key = `${width}x${height}`;
  const hit = probe === defaultProbe ? cache.get(key) : undefined;
  if (hit) return hit;
  for (const scale of ENCODE_SCALES) {
    const w = even(width * scale);
    const h = even(height * scale);
    for (const codec of AVC_CODECS) {
      if (await probe(codec, w, h)) {
        const size = { width: w, height: h, scale, codec };
        if (probe === defaultProbe) cache.set(key, size);
        return size;
      }
    }
  }
  throw new EncodeUnsupportedError();
}
