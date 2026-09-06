import { File, Paths } from 'expo-file-system';

import {
  insertPostFromRemote,
  markPostSynced,
  postExists,
  unsyncedPosts,
} from '@/features/capture/repository';
import {
  insertProjectFromRemote,
  markProjectSynced,
  projectExists,
  unsyncedProjects,
} from '@/features/project/repository';
import { photoDir, relPath, thumbDir, toUri } from '@/shared/lib/files';
import { getSupabase, PHOTOS_BUCKET, remotePhotoPath, remoteThumbPath } from '@/shared/lib/supabase';
import type { Post, Project } from '@/shared/types/models';
import type { RemotePost, RemoteProject } from '@/shared/types/remote';

/**
 * 로컬 우선 + 서버 백업. 큐 없음 — 실패하면 synced_at이 NULL로 남고, 다음 push 때 다시 올라간다.
 * push: synced_at IS NULL인 행을 서버에 upsert (삭제도 deleted_at으로 반영)
 * pull: 서버의 내 편물·사진 중 로컬에 없는 것을 내려받는다 (새 기기 로그인)
 */

export type SyncReport = { pushedProjects: number; pushedPosts: number; pulledProjects: number; pulledPosts: number };

export async function pushAll(userId: string): Promise<Pick<SyncReport, 'pushedProjects' | 'pushedPosts'>> {
  const sb = getSupabase();
  let pushedProjects = 0;
  let pushedPosts = 0;

  for (const p of unsyncedProjects()) {
    const row: RemoteProject = {
      id: p.id,
      owner_id: userId,
      name: p.name,
      cover_post_id: null, // FK 순환 회피. 서버에서는 안 쓴다
      started_at: p.started_at,
      finished_at: p.finished_at,
      default_visibility: p.default_visibility,
      created_at: p.created_at,
      updated_at: p.updated_at,
      deleted_at: p.deleted_at,
    };
    const { error } = await sb.from('projects').upsert(row, { onConflict: 'id' });
    if (error) throw new Error(`편물 올리기 실패 (${p.name}): ${error.message}`);
    markProjectSynced(p.id, new Date().toISOString());
    pushedProjects += 1;
  }

  for (const post of unsyncedPosts()) {
    if (!projectSynced(post.project_id)) continue; // 편물이 먼저 올라가야 한다
    const photoKey = remotePhotoPath(userId, post.project_id, post.id);
    const thumbKey = remoteThumbPath(userId, post.project_id, post.id);

    if (!post.deleted_at) {
      await uploadFile(post.photo_path, photoKey);
      await uploadFile(post.thumb_path, thumbKey);
    }
    const row: Omit<RemotePost, 'like_count' | 'comment_count' | 'hidden_at' | 'caption'> = {
      id: post.id,
      project_id: post.project_id,
      owner_id: userId,
      photo_path: photoKey,
      thumb_path: thumbKey,
      width: post.width,
      height: post.height,
      taken_at: post.taken_at,
      visibility: post.visibility,
      created_at: post.created_at,
      updated_at: post.updated_at,
      deleted_at: post.deleted_at,
    };
    const { error } = await sb.from('posts').upsert(row, { onConflict: 'id' });
    if (error) throw new Error(`사진 올리기 실패: ${error.message}`);
    markPostSynced(post.id, new Date().toISOString());
    pushedPosts += 1;
  }
  return { pushedProjects, pushedPosts };
}

export async function pullAll(userId: string): Promise<Pick<SyncReport, 'pulledProjects' | 'pulledPosts'>> {
  const sb = getSupabase();
  const now = new Date().toISOString();
  let pulledProjects = 0;
  let pulledPosts = 0;

  const { data: projects, error: pe } = await sb
    .from('projects').select('*').eq('owner_id', userId).is('deleted_at', null);
  if (pe) throw new Error(pe.message);
  for (const r of (projects ?? []) as RemoteProject[]) {
    if (projectExists(r.id)) continue;
    const local: Project = {
      id: r.id, name: r.name, started_at: r.started_at, finished_at: r.finished_at,
      cover_post_id: null, default_visibility: r.default_visibility,
      created_at: r.created_at, updated_at: r.updated_at, deleted_at: null, synced_at: now,
    };
    insertProjectFromRemote(local);
    pulledProjects += 1;
  }

  const { data: posts, error: se } = await sb
    .from('posts').select('*').eq('owner_id', userId).is('deleted_at', null).order('taken_at');
  if (se) throw new Error(se.message);
  const missing = ((posts ?? []) as RemotePost[]).filter((p) => !postExists(p.id));
  if (missing.length === 0) return { pulledProjects, pulledPosts };

  // 서명 URL은 배치로. 개별 호출 N회 금지.
  const keys = missing.flatMap((p) => [p.photo_path, p.thumb_path]);
  const { data: signed, error: ue } = await sb.storage.from(PHOTOS_BUCKET).createSignedUrls(keys, 3600);
  if (ue) throw new Error(ue.message);
  const urlByKey = new Map((signed ?? []).map((s) => [s.path, s.signedUrl] as const));

  for (const r of missing) {
    const photoUrl = urlByKey.get(r.photo_path);
    const thumbUrl = urlByKey.get(r.thumb_path);
    if (!photoUrl || !thumbUrl) continue;
    const name = `${r.id}.jpg`;
    await File.downloadFileAsync(photoUrl, new File(photoDir(), name));
    await File.downloadFileAsync(thumbUrl, new File(thumbDir(), name));
    const local: Post = {
      id: r.id, project_id: r.project_id,
      photo_path: relPath('photos', name), thumb_path: relPath('thumbs', name),
      width: r.width, height: r.height, taken_at: r.taken_at, visibility: r.visibility,
      created_at: r.created_at, updated_at: r.updated_at, deleted_at: null, synced_at: now,
    };
    insertPostFromRemote(local);
    pulledPosts += 1;
  }
  return { pulledProjects, pulledPosts };
}

export async function syncAll(userId: string): Promise<SyncReport> {
  const pushed = await pushAll(userId);
  const pulled = await pullAll(userId);
  return { ...pushed, ...pulled };
}

// --- 내부 ---
function projectSynced(projectId: string): boolean {
  return !unsyncedProjects().some((p) => p.id === projectId);
}

async function uploadFile(localRelative: string, key: string): Promise<void> {
  const f = new File(Paths.document, localRelative);
  if (!f.exists) throw new Error(`로컬 파일이 없어요: ${localRelative}`);
  const bytes = await f.bytes();
  const { error } = await getSupabase().storage
    .from(PHOTOS_BUCKET)
    .upload(key, bytes, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`업로드 실패 (${key}): ${error.message}`);
}

export { toUri };
