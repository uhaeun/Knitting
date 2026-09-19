import {
  ALL_FORMATS,
  BlobSource,
  BufferSource,
  BufferTarget,
  CanvasSink,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
} from 'mediabunny';

import { CLIP_BITRATE, CLIP_FPS, CLIP_SIDE, isTrimmed, squareCrop, trimEndSec } from '@/features/capture/clip';
import { pickEncodeSize } from '@/shared/lib/encodeSize';

/**
 * 녹화·앨범 영상 → 저장 형식(1080×1080 H.264 MP4, 무음, 30fps, 5초 이하) + 첫 장면 JPEG.
 * 크롭은 회전·픽셀비율 반영 크기(getDisplayWidth/Height) 기준 가운데 정사각.
 * 회전은 메타데이터로 남기지 않고 프레임에 굽는다 (합성·재생 쪽이 회전을 신경 쓰지 않게).
 */

export type ProcessedClip = { mp4: Blob; durationMs: number; trimmed: boolean; posterUri: string };

export function canRecordVideo(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined';
}

export async function processClip(source: Blob, onProgress?: (ratio: number) => void): Promise<ProcessedClip> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(source) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('영상을 읽지 못했어요');
    if (!(await track.canDecode())) throw new Error('이 영상 형식은 읽을 수 없어요');
    const durationSec = await input.computeDuration();
    const crop = squareCrop(await track.getDisplayWidth(), await track.getDisplayHeight());

    const size = await pickEncodeSize(CLIP_SIDE, CLIP_SIDE);
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    const conversion = await Conversion.init({
      input,
      output,
      showWarnings: false,
      video: {
        crop,
        width: size.width,
        height: size.height,
        fit: 'cover',
        codec: 'avc',
        bitrate: CLIP_BITRATE,
        frameRate: CLIP_FPS,
        forceTranscode: true,
        allowTransformationMetadata: false,
      },
      audio: { discard: true },
      trim: { start: 0, end: trimEndSec(durationSec) },
    });
    if (!conversion.isValid) throw new Error('이 영상은 변환할 수 없어요');
    if (onProgress) conversion.onProgress = (p) => onProgress(p);
    await conversion.execute();
    if (!target.buffer) throw new Error('변환 결과가 비어 있어요');

    const mp4 = new Blob([target.buffer], { type: 'video/mp4' });
    const { durationMs, posterUri } = await readBack(target.buffer);
    return { mp4, durationMs, trimmed: isTrimmed(durationSec), posterUri };
  } finally {
    input.dispose();
  }
}

/** 변환 결과를 다시 열어 실제 길이와 첫 장면을 얻는다 */
async function readBack(buffer: ArrayBuffer): Promise<{ durationMs: number; posterUri: string }> {
  const back = new Input({ formats: ALL_FORMATS, source: new BufferSource(buffer) });
  try {
    const track = await back.getPrimaryVideoTrack();
    if (!track) throw new Error('변환 결과를 읽지 못했어요');
    const durationMs = Math.round((await back.computeDuration()) * 1000);
    const sink = new CanvasSink(track, { width: CLIP_SIDE, height: CLIP_SIDE, fit: 'cover', poolSize: 1 });
    const first = await sink.getCanvas(await track.getFirstTimestamp());
    if (!first) throw new Error('첫 장면을 읽지 못했어요');
    const jpeg = await canvasToJpeg(first.canvas);
    return { durationMs, posterUri: URL.createObjectURL(jpeg) };
  } finally {
    back.dispose();
  }
}

async function canvasToJpeg(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
  if (!blob) throw new Error('첫 장면을 저장하지 못했어요');
  return blob;
}
