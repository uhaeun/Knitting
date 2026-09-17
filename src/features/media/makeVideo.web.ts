import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

import { listPosts, postPhotoUri } from '@/features/capture/repository';
import { buildFrames, MIN_PHOTOS, VIDEO_FPS, VIDEO_SIDE } from '@/features/media/plan';
import type { EncodeProgress, EncodeResult } from '../../../modules/video-encoder/src/VideoEncoder.types';

/**
 * 웹 전용. 편물 하나의 사진 전부 → H.264 MP4 (WebCodecs + mp4-muxer).
 * 프레임 계획은 앱과 같은 plan.ts를 쓴다. 결과는 blob URL (페이지를 닫으면 사라져도 됨).
 */

const BITRATE = 6_000_000;
/** High → Main → Baseline 순으로 브라우저가 되는 것을 쓴다. 전부 1080×1080을 담는 레벨 4.0 */
const CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.420028'] as const;

export async function makeVideo(
  projectId: string,
  onProgress?: (p: EncodeProgress) => void,
): Promise<EncodeResult> {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('이 브라우저는 영상 만들기를 지원하지 않아요. 최신 Chrome이나 Safari(16.4 이상)에서 열어 주세요.');
  }
  const posts = await listPosts(projectId);
  if (posts.length < MIN_PHOTOS) throw new Error(`사진이 ${MIN_PHOTOS}장 이상 있어야 영상을 만들 수 있어요`);

  const codec = await pickCodec();
  const frames = buildFrames(posts.map(postPhotoUri));

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: VIDEO_SIDE, height: VIDEO_SIDE, frameRate: VIDEO_FPS },
    fastStart: 'in-memory',
  });

  let encodeError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e instanceof Error ? e : new Error(String(e));
    },
  });
  encoder.configure({ codec, width: VIDEO_SIDE, height: VIDEO_SIDE, bitrate: BITRATE, framerate: VIDEO_FPS, avc: { format: 'avc' } });

  const canvas = new OffscreenCanvas(VIDEO_SIDE, VIDEO_SIDE);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('영상 캔버스를 만들지 못했어요');

  const frameDurationUs = 1_000_000 / VIDEO_FPS;
  // 사진은 한 번에 한 장만 메모리에 둔다 (1440² 한 장 ≈ 8MB. 전부 미리 풀면 iOS Safari 탭이 죽는다)
  let current = null as { url: string; bitmap: ImageBitmap } | null; // as: 루프 안 재할당을 TS가 null로 좁히지 않게
  try {
    for (let i = 0; i < frames.length; i += 1) {
      if (encodeError) throw encodeError;
      const url = frames[i] ?? '';
      if (current?.url !== url) {
        current?.bitmap.close();
        current = { url, bitmap: await loadBitmap(url) };
      }
      ctx.drawImage(current.bitmap, 0, 0, VIDEO_SIDE, VIDEO_SIDE);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameDurationUs), duration: Math.round(frameDurationUs) });
      encoder.encode(frame, { keyFrame: i % (VIDEO_FPS * 2) === 0 });
      frame.close();
      // 인코더 대기열이 쌓이면 잠시 비운다 (메모리)
      if (encoder.encodeQueueSize > 8) await encoder.flush();
      onProgress?.({ progress: (i + 1) / frames.length, frame: i + 1, total: frames.length });
    }
    await encoder.flush();
    if (encodeError) throw encodeError;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
    current?.bitmap.close();
  }

  muxer.finalize();
  const blob = new Blob([target.buffer], { type: 'video/mp4' });
  return {
    uri: URL.createObjectURL(blob),
    frameCount: frames.length,
    durationMs: (frames.length * 1000) / VIDEO_FPS,
    bytes: blob.size,
  };
}

async function pickCodec(): Promise<string> {
  for (const codec of CODECS) {
    const { supported } = await VideoEncoder.isConfigSupported({ codec, width: VIDEO_SIDE, height: VIDEO_SIDE, bitrate: BITRATE, framerate: VIDEO_FPS });
    if (supported) return codec;
  }
  throw new Error('이 브라우저에서는 H.264 영상을 만들 수 없어요');
}

async function loadBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`사진을 내려받지 못했어요 (${res.status})`);
  return createImageBitmap(await res.blob());
}
