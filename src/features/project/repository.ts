import { newId } from '@/shared/lib/id';
import { requireUserId, signPaths } from '@/shared/lib/remote';
import { getSupabase } from '@/shared/lib/supabase';
import type { Project, ProjectSummary, Visibility } from '@/shared/types/models';
import type { RemoteProject } from '@/shared/types/remote';

/**
 * 편물 데이터 접근은 이 파일에서만. 화면은 queries.ts의 훅만 쓴다.
 * ProjectSummary.cover_thumb_path에는 Storage 키 대신 서명 URL이 들어간다.
 */

const toLocal = (r: RemoteProject): Project => ({
  id: r.id,
  name: r.name,
  started_at: r.started_at,
  finished_at: r.finished_at,
  cover_post_id: r.cover_post_id,
  default_visibility: r.default_visibility,
  created_at: r.created_at,
  updated_at: r.updated_at,
  deleted_at: r.deleted_at,
});

/** 사진 수·표지는 서버 함수가 센다 (사진 행을 받아 세면 1000행 제한에 걸린다) */
export async function listProjects(): Promise<ProjectSummary[]> {
  requireUserId();
  const { data, error } = await getSupabase().rpc('project_summaries');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as (Omit<RemoteProject, 'owner_id' | 'deleted_at'> & {
    photo_count: number;
    cover_thumb_path: string | null;
  })[];
  const urls = await signPaths(rows.flatMap((r) => (r.cover_thumb_path ? [r.cover_thumb_path] : [])));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    started_at: r.started_at,
    finished_at: r.finished_at,
    cover_post_id: r.cover_post_id,
    default_visibility: r.default_visibility,
    created_at: r.created_at,
    updated_at: r.updated_at,
    deleted_at: null,
    photo_count: Number(r.photo_count),
    cover_thumb_path: r.cover_thumb_path ? (urls.get(r.cover_thumb_path) ?? null) : null,
  }));
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await getSupabase()
    .from('projects').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toLocal(data as RemoteProject) : null;
}

export async function createProject(input: {
  name: string;
  started_at: string;
  default_visibility?: Visibility;
}): Promise<Project> {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 50) throw new Error('편물 이름은 1~50자');
  const now = new Date().toISOString();
  const row: RemoteProject = {
    id: newId(),
    owner_id: requireUserId(),
    name,
    cover_post_id: null,
    started_at: input.started_at,
    finished_at: null,
    default_visibility: input.default_visibility ?? 'private',
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  const { error } = await getSupabase().from('projects').insert(row);
  if (error) throw new Error(`편물을 만들지 못했어요: ${error.message}`);
  return toLocal(row);
}

/** 공개 범위 변경. 기존 사진에도 같이 적용한다 (repository.ts와 같은 규칙). 서버 함수 안에서 한 트랜잭션. */
export async function setProjectVisibility(id: string, v: Visibility): Promise<void> {
  const { error } = await getSupabase().rpc('set_project_visibility', { pid: id, v });
  if (error) throw new Error(`공개 범위를 바꾸지 못했어요: ${error.message}`);
}

/** 편물 이름 바꾸기. 1~50자 (DB 제약과 같다). */
export async function renameProject(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  const { error } = await getSupabase().from('projects').update({ name: trimmed }).eq('id', id);
  if (error) throw new Error(`이름을 바꾸지 못했어요: ${error.message}`);
}

/** soft delete. 편물과 사진을 서버 함수 안에서 한 트랜잭션으로. Storage 파일은 남긴다 (복구 여지). */
export async function deleteProject(id: string): Promise<void> {
  const { error } = await getSupabase().rpc('soft_delete_project', { pid: id });
  if (error) throw new Error(`편물을 지우지 못했어요: ${error.message}`);
}

