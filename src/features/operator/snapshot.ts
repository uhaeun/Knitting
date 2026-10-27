export const MAX_VERSION = 9223372036854775807n;
export type ObjectStatus = 'pending' | 'processing' | 'confirmed' | 'failed' | 'blocked';
export type RunStatus = 'queued' | 'processing' | 'succeeded' | 'partial' | 'failed' | 'blocked';
export type RunObject = { id: string; asset: 'file' | 'thumb'; location: 'original' | 'rotated'; target: boolean; status: ObjectStatus; auto_attempts: number; manual_attempts: number; code: string | null; verified_at: string | null };
export type RunSnapshot = { job_id: string; result_id: string; status_version: string; checked_at: string; request_id: string; integrity_code: string | null; status: RunStatus; reason: string; cleanup_status: string; title_status: string; can_retry: boolean; objects: RunObject[] };
export class SnapshotError extends Error { constructor() { super('상태 스냅샷을 확인할 수 없어요'); } }
export const isProcessing = (s: RunSnapshot) => s.status === 'queued' || s.status === 'processing';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const utc = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(v)) return false;
  const milliseconds = v.slice(0, 23) + 'Z';const parsed = Date.parse(milliseconds);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === milliseconds;
};
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every((k) => allowed.includes(k)) && allowed.every((k) => k in v);
const code = (v: unknown): v is string => typeof v === 'string' && /^[A-Z][A-Z0-9_]{0,60}$/.test(v);
const integer = (v: unknown, max: number) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;
export function parseSnapshot(input: unknown, job: string, request: string): RunSnapshot {
  const fail = (): never => { throw new SnapshotError(); };
  if (!record(input) || !keys(input, ['job_id','result_id','status_version','checked_at','request_id','integrity_code','status','reason','cleanup_status','title_status','can_retry','objects'])) return fail();
  if (input.job_id !== job || input.request_id !== request || typeof input.result_id !== 'string' || !UUID.test(input.result_id) || typeof input.status_version !== 'string' || !/^[1-9][0-9]{0,18}$/.test(input.status_version) || BigInt(input.status_version) > MAX_VERSION || !utc(input.checked_at)) return fail();
  if (!['queued','processing','succeeded','partial','failed','blocked'].includes(String(input.status)) || !code(input.reason) || !['blocked','pending','processing','partial','failed_exhausted','confirmed'].includes(String(input.cleanup_status)) || !['pending','failed','failed_exhausted','confirmed'].includes(String(input.title_status)) || typeof input.can_retry !== 'boolean' || !(input.integrity_code === null || input.integrity_code === 'VERSION_LIMIT')) return fail();
  if (!Array.isArray(input.objects) || input.objects.length < 2 || input.objects.length > 4) return fail();
  const objects = input.objects.map((o: unknown): RunObject => {
    if (!record(o) || !keys(o, ['id','asset','location','target','status','auto_attempts','manual_attempts','code','verified_at']) || typeof o.id !== 'string' || !UUID.test(o.id) || !['file','thumb'].includes(String(o.asset)) || !['original','rotated'].includes(String(o.location)) || typeof o.target !== 'boolean' || !['pending','processing','confirmed','failed','blocked'].includes(String(o.status)) || !integer(o.auto_attempts, 6) || !integer(o.manual_attempts, 2147483647) || !(o.code === null || code(o.code)) || !(o.verified_at === null || utc(o.verified_at))) return fail();
    if (o.status === 'confirmed' && !utc(o.verified_at) || !o.target && o.status !== 'confirmed') return fail();
    return o as RunObject;
  });
  if (new Set(objects.map((o) => o.id)).size !== objects.length) return fail();
  const targets = objects.filter((o) => o.target);
  if (!targets.length) return fail();
  const working = targets.some((o) => ['pending','processing'].includes(o.status));
  const success = targets.filter((o) => o.status === 'confirmed').length;
  if (['succeeded','partial','failed','blocked'].includes(String(input.status)) && working) return fail();
  if (input.status === 'queued' && targets.some((o) => o.status !== 'pending') || input.status === 'processing' && !working || input.status === 'succeeded' && success !== targets.length || input.status === 'partial' && !(success > 0 && success < targets.length) || ['failed','blocked'].includes(String(input.status)) && success > 0 || input.status === 'blocked' && targets.some((o) => o.status !== 'blocked')) return fail();
  const whole = objects.every((o) => o.status === 'confirmed') && input.title_status === 'confirmed';
  if ((input.cleanup_status === 'confirmed') !== whole || input.can_retry && (!['partial','failed'].includes(String(input.status)) || targets.every((o) => o.status === 'confirmed'))) return fail();
  return { ...input, objects } as RunSnapshot;
}
export function stateFingerprint(s: RunSnapshot): string {
  return JSON.stringify([s.result_id,s.status,s.reason,s.cleanup_status,s.title_status,s.can_retry,s.integrity_code,
    [...s.objects].sort((a,b) => a.id.localeCompare(b.id)).map((o) => [o.id,o.asset,o.location,o.target,o.status,o.auto_attempts,o.manual_attempts,o.code,o.verified_at])]);
}
