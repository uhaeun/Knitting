import { Directory, File, Paths } from 'expo-file-system';

import { listPosts, postPhotoUri } from '@/features/capture/repository';
import { buildFrames, MIN_PHOTOS, VIDEO_FPS, VIDEO_SIDE } from '@/features/media/plan';
import { addProgressListener, encode, type EncodeProgress, type EncodeResult } from '../../../modules/video-encoder';

/**
 * 편물 하나의 사진 전부 → MP4. 결과는 캐시 디렉터리 (앨범 저장·공유 후 사라져도 됨).
 * 원본 사진은 건드리지 않는다.
 */
export async function makeVideo(
  projectId: string,
  onProgress?: (p: EncodeProgress) => void,
): Promise<EncodeResult> {
  const posts = listPosts(projectId);
  if (posts.length < MIN_PHOTOS) throw new Error(`사진이 ${MIN_PHOTOS}장 이상 있어야 영상을 만들 수 있어요`);

  const dir = new Directory(Paths.cache, 'videos');
  if (!dir.exists) dir.create({ intermediates: true });
  const outFile = new File(dir, `${projectId}.mp4`);
  const outputPath = outFile.uri.replace(/^file:\/\//, '');

  const frames = buildFrames(posts.map(postPhotoUri));
  const sub = onProgress ? addProgressListener(onProgress) : null;
  try {
    return await encode(frames, { outputPath, width: VIDEO_SIDE, height: VIDEO_SIDE, fps: VIDEO_FPS });
  } finally {
    sub?.remove();
  }
}
