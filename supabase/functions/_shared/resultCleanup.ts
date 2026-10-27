import type { HttpRequest, UsernameConfig } from './changeUsername.ts';
export type CleanupConfig = UsernameConfig & { workerSecret: string };
type ObjectTask = { id: string; job_id: string; asset: 'file' | 'thumb'; location: 'original' | 'rotated'; path: string; active_token: string; metadata_present: boolean };
type Snapshot = { id: string; token: string; result_id: string; owner_id: string; project_id: string; eligible: boolean; reason: string; object: ObjectTask | null; processed_titles?: boolean };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sameSecret = async (a: string, b: string) => {
  const [x, y] = await Promise.all([a, b].map((v) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))));
  const right = new Uint8Array(y);
  return new Uint8Array(x).reduce((n, v, i) => n | (v ^ right[i]!), 0) === 0;
};
/** One leased object per invocation. Caller cannot choose a path, owner or job. */
export function resultCleanupHandler(config: CleanupConfig, request: HttpRequest = fetch) {
  const serviceHeaders = { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, 'Content-Type': 'application/json' };
  const call = (url: string, init: RequestInit = {}) => request(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(8000) });
  const rpc = async <T>(name: string, body: object): Promise<T> => {
    const response = await call(`${config.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: serviceHeaders, body: JSON.stringify(body) });
    if (!response.ok) throw new Error('RPC_FAILED');
    return (response.status === 204 ? null : await response.json()) as T;
  };
  const valid = (s: Snapshot) => {
    const o = s.object;
    if (!o || ![s.id, s.token, s.result_id, s.owner_id, s.project_id, o.id].every((id) => UUID.test(id)) || o.job_id !== s.id || o.active_token !== s.token) return false;
    const root = `${s.owner_id}/${s.project_id}/results/${s.result_id}`;
    if (o.location === 'original') return o.asset === 'thumb' ? o.path === `${root}_t.jpg` : o.asset === 'file' && [`${root}.jpg`, `${root}.mp4`].includes(o.path);
    return o.location === 'rotated' && ['file', 'thumb'].includes(o.asset) && new RegExp(`^${root}/revoked/[a-f0-9-]{36}/${o.asset === 'thumb' ? 'thumb\\.jpg' : 'file\\.(jpg|mp4)'}$`, 'i').test(o.path);
  };
  const probe = async (path: string): Promise<'ABSENT' | 'PRESENT' | 'VERIFY_FAILED'> => {
    const response = await call(`${config.url}/storage/v1/object/authenticated/photos/${path.split('/').map(encodeURIComponent).join('/')}`, { headers: serviceHeaders, cache: 'no-store' });
    if (response.ok) { await response.body?.cancel(); return 'PRESENT'; }
    // 401/403, route errors, HTML and 5xx prove nothing about file absence.
    if (![400, 404].includes(response.status) || !response.headers.get('Content-Type')?.includes('application/json')) { await response.body?.cancel(); return 'VERIFY_FAILED'; }
    const error = await response.json() as { statusCode?: string | number; error?: string };
    return String(error.statusCode) === '404' && ['not_found', 'NoSuchKey', 'Not Found'].includes(error.error ?? '') ? 'ABSENT' : 'VERIFY_FAILED';
  };
  return async (req: Request): Promise<Response> => {
    const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    if (!config.workerSecret || config.workerSecret.length < 32 || !await sameSecret(req.headers.get('Authorization') ?? '', `Bearer ${config.workerSecret}`)) return json({ error: 'Unauthorized' }, 401);
    let task: Snapshot | null = null;
    let outcome = 'VERIFY_FAILED';
    try {
      const body = (await req.text()).trim();
      if (body && body !== '{}') return json({ error: 'Body must be empty' }, 400);
      task = await rpc<Snapshot | null>('claim_result_cleanup', {});
      if (!task) return json({ processed: false });
      if (task.processed_titles) return json({ processed_titles: true });
      if (!task.eligible || !valid(task)) outcome = 'VERIFY_FAILED';
      else {
        const fresh = await rpc<Snapshot>('cleanup_snapshot', { jid: task.id, token: task.token });
        if (!fresh.eligible || !valid(fresh) || fresh.object?.id !== task.object?.id || fresh.object?.path !== task.object?.path) outcome = 'VERIFY_FAILED';
        else {
          if (fresh.object!.metadata_present) {
            // Storage's SQL fence rechecks the retention version inside the
            // actual deletion transaction, after this HTTP race window.
            try {
              const removed = await call(`${config.url}/storage/v1/object/photos`, { method: 'DELETE', headers: serviceHeaders, body: JSON.stringify({ prefixes: [fresh.object!.path] }) });
              outcome = removed.ok ? 'OBJECT_PRESENT' : 'STORAGE_ERROR';
              await removed.body?.cancel();
            } catch { outcome = 'NETWORK_ERROR'; }
          }
          // Also verify after a lost DELETE response; never delete an already
          // confirmed object again. The final RPC independently checks metadata.
          const proof = await probe(fresh.object!.path);
          if (proof === 'ABSENT') outcome = 'ABSENT';
          else if (proof === 'PRESENT' && outcome !== 'STORAGE_ERROR' && outcome !== 'NETWORK_ERROR') outcome = 'OBJECT_PRESENT';
          else if (proof === 'VERIFY_FAILED') outcome = 'VERIFY_FAILED';
        }
      }
    } catch { outcome = 'NETWORK_ERROR'; }
    if (!task?.id || !task.token) return json({ error: 'Worker unavailable' }, 503);
    try { await rpc('finish_result_cleanup', { jid: task.id, token: task.token, outcome }); }
    catch { return json({ error: 'Lease or persistence unavailable' }, 503); }
    return json({ processed: true, outcome });
  };
}
