import type { HttpRequest, UsernameConfig } from './changeUsername.ts';
export type RevocationConfig = UsernameConfig & {
  workerSecret: string; publicStorageUrl: string; verification: 'origin' | 'cdn';
};
type Asset = {
  id: string; asset: 'file' | 'thumb'; source_path: string; target_path: string;
  source_hash: string | null; probe_url: string | null; probe_warmed_at: string | null; probe_cdn_hit: boolean;
  activated_at: string | null; removed_at: string | null; cdn_verified_at: string | null;
};
type Job = { id: string; token: string; result_id: string; owner_id: string; project_id: string; objects: Asset[] };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const denied = (status: number) => [400, 401, 403, 404, 410].includes(status);
const hash = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
const equalSecret = async (a: string, b: string) => {
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
  const left = new Uint8Array(x); const right = new Uint8Array(y);
  return left.reduce((diff, n, i) => diff | (n ^ right[i]!), 0) === 0;
};
class Failure extends Error { constructor(readonly code: string) { super(code); } }
/** No request-supplied paths, URLs, owner IDs or job IDs are accepted. */
export function linkRevocationHandler(config: RevocationConfig, request: HttpRequest = fetch, now: () => number = Date.now) {
  const serviceHeaders = { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, 'Content-Type': 'application/json' };
  const call = (url: string, init: RequestInit = {}) => request(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(8000) });
  const rpc = async <T>(name: string, body: object): Promise<T> => {
    const res = await call(`${config.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: serviceHeaders, body: JSON.stringify(body) });
    if (!res.ok) throw new Failure(name === 'link_job_snapshot' ? 'UNSAFE_PATH' : 'STORAGE_ERROR');
    return (res.status === 204 ? null : await res.json()) as T;
  };
  const objectURL = (path: string) => `${config.url}/storage/v1/object/authenticated/photos/${path.split('/').map(encodeURIComponent).join('/')}`;
  const bytesAt = async (path: string): Promise<ArrayBuffer | null> => {
    const res = await call(objectURL(path), { headers: serviceHeaders, cache: 'no-store' });
    if (denied(res.status)) { await res.body?.cancel(); return null; }
    if (!res.ok || Number(res.headers.get('Content-Length')) > 52428800) throw new Failure('STORAGE_ERROR');
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > 52428800) throw new Failure('STORAGE_ERROR');
    return bytes;
  };
  const validate = (job: Job, a: Asset) => {
    if (![job.id, job.token, job.result_id, job.owner_id, job.project_id, a.id].every((id) => UUID.test(id))) throw new Failure('UNSAFE_PATH');
    const prefix = `${job.owner_id}/${job.project_id}/results/${job.result_id}`;
    if (!['file', 'thumb'].includes(a.asset) || ![`${prefix}.jpg`, `${prefix}.mp4`, `${prefix}_t.jpg`].includes(a.source_path)
      || (a.asset === 'thumb' && a.source_path !== `${prefix}_t.jpg`)
      || a.target_path !== `${prefix}/revoked/${job.id}/${a.asset === 'thumb' ? 'thumb.jpg' : a.source_path.endsWith('.mp4') ? 'file.mp4' : 'file.jpg'}`) throw new Failure('UNSAFE_PATH');
  };
  const allowedProbe = (value: string, source: string) => {
    const base = new URL(config.publicStorageUrl);
    const u = new URL(value);
    const path = `/storage/v1/object/sign/photos/${source}`;
    if (u.origin !== base.origin || decodeURIComponent(u.pathname) !== path || u.username || u.password || u.hash || u.searchParams.size !== 1) throw new Failure('UNSAFE_PATH');
    const token = u.searchParams.get('token');
    if (!token) throw new Failure('CDN_UNVERIFIED');
    // A denied expired token proves expiration, not object/CDN retirement.
    try {
      const payload = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
      if (!payload.exp || payload.exp * 1000 <= now() + 60_000) throw new Error();
    } catch { throw new Failure('CDN_UNVERIFIED'); }
    return u.href;
  };
  const stage = (job: Job, a: Asset, name: string, extra: object = {}) => rpc('record_link_object', { jid: job.id, token: job.token, oid: a.id, stage: name, ...extra });
  const processAsset = async (job: Job, a: Asset) => {
    validate(job, a);
    if (a.cdn_verified_at) return;
    if (!a.source_hash || !a.probe_url) {
      const source = await bytesAt(a.source_path);
      if (!source) throw new Failure('SOURCE_MISSING');
      const digest = await hash(source);
      const signed = await call(`${config.url}/storage/v1/object/sign/photos/${a.source_path}`, {
        method: 'POST', headers: serviceHeaders, body: JSON.stringify({ expiresIn: 604800 }),
      });
      if (!signed.ok) throw new Failure('STORAGE_ERROR');
      const data = await signed.json() as { signedURL?: string };
      if (!data.signedURL?.startsWith('/object/sign/photos/')) throw new Failure('UNSAFE_PATH');
      const probe = allowedProbe(`${config.publicStorageUrl}/storage/v1${data.signedURL}`, a.source_path);
      // Warm the exact URL without a nonce, credentials or cache-bypass headers.
      // CDN mode requires an observed cache HIT; a generic HTTP server is not CDN proof.
      let hit = false;
      for (let warm = 0; warm < 2; warm++) {
        const res = await call(probe);
        if (res.status !== 200 || await hash(await res.arrayBuffer()) !== digest) throw new Failure('DIGEST_MISMATCH');
        hit ||= res.headers.get('cf-cache-status')?.toUpperCase() === 'HIT';
      }
      await stage(job, a, 'prepared', { digest, probe, cdn_hit: hit });
      a.probe_cdn_hit = hit;
      a.source_hash = digest; a.probe_url = probe;
    }
    const probe = allowedProbe(a.probe_url, a.source_path);
    if (!a.activated_at) {
      let target = await bytesAt(a.target_path);
      if (!target) {
        const source = await bytesAt(a.source_path);
        if (!source) throw new Failure('SOURCE_MISSING');
        if (await hash(source) !== a.source_hash) throw new Failure('DIGEST_MISMATCH');
        await rpc('link_job_snapshot', { jid: job.id, token: job.token });
        const copy = await call(`${config.url}/storage/v1/object/copy`, { method: 'POST', headers: serviceHeaders,
          body: JSON.stringify({ bucketId: 'photos', sourceKey: a.source_path, destinationKey: a.target_path }) });
        if (!copy.ok && copy.status !== 409 && copy.status !== 400) throw new Failure('STORAGE_ERROR');
        target = await bytesAt(a.target_path);
      }
      if (!target || await hash(target) !== a.source_hash) throw new Failure('DIGEST_MISMATCH');
      await stage(job, a, 'activated'); a.activated_at = new Date(now()).toISOString();
    }
    if (!a.removed_at) {
      // Recheck bytes even after an interrupted prior activation, before deleting the only old copy.
      const target = await bytesAt(a.target_path);
      if (!target || await hash(target) !== a.source_hash) throw new Failure('DIGEST_MISMATCH');
      await rpc('link_job_snapshot', { jid: job.id, token: job.token });
      const removed = await call(`${config.url}/storage/v1/object/photos`, { method: 'DELETE', headers: serviceHeaders, body: JSON.stringify({ prefixes: [a.source_path] }) });
      if (!removed.ok) throw new Failure('STORAGE_ERROR');
      if (await bytesAt(a.source_path)) throw new Failure('STORAGE_ERROR');
      await stage(job, a, 'removed'); a.removed_at = new Date(now()).toISOString();
    }
    const originResponse = await call(objectURL(a.source_path), { headers: serviceHeaders, cache: 'no-store' });
    const originStatus = originResponse.status;
    await originResponse.body?.cancel();
    if (!denied(originStatus)) throw new Failure('STORAGE_ERROR');
    await stage(job, a, 'origin_blocked', { http_status: originStatus });
    const full = await call(probe);
    const fullStatus = full.status;
    await full.body?.cancel();
    const partial = await call(probe, { headers: { Range: 'bytes=0-0' } });
    const partialStatus = partial.status;
    await partial.body?.cancel();
    if (!denied(fullStatus) || !denied(partialStatus)) throw new Failure(fullStatus >= 500 || partialStatus >= 500 ? 'NETWORK_ERROR' : 'CDN_ACCESSIBLE');
    if (config.verification !== 'cdn' || !a.probe_cdn_hit) throw new Failure('CDN_UNVERIFIED');
    const origin = new URL(config.publicStorageUrl);
    if (origin.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw new Failure('CDN_UNVERIFIED');
    if (now() - new Date(a.removed_at).getTime() < 65_000) throw new Failure('CDN_PENDING');
    await stage(job, a, 'cdn_verified', { http_status: fullStatus });
  };
  return async (req: Request): Promise<Response> => {
    const json = (value: object, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const auth = req.headers.get('Authorization') ?? '';
    if (!config.workerSecret || config.workerSecret.length < 32 || !await equalSecret(auth, `Bearer ${config.workerSecret}`)) return json({ error: 'Unauthorized' }, 401);
    let claim: { id: string; token: string } | null = null;
    let code = 'OK';
    try {
      const body = (await req.text()).trim();
      if (body && body !== '{}') return json({ error: 'Body must be empty' }, 400);
      claim = await rpc('claim_link_revocation', {});
      if (!claim) return json({ processed: false });
      const job = await rpc<Job>('link_job_snapshot', { jid: claim.id, token: claim.token });
      if (job.objects.length !== 2) throw new Failure('UNSAFE_PATH');
      for (const asset of job.objects) {
        try { await processAsset(job, asset); } catch (e) {
          code = e instanceof Failure ? e.code : 'NETWORK_ERROR';
          await stage(job, asset, 'failed', { error_code: code }).catch(() => undefined);
        }
      }
    } catch (e) { code = e instanceof Failure ? e.code : 'NETWORK_ERROR'; }
    if (!claim) return json({ error: 'Worker unavailable' }, 503);
    try { await rpc('finish_link_revocation', { jid: claim.id, token: claim.token, code }); }
    catch { return json({ error: 'Lease or persistence unavailable' }, 503); }
    return json({ processed: true, code });
  };
}
