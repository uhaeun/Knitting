import type { Session } from '@supabase/supabase-js';
import { useAuth } from '@/features/auth/store';
import { getSupabase } from '@/shared/lib/supabase';
import { PAGE_ROWS } from '@/shared/lib/remote';
import { useOperatorSecurity } from './security';
import type { RunSnapshot } from './snapshot';
export class OperatorError extends Error { constructor(public status: number, public reason = 'REQUEST_FAILED') { super('운영자 작업을 확인하지 못했어요'); } }
export function operatorSessionKey(session: Session | null): string | null {
  if (!session) return null;
  try {
    const part = session.access_token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const data = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '='))) as { session_id?: unknown };
    return typeof data.session_id === 'string' && /^[a-f0-9-]{36}$/i.test(data.session_id) ? `${session.user.id}:${data.session_id}` : null;
  } catch { return null; }
}
function context() { const session = useAuth.getState().session;const key = operatorSessionKey(session);if (!session || !key) throw new OperatorError(401);return { session, key }; }
function denied(status: number, key: string): never {
  if ((status === 401 || status === 403) && operatorSessionKey(useAuth.getState().session) === key) useOperatorSecurity.getState().deny(key);
  throw new OperatorError(status);
}
function unchanged(key: string) { if (operatorSessionKey(useAuth.getState().session) !== key) throw new OperatorError(401); }
async function rpc<T>(name: string, args: Record<string, unknown> = {}, read = true, signal?: AbortSignal): Promise<T> {
  const { key } = context();let query = getSupabase().rpc(name, args, { get: read });if (signal) query = query.abortSignal(signal);
  const { data, error, status } = await query;unchanged(key);if (error) denied(status, key);return data as T;
}
async function pages<T>(name: string, args: Record<string, unknown> = {}): Promise<T[]> {
  const { key } = context();const rows: T[] = [];
  for (let from=0;;from+=PAGE_ROWS) {
    const { data, error, status } = await getSupabase().rpc(name,args,{get:true}).range(from,from+PAGE_ROWS-1);
    unchanged(key);if (error) denied(status,key);const page=data as T[] ?? [];rows.push(...page);if(page.length<PAGE_ROWS) return rows;
  }
}
export type OperatorAccess = { allowed: boolean; can_execute: boolean };
export const fetchOperatorAccess = () => rpc<OperatorAccess>('operator_cleanup_access');
export type CleanupCase = { result_id: string; kind: string; output: string; deleted_at: string; remaining: number; reason: string; latest_run_id: string | null };
export const fetchOperatorCases = () => pages<CleanupCase>('operator_cleanup_cases');
export type PreviewObject = { id: string; asset: string; location: string; status: string; auto_attempts: number; manual_attempts: number; code: string | null; last_failure_at: string | null };
export type CleanupPreview = { ok: true; preview_id: string; result_id: string; kind: string; output: string; deleted: boolean; links_confirmed: boolean; retention: string | null; eligible: boolean; reason: string; remaining: number; objects: PreviewObject[]; checked_at: string };
type Rejected = { ok: false; reason: string; error_id: string };
export async function previewManualCleanup(rid: string, signal?: AbortSignal): Promise<CleanupPreview> {
  const data = await rpc<CleanupPreview | Rejected>('preview_manual_result_cleanup', { rid }, false, signal);
  if (!data.ok) throw new OperatorError(409, data.reason);return data;
}
export async function requestManualCleanup(args: { rid: string; preview_id: string; request_id: string }): Promise<string> {
  const data = await rpc<{ ok: true; job_id: string } | Rejected>('request_manual_result_cleanup', args, false);
  if (!data.ok) throw new OperatorError(409, data.reason);return data.job_id;
}
/** Exactly one native GET; no SDK/React Query retry and no write RPC. */
export async function fetchOperatorRun(jobId: string, requestId: string, signal: AbortSignal, sessionKey: string): Promise<unknown> {
  const { session, key } = context();if (key !== sessionKey) throw new OperatorError(401);
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !anon) throw new OperatorError(503);
  const response = await fetch(`${base}/rest/v1/rpc/operator_cleanup_status?run_id=${encodeURIComponent(jobId)}&request_id=${encodeURIComponent(requestId)}`, {
    method: 'GET', headers: { apikey: anon, Authorization: `Bearer ${session.access_token}`, Accept: 'application/json' }, signal, cache: 'no-store', redirect: 'error',
  });
  unchanged(key);if (!response.ok) { void response.body?.cancel().catch(() => undefined);denied(response.status,key); }
  const body: unknown = await response.json();unchanged(key);return body;
}
export type AuditEvent = { id: string; actor_id: string; object_id: string | null; code: string; status_version: string | null; error_id: string | null; created_at: string };
export const fetchManualAudit = (rid: string) => pages<AuditEvent>('operator_cleanup_case_audit', { rid });
export type AutomaticEvent = { id: string; object_id: string | null; task: string; attempt_no: number; code: string | null; started_at: string; finished_at: string | null };
export const fetchAutomaticAudit = (rid: string) => pages<AutomaticEvent>('operator_cleanup_automatic_audit', { rid });
export async function reportSnapshotIssue(runId: string, errorId: string, s: RunSnapshot | null) {
  await rpc('report_cleanup_snapshot_issue', { run_id: runId, error_id: errorId, version: s?.status_version ?? '', checked_at: s?.checked_at ?? null }, false);
}
