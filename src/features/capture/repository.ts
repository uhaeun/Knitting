import { processCapture } from '@/features/capture/image';
import { processClip } from '@/features/capture/videoPipeline';
import { newId } from '@/shared/lib/id';
import { readAllPages, requireUserId, signPaths } from '@/shared/lib/remote';
import { getSupabase, PHOTOS_BUCKET, remotePhotoPath, remoteThumbPath, remoteVideoPath } from '@/shared/lib/supabase';
import type { Post } from '@/shared/types/models';
import type { RemotePost } from '@/shared/types/remote';

/**
 * 사진(post) 데이터 접근은 이 파일에서만. Supabase가 원본이다.
 * 읽어 온 Post의 photo_path·thumb_path에는 Storage 키 대신 서명 URL(1시간, 만료 15분 전까지 재사용)이 들어간다.
 */

async function withUrls(rows: RemotePost[]): Promise<Post[]> {
  const keys = rows.flatMap((r) => (r.video_path ? [r.photo_path, r.thumb_path, r.video_path] : [r.photo_path, r.thumb_path]));
  const urls = await signPaths(keys);
  return rows.map((r) => ({
    id: r.id,
    project_id: r.project_id,
    media_type: r.media_type,
    photo_path: urls.get(r.photo_path) ?? '',
    thumb_path: urls.get(r.thumb_path) ?? '',
    video_path: r.video_path ? (urls.get(r.video_path) ?? null) : null,
    duration_ms: r.duration_ms,
    width: r.width,
    height: r.height,
    taken_at: r.taken_at,
    visibility: r.visibility,
    created_at: r.created_at,
    updated_at: r.updated_at,
    deleted_at: r.deleted_at,
  }));
}

/** 1000장이 넘는 편물도 끝까지 읽는다 (PostgREST 행 제한) */
export async function listPosts(projectId: string): Promise<Post[]> {
  const rows = await readAllPages<RemotePost>((from, to) =>
    getSupabase()
      .from('posts').select('*').eq('project_id', projectId).is('deleted_at', null)
      .order('taken_at', { ascending: true }).order('created_at', { ascending: true }).order('id', { ascending: true })
      .range(from, to),
  );
  return withUrls(rows);
}

/** 고스트 레이어용. 없으면 null = 첫 촬영 */
export async function latestPost(projectId: string): Promise<Post | null> {
  const { data, error } = await getSupabase()
    .from('posts').select('*').eq('project_id', projectId).is('deleted_at', null)
    .order('taken_at', { ascending: false }).order('created_at', { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  const [post] = await withUrls((data ?? []) as RemotePost[]);
  return post ?? null;
}

export const postPhotoUri = (p: Post): string => p.photo_path;
export const postThumbUri = (p: Post): string => p.thumb_path;

/**
 * 저장 파이프라인 — 순서는 앱과 같다:
 * 촬영 → EXIF 정규화 → 정사각 크롭 → 1440 리사이즈 → 썸네일 → 파일 업로드 → DB INSERT
 * 업로드가 INSERT보다 먼저다. INSERT 실패 시 올린 파일을 지운다.
 * 원본(sourceUri)은 브라우저 메모리의 data/blob URL이라 지울 것이 없다.
 */
export async function savePost(input: {
  projectId: string;
  sourceUri: string;
  width: number;
  height: number;
  takenAt?: Date;
}): Promise<Post> {
  const sb = getSupabase();
  const owner = requireUserId();
  const { photo, thumb } = await processCapture(input.sourceUri, input.width, input.height);

  const { data: project, error: pe } = await sb
    .from('projects').select('default_visibility').eq('id', input.projectId).maybeSingle();
  if (pe) throw new Error(pe.message);

  const id = newId();
  const photoKey = remotePhotoPath(owner, input.projectId, id);
  const thumbKey = remoteThumbPath(owner, input.projectId, id);
  const bucket = sb.storage.from(PHOTOS_BUCKET);

  await upload(photoKey, photo.uri);
  try {
    await upload(thumbKey, thumb.uri);
  } catch (e) {
    await bucket.remove([photoKey]);
    throw e;
  }

  const now = new Date().toISOString();
  const row: Omit<RemotePost, 'like_count' | 'comment_count' | 'hidden_at' | 'caption'> = {
    id,
    project_id: input.projectId,
    media_type: 'photo',
    video_path: null,
    duration_ms: null,
    owner_id: owner,
    photo_path: photoKey,
    thumb_path: thumbKey,
    width: photo.width,
    height: photo.height,
    taken_at: (input.takenAt ?? new Date()).toISOString(),
    visibility: (project as { default_visibility: Post['visibility'] } | null)?.default_visibility ?? 'private',
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  const { error } = await sb.from('posts').insert(row);
  if (error) {
    await bucket.remove([photoKey, thumbKey]);
    throw new Error(`사진을 저장하지 못했어요: ${error.message}`);
  }
  return row;
}

/**
 * 영상 기록 저장 — 순서 고정 (설계 2절):
 * 변환 → 첫 장면 → 대표 사진·썸네일 → 업로드(영상 → 대표 사진 → 썸네일) → posts INSERT
 * 중간 실패 시 올린 파일을 지운다. source(녹화 원본)는 호출자가 성공할 때까지 들고 있는다.
 */
export async function saveVideoPost(input: {
  projectId: string;
  source: Blob;
  takenAt?: Date;
  onProgress?: (stage: 'converting' | 'uploading', ratio: number) => void;
}): Promise<{ post: Post; trimmed: boolean }> {
  const sb = getSupabase();
  const owner = requireUserId();
  const clip = await processClip(input.source, (r) => input.onProgress?.('converting', r));
  try {
    const { photo, thumb } = await processCapture(clip.posterUri, 1080, 1080);

    const { data: project, error: pe } = await sb
      .from('projects').select('default_visibility').eq('id', input.projectId).maybeSingle();
    if (pe) throw new Error(pe.message);

    const id = newId();
    const videoKey = remoteVideoPath(owner, input.projectId, id);
    const photoKey = remotePhotoPath(owner, input.projectId, id);
    const thumbKey = remoteThumbPath(owner, input.projectId, id);
    const uploaded: string[] = [];
    const bucket = sb.storage.from(PHOTOS_BUCKET);
    const cleanup = async () => {
      if (uploaded.length) await bucket.remove(uploaded);
    };

    try {
      input.onProgress?.('uploading', 0);
      await upload(videoKey, clip.mp4, 'video/mp4');
      uploaded.push(videoKey);
      input.onProgress?.('uploading', 0.8);
      await upload(photoKey, photo.uri);
      uploaded.push(photoKey);
      await upload(thumbKey, thumb.uri);
      uploaded.push(thumbKey);
    } catch (e) {
      await cleanup();
      throw e;
    }

    const now = new Date().toISOString();
    const row: Omit<RemotePost, 'like_count' | 'comment_count' | 'hidden_at' | 'caption'> = {
      id,
      project_id: input.projectId,
      owner_id: owner,
      media_type: 'video',
      photo_path: photoKey,
      thumb_path: thumbKey,
      video_path: videoKey,
      duration_ms: clip.durationMs,
      width: photo.width,
      height: photo.height,
      taken_at: (input.takenAt ?? new Date()).toISOString(),
      visibility: (project as { default_visibility: Post['visibility'] } | null)?.default_visibility ?? 'private',
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    const { error } = await sb.from('posts').insert(row);
    if (error) {
      await cleanup();
      throw new Error(`영상을 저장하지 못했어요: ${error.message}`);
    }
    input.onProgress?.('uploading', 1);
    return { post: row, trimmed: clip.trimmed };
  } finally {
    URL.revokeObjectURL(clip.posterUri);
  }
}

export async function deletePost(id: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await getSupabase().from('posts').update({ deleted_at: now, updated_at: now }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** 웹은 로컬 파일이 없다 */
export const cleanupOrphanFiles = (): number => 0;

async function upload(key: string, body: Blob | string, contentType: 'image/jpeg' | 'video/mp4' = 'image/jpeg'): Promise<void> {
  const blob = typeof body === 'string' ? await (await fetch(body)).blob() : body;
  const { error } = await getSupabase().storage.from(PHOTOS_BUCKET).upload(key, blob, { contentType, upsert: false });
  if (error) throw new Error(`파일을 올리지 못했어요 (${key}): ${error.message}`);
}
