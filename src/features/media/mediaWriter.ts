import { ALL_FORMATS, BlobSource, BufferTarget, CanvasSink, CanvasSource, Input, Mp4OutputFormat, Output } from 'mediabunny';

import { ClipCursor, type ClipFrame } from '@/features/media/clipCursor';

/** 결과 사진 MP4·성장 영상이 함께 쓰는 MP4 쓰기와 영상 클립 읽기 (Mediabunny) */

export const MP4_BITRATE = 6_000_000;

export type Mp4Writer = {
  ctx: CanvasRenderingContext2D;
  add(timestampSec: number, durationSec: number): Promise<void>;
  finish(): Promise<Blob>;
  cancel(): Promise<void>;
};

/** width×height 캔버스에 그린 뒤 add()로 한 프레임씩 H.264 MP4에 쓴다 */
export async function createMp4Writer(width: number, height: number, fps: number): Promise<Mp4Writer> {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('이 브라우저는 영상 만들기를 지원하지 않아요. 최신 Chrome이나 Safari(16.4 이상)에서 열어 주세요.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('영상 캔버스를 만들지 못했어요');

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const source = new CanvasSource(canvas, { codec: 'avc', bitrate: MP4_BITRATE, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  return {
    ctx,
    add: (t, d) => source.add(t, d),
    finish: async () => {
      await output.finalize();
      if (!target.buffer) throw new Error('영상을 만들지 못했어요');
      return new Blob([target.buffer], { type: 'video/mp4' });
    },
    cancel: () => output.cancel(),
  };
}

export type OpenClip = { cursor: ClipCursor<HTMLCanvasElement | OffscreenCanvas>; close(): void };

/** 저장된 영상 클립(1080 정사각)을 열어 시간순 프레임 커서로. 다 쓰면 close() */
export async function openClip(url: string, side: number): Promise<OpenClip> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`영상을 내려받지 못했어요 (${res.status})`);
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(await res.blob()) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('영상을 읽지 못했어요');
    const first = await track.getFirstTimestamp();
    // ClipCursor가 현재·다음 두 캔버스를 들고 있으므로 풀은 3
    const sink = new CanvasSink(track, { width: side, height: side, fit: 'cover', poolSize: 3 });
    async function* frames(): AsyncGenerator<ClipFrame<HTMLCanvasElement | OffscreenCanvas>> {
      for await (const w of sink.canvases()) yield { timestamp: w.timestamp - first, image: w.canvas };
    }
    const it = frames();
    // 중간에 멈춘 클립도 디코더·미리 푼 프레임을 놓게 제너레이터를 먼저 끝낸다
    return { cursor: new ClipCursor(it), close: () => { void it.return(undefined); input.dispose(); } };
  } catch (e) {
    input.dispose();
    throw e;
  }
}

export async function loadBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`사진을 내려받지 못했어요 (${res.status})`);
  return createImageBitmap(await res.blob());
}
