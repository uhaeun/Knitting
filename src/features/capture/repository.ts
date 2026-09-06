import { getDb } from '@/shared/lib/db';
import { deleteIfExists, moveInto, photoDir, pruneOrphans, relPath, thumbDir, toUri } from '@/shared/lib/files';
import { newId } from '@/shared/lib/id';
import type { Post } from '@/shared/types/models';
import { processCapture } from '@/features/capture/image';

/** 사진(post) 데이터 접근은 이 파일에서만. */

export function listPosts(projectId: string): Post[] {
  return getDb().getAllSync<Post>(
    `SELECT * FROM posts WHERE project_id = ? AND deleted_at IS NULL
     ORDER BY taken_at ASC, created_at ASC`,
    projectId,
  );
}

/** 고스트 레이어용. 없으면 null = 첫 촬영 */
export function latestPost(projectId: string): Post | null {
  return getDb().getFirstSync<Post>(
    `SELECT * FROM posts WHERE project_id = ? AND deleted_at IS NULL
     ORDER BY taken_at DESC, created_at DESC LIMIT 1`,
    projectId,
  );
}

export const postPhotoUri = (p: Post): string => toUri(p.photo_path);
export const postThumbUri = (p: Post): string => toUri(p.thumb_path);

/**
 * 저장 파이프라인 — 순서 고정 (CLAUDE.md):
 * 촬영 → EXIF 정규화 → 정사각 크롭 → 1440 리사이즈 → 썸네일 → 파일 저장 → DB INSERT → 임시파일 삭제
 * 파일이 DB보다 먼저다. INSERT 실패 시 옮긴 파일을 되돌려 지운다.
 * 원본(sourceUri)은 여기서 지우지 않는다. 호출부가 성공 확인 후 처리한다.
 */
export async function savePost(input: {
  projectId: string;
  sourceUri: string;
  width: number;
  height: number;
  takenAt?: Date;
}): Promise<Post> {
  const { photo, thumb } = await processCapture(input.sourceUri, input.width, input.height);

  const id = newId();
  const photoName = `${id}.jpg`;
  const photoRel = relPath('photos', photoName);
  const thumbRel = relPath('thumbs', photoName);

  await moveInto(photo.uri, photoDir(), photoName);
  try {
    await moveInto(thumb.uri, thumbDir(), photoName);
  } catch (e) {
    deleteIfExists(photoRel);
    throw e;
  }

  const now = new Date().toISOString();
  const projectVis = getDb().getFirstSync<{ default_visibility: Post['visibility'] }>(
    'SELECT default_visibility FROM projects WHERE id = ?', input.projectId,
  );
  const post: Post = {
    id,
    project_id: input.projectId,
    photo_path: photoRel,
    thumb_path: thumbRel,
    width: photo.width,
    height: photo.height,
    taken_at: (input.takenAt ?? new Date()).toISOString(),
    visibility: projectVis?.default_visibility ?? 'private',
    created_at: now,
    updated_at: now,
    deleted_at: null,
    synced_at: null,
  };

  try {
    getDb().runSync(
      `INSERT INTO posts (id, project_id, photo_path, thumb_path, width, height, taken_at, visibility, created_at, updated_at, deleted_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      post.id, post.project_id, post.photo_path, post.thumb_path,
      post.width, post.height, post.taken_at, post.visibility, post.created_at, post.updated_at,
    );
  } catch (e) {
    deleteIfExists(photoRel);
    deleteIfExists(thumbRel);
    throw e;
  }
  return post;
}

export function deletePost(id: string): void {
  const now = new Date().toISOString();
  getDb().runSync('UPDATE posts SET deleted_at = ?, updated_at = ?, synced_at = NULL WHERE id = ?', now, now, id);
}

/** 동기화용: 서버에 올릴 것이 있는 행 (삭제 포함) */
export function unsyncedPosts(): Post[] {
  return getDb().getAllSync<Post>('SELECT * FROM posts WHERE synced_at IS NULL ORDER BY created_at ASC');
}
export function markPostSynced(id: string, at: string): void {
  getDb().runSync('UPDATE posts SET synced_at = ? WHERE id = ?', at, id);
}
/** 서버에서 받은 행을 로컬에 넣는다 (이미 있으면 무시). 파일은 호출부가 먼저 내려받는다. */
export function insertPostFromRemote(p: Post): void {
  getDb().runSync(
    `INSERT OR IGNORE INTO posts (id, project_id, photo_path, thumb_path, width, height, taken_at, visibility, created_at, updated_at, deleted_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    p.id, p.project_id, p.photo_path, p.thumb_path, p.width, p.height, p.taken_at, p.visibility,
    p.created_at, p.updated_at, p.deleted_at, p.synced_at,
  );
}
export function postExists(id: string): boolean {
  return !!getDb().getFirstSync<{ id: string }>('SELECT id FROM posts WHERE id = ?', id);
}

/** 앱 시작 시 한 번. DB에 없는 파일 정리. soft-deleted 것은 보존. */
export function cleanupOrphanFiles(): number {
  const rows = getDb().getAllSync<{ photo_path: string; thumb_path: string }>(
    'SELECT photo_path, thumb_path FROM posts',
  );
  const keep = new Set<string>();
  for (const r of rows) {
    keep.add(r.photo_path);
    keep.add(r.thumb_path);
  }
  return pruneOrphans(keep);
}
