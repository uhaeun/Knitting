import type { ComposedResult } from '@/features/media/composeResult';
import type { ResultKind, ResultRatio } from '@/features/media/resultPlan';
import { requireUserId, signPaths, readAllPages } from '@/shared/lib/remote';
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
  projects!results_project_id_fkey ( id, name, started_at, deleted_at )
`;

/** 업로드 → INSERT 순서 고정. 제작 키는 기기 간 공유되므로 실패 파일은 서버 정리 대상으로 보존한다. */
export async function publishResult(input: {
  projectId: string;
  kind: ResultKind | 'growth';
  ratio: ResultRatio;
  visibility: Visibility;
  composed: ComposedResult;
  recipeHash: string;
  remakeRequest?: string | null;
}): Promise<void> {
  const sb = getSupabase();
  const owner = requireUserId();
  const { data: editions, error: editionError } = await sb.rpc('prepare_result_edition', {
    pid: input.projectId, recipe: input.recipeHash, remake: input.remakeRequest ?? null,
  });
  if (editionError) throw new Error('제작 버전을 확인하지 못했어요');
  const edition = (editions as { id: string; state: string }[] | null)?.[0];
  if (!edition) throw new Error('제작 버전을 확인하지 못했어요');
  if (edition.state === 'deleted') throw new Error('삭제한 제작 버전은 다시 발행할 수 없어요. 다시 제작해 주세요.');
  if (edition.state === 'published') return;
  const id = edition.id;
  const ext = input.composed.output === 'mp4' ? 'mp4' : 'jpg';
  const fileKey = remoteResultPath(owner, input.projectId, id, ext);
  const thumbKey = remoteResultThumbPath(owner, input.projectId, id);
  const bucket = sb.storage.from(PHOTOS_BUCKET);

  const { error: fileErr } = await bucket.upload(fileKey, input.composed.file, {
    contentType: input.composed.file.type,
    upsert: false,
  });
  if (fileErr && fileErr.message !== 'The resource already exists' && !/already exists/i.test(fileErr.message)) throw new Error(`파일을 올리지 못했어요: ${fileErr.message}`);
  const { error: thumbErr } = await bucket.upload(thumbKey, input.composed.posterBlob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (thumbErr && !/already exists/i.test(thumbErr.message)) {
    throw new Error(`대표 이미지를 올리지 못했어요: ${thumbErr.message}`);
  }

  const now = new Date().toISOString();
  const row: RemoteResult = {
    id,
    edition_id: id,
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
    // An INSERT error may be a lost response after commit. Never delete a published file.
    const confirmed = await sb.rpc('prepare_result_edition', {
      pid: input.projectId, recipe: input.recipeHash, remake: input.remakeRequest ?? null,
    });
    const state = (confirmed.data as { state: string }[] | null)?.[0]?.state;
    if (!confirmed.error && state === 'published') return;
    throw new Error('발행 상태를 다시 확인해 주세요. 제작 버전과 원본은 유지했어요.');
  }
}

export async function prepareEdition(projectId: string, recipeHash: string, remakeRequest: string | null) {
  const { data, error } = await getSupabase().rpc('prepare_result_edition', {
    pid: projectId, recipe: recipeHash, remake: remakeRequest,
  });
  if (error) throw new Error(error.details === 'LEGACY_EDITION_UNVERIFIED' ? '과거 제작 버전을 확인할 수 없어요. 다시 제작해 주세요.' : '제작 버전을 확인하지 못했어요');
  const edition = (data as { id: string; state: 'unpublished' | 'published' | 'deleted' }[] | null)?.[0];
  if (!edition) throw new Error('제작 버전을 확인하지 못했어요');
  return { ...edition, recipeHash };
}

export type ResultsPage = { results: FeedResult[]; urls: Map<string, string> };

/** 팔로잉 피드용 결과물. v1: 최근 것부터 일정 개수만 (posts처럼 커서 페이지네이션은 아직 없음) */
export async function fetchFollowingResults(limit = 20): Promise<ResultsPage> {
  const sb = getSupabase();
  const { data: follows, error: fe } = await sb.from('follows').select('followee_id')
    .eq('follower_id', requireUserId()).eq('status', 'accepted');
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
  const viewer = requireUserId();
  const { data, error } = await getSupabase()
    .from('results').select(RESULT_SELECT).eq('id', resultId).is('deleted_at', null).single();
  if (error) throw new Error(error.message);
  if (requireUserId() !== viewer) throw new Error('계정이 바뀌었어요');
  const result = data as unknown as FeedResult;
  const urls = await signPaths([result.file_path]);
  return { result, url: urls.get(result.file_path) ?? null };
}

export async function deleteResult(id: string): Promise<void> {
  const { error } = await getSupabase().rpc('delete_result', { result_id: id });
  if (error) throw new Error('결과물을 삭제하지 못했어요');
}

export async function fetchMyResults(): Promise<ResultsPage> {
  const owner = requireUserId();
  const rows = await readAllPages<FeedResult>((from, to) => getSupabase().from('results')
    .select(RESULT_SELECT).eq('owner_id', owner).is('deleted_at', null)
    .order('created_at', { ascending: false }).order('id').range(from, to));
  const urls = await signPaths(rows.map((r) => r.thumb_path));
  if (requireUserId() !== owner) throw new Error('계정이 바뀌었어요');
  return { results: rows, urls };
}
export async function renameResult(id: string, title: string): Promise<void> {
  const value = title.trim();
  if (!value || value.length > 50) throw new Error('제목은 1~50자예요');
  const { error } = await getSupabase().from('results').update({ display_title_override: value }).eq('id', id);
  if (error) throw new Error('제목을 바꾸지 못했어요');
}
export async function setResultVisibility(id: string, visibility: Visibility): Promise<void> {
  const { error } = await getSupabase().rpc('set_result_visibility', { result_id: id, v: visibility });
  if (error) throw new Error('공개 범위를 바꾸지 못했어요');
}

export type LegacyLinkRisk = { id: string; title: string; deleted_at: string | null; kind: string; output: string; status: string; auto_attempts: number; manual_attempts: number; next_attempt_at: string | null; last_code: string | null; origin_blocked: number; cdn_verified: number; objects: { asset: string; origin_blocked: boolean; cdn_verified: boolean; code: string | null }[] };
export type LinkRiskSnapshot = { risks: LegacyLinkRisk[]; summary: { total: number; processing: number; action_needed: number; checked_at: string } };
export async function fetchLegacyLinkRisks(): Promise<LinkRiskSnapshot> {
  const owner = requireUserId();
  const { data, error } = await getSupabase().rpc('my_link_risks_snapshot');
  if (error || !data || requireUserId() !== owner) throw new Error('링크 위험 상태를 확인하지 못했어요');
  const snapshot = data as LinkRiskSnapshot;
  if (!Array.isArray(snapshot.risks) || snapshot.summary?.total !== snapshot.risks.length ||
    snapshot.summary.processing + snapshot.summary.action_needed !== snapshot.summary.total || !snapshot.summary.checked_at) {
    throw new Error('링크 위험 집계가 일치하지 않아요');
  }
  return snapshot;
}

export async function retryLegacyLink(id: string): Promise<void> {
  const { error } = await getSupabase().rpc('retry_my_link_revocation', { rid: id });
  if (error) throw new Error('재시도를 요청하지 못했어요. 잠시 후 다시 시도해 주세요.');
}
