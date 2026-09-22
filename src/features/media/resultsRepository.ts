import type { ComposedResult } from '@/features/media/composeResult';
import type { ResultKind, ResultRatio } from '@/features/media/resultPlan';
import { newId } from '@/shared/lib/id';
import { requireUserId, signPaths } from '@/shared/lib/remote';
import { getSupabase, PHOTOS_BUCKET, remoteResultPath, remoteResultThumbPath } from '@/shared/lib/supabase';
import type { FeedResult, RemoteResult } from '@/shared/types/remote';
import type { Visibility } from '@/shared/types/models';

/**
 * 발행한 결과물(results) 데이터 접근은 이 파일에서만.
 * composeResult.ts가 만든 것을 그대로 올린다 — 다시 합성하지 않는다.
 */

const RESULT_SELECT = `
  *,
  profiles!results_owner_id_fkey ( id, username, display_name, is_private, avatar_path ),
  projects!results_project_id_fkey ( id, name, started_at )
`;

/** 업로드 → INSERT 순서 고정 (CLAUDE.md 절대 규칙과 같다). 실패하면 올린 파일을 지운다. */
export async function publishResult(input: {
  projectId: string;
  kind: ResultKind;
  ratio: ResultRatio;
  visibility: Visibility;
  composed: ComposedResult;
}): Promise<void> {
  const sb = getSupabase();
  const owner = requireUserId();
  const id = newId();
  const ext = input.composed.output === 'mp4' ? 'mp4' : 'jpg';
  const fileKey = remoteResultPath(owner, input.projectId, id, ext);
  const thumbKey = remoteResultThumbPath(owner, input.projectId, id);
  const bucket = sb.storage.from(PHOTOS_BUCKET);

  const { error: fileErr } = await bucket.upload(fileKey, input.composed.file, {
    contentType: input.composed.file.type,
    upsert: false,
  });
  if (fileErr) throw new Error(`파일을 올리지 못했어요: ${fileErr.message}`);
  const { error: thumbErr } = await bucket.upload(thumbKey, input.composed.posterBlob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (thumbErr) {
    await bucket.remove([fileKey]);
    throw new Error(`대표 이미지를 올리지 못했어요: ${thumbErr.message}`);
  }

  const now = new Date().toISOString();
  const row: RemoteResult = {
    id,
    project_id: input.projectId,
    owner_id: owner,
    kind: input.kind,
    ratio: input.ratio,
    output: input.composed.output,
    file_path: fileKey,
    thumb_path: thumbKey,
    visibility: input.visibility,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  const { error } = await sb.from('results').insert(row);
  if (error) {
    await bucket.remove([fileKey, thumbKey]);
    throw new Error(`피드에 올리지 못했어요: ${error.message}`);
  }
}

export type ResultsPage = { results: FeedResult[]; urls: Map<string, string> };

/** 팔로잉 피드용 결과물. v1: 최근 것부터 일정 개수만 (posts처럼 커서 페이지네이션은 아직 없음) */
export async function fetchFollowingResults(limit = 20): Promise<ResultsPage> {
  const sb = getSupabase();
  const { data: follows, error: fe } = await sb.from('follows').select('followee_id').eq('status', 'accepted');
  if (fe) throw new Error(fe.message);
  const ids = (follows ?? []).map((f) => (f as { followee_id: string }).followee_id);
  if (ids.length === 0) return { results: [], urls: new Map() };

  const { data, error } = await sb
    .from('results')
    .select(RESULT_SELECT)
    .in('owner_id', ids)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as FeedResult[];
  const urls = await signPaths(rows.map((r) => r.thumb_path));
  return { results: rows, urls };
}

export async function fetchResult(resultId: string): Promise<{ result: FeedResult; url: string | null }> {
  const { data, error } = await getSupabase()
    .from('results').select(RESULT_SELECT).eq('id', resultId).is('deleted_at', null).single();
  if (error) throw new Error(error.message);
  const result = data as unknown as FeedResult;
  const urls = await signPaths([result.file_path]);
  return { result, url: urls.get(result.file_path) ?? null };
}

export async function deleteResult(id: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await getSupabase().from('results').update({ deleted_at: now, updated_at: now }).eq('id', id);
  if (error) throw new Error(error.message);
}
