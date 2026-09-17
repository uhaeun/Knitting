import { listPosts } from '@/features/capture/repository';
import { mediaOf } from '@/features/media/mediaItem';
import { createMp4Writer, loadBitmap, openClip, type OpenClip } from '@/features/media/mediaWriter';
import { buildSegments, GROWTH_FPS, MIN_RECORDS, segmentAt, totalDurationMs, VIDEO_SIDE, type Segment } from '@/features/media/plan';

/**
 * 편물 하나의 기록 전부 → 30fps H.264 MP4. 사진은 머무는 시간만큼, 영상은 클립을 끝까지 (전체 60초를 넘으면 앞부분만), 마지막 기록 +1초.
 * 한 번에 한 기록만 메모리에 둔다 (사진 비트맵 하나 또는 열린 클립 하나).
 */

export type EncodeProgress = { progress: number; frame: number; total: number }; // progress 0..1
export type EncodeResult = { uri: string; file: File; frameCount: number; durationMs: number; bytes: number };

type Current = { segment: Segment; bitmap: ImageBitmap | null; clip: OpenClip | null };

export async function makeVideo(projectId: string, onProgress?: (p: EncodeProgress) => void): Promise<EncodeResult> {
  const posts = await listPosts(projectId);
  if (posts.length < MIN_RECORDS) throw new Error(`기록이 ${MIN_RECORDS}개 이상 있어야 영상을 만들 수 있어요`);

  const segments = buildSegments(posts.map(mediaOf));
  const durationMs = totalDurationMs(segments);
  const frameCount = Math.ceil((durationMs * GROWTH_FPS) / 1000);
  const dt = 1 / GROWTH_FPS;
  const writer = await createMp4Writer(VIDEO_SIDE, GROWTH_FPS);

  let current = null as Current | null; // as: 루프 안 재할당을 TS가 null로 좁히지 않게
  const release = (c: Current | null) => {
    c?.bitmap?.close();
    c?.clip?.close();
  };

  try {
    for (let f = 0; f < frameCount; f += 1) {
      const tMs = (f * 1000) / GROWTH_FPS;
      const segment = segmentAt(segments, tMs);
      if (current?.segment !== segment) {
        release(current);
        current = segment.item.kind === 'video'
          ? { segment, bitmap: null, clip: await openClip(segment.item.uri, VIDEO_SIDE) }
          : { segment, bitmap: await loadBitmap(segment.item.uri), clip: null };
      }
      const image = current.clip ? await current.clip.cursor.frameAt(Math.min(tMs - segment.startMs, segment.playMs - 1000 / GROWTH_FPS) / 1000 + 1e-6) : current.bitmap;
      if (image) writer.ctx.drawImage(image, 0, 0, VIDEO_SIDE, VIDEO_SIDE);
      await writer.add(f * dt, dt);
      onProgress?.({ progress: (f + 1) / frameCount, frame: f + 1, total: frameCount });
    }
    const blob = await writer.finish();
    return {
      uri: URL.createObjectURL(blob),
      file: new File([blob], `knitting-${projectId.slice(0, 8)}.mp4`, { type: 'video/mp4' }),
      frameCount,
      durationMs,
      bytes: blob.size,
    };
  } catch (e) {
    await writer.cancel().catch(() => {});
    throw e;
  } finally {
    release(current);
  }
}
