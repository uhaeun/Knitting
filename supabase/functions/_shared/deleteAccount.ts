import type { UsernameConfig, HttpRequest } from './changeUsername.ts';
export function deleteAccountHandler(config: UsernameConfig, request: HttpRequest = fetch) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers });
  const serviceHeaders = { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, 'Content-Type': 'application/json' };
  const rpc = async (name: string, body: object) => {
    const res = await request(`${config.url}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: serviceHeaders, body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error('ACCOUNT_DELETION_FAILED');
    return res.status === 204 ? null : res.json();
  };
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return json({ error: '허용되지 않은 요청이에요' }, 405);
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: '로그인이 필요해요' }, 401);
    let target: string | undefined;
    let token: string | null = null;
    try {
      const res = await request(`${config.url}/auth/v1/user`, { headers: { apikey: config.anonKey, Authorization: authorization }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return json({ error: '다시 로그인해 주세요' }, 401);
      const user = await res.json() as { id?: string };
      target = user.id;
      if (!target || !/^[0-9a-f-]{36}$/i.test(target)) return json({ error: '계정을 확인하지 못했어요' }, 403);
      token = await rpc('begin_account_deletion', { target }) as string | null;
      if (token === null) return json({ completed: true });
      for (let batch = 0; batch < 100; batch++) {
        const objects = await rpc('account_deletion_objects', { target, token }) as { bucket_id: string; name: string }[];
        if (!Array.isArray(objects)) throw new Error('INVALID_OBJECT_SNAPSHOT');
        if (objects.length === 0) {
          await rpc('finish_account_deletion', { target, token });
          return json({ completed: true });
        }
        for (const bucket of ['photos', 'avatars']) {
          const paths = objects.filter((o) => o.bucket_id === bucket).map((o) => o.name);
          if (objects.some((o) => !['photos', 'avatars'].includes(o.bucket_id) || (!o.name.startsWith(`${target}/`) || !/^[a-zA-Z0-9_./-]+$/.test(o.name) || o.name.split('/').some((part) => part === '..' || part === '.' || part === '')))) throw new Error('INVALID_OBJECT_OWNER');
          if (paths.length === 0) continue;
          const removed = await request(`${config.url}/storage/v1/object/${bucket}`, {
            method: 'DELETE', headers: serviceHeaders, body: JSON.stringify({ prefixes: paths }), signal: AbortSignal.timeout(8000),
          });
          if (!removed.ok) throw new Error('STORAGE_DELETION_FAILED');
        }
        // Always re-read page zero after deleting; never skip shifted pages.
      }
      throw new Error('CONTINUATION_REQUIRED');
    } catch {
      if (target && token) await rpc('fail_account_deletion', { target, token }).catch(() => undefined);
      return json({ error: '삭제를 완료하지 못했어요. 일부 파일은 이미 정리됐을 수 있어요. 삭제 상태를 확인하고 다시 시도해 주세요.' }, 503);
    }
  };
}
