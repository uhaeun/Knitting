import type { HttpRequest, UsernameConfig } from './changeUsername.ts';
type MediaConfig = UsernameConfig & { mediaSecret: string; publicUrl?: string };
type Ticket = { result: string; viewer: string; asset: 'file' | 'thumb'; epoch: string; expires: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type, range', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
const base64 = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const unbase64 = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
export function revocableMediaHandler(config: MediaConfig, request: HttpRequest = fetch, now: () => number = Date.now) {
  const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
  const signingKey = () => crypto.subtle.importKey('raw', new TextEncoder().encode(config.mediaSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!config.mediaSecret || config.mediaSecret.length < 32) return json({ error: '미디어 서버 설정을 확인해 주세요' }, 503);
    try {
      if (req.method === 'POST') {
        const authorization = req.headers.get('Authorization');
        if (!authorization?.startsWith('Bearer ')) return json({ error: '로그인이 필요해요' }, 401);
        const userRes = await request(`${config.url}/auth/v1/user`, { headers: { apikey: config.anonKey, Authorization: authorization }, signal: AbortSignal.timeout(8000) });
        if (!userRes.ok) return json({ error: '다시 로그인해 주세요' }, 401);
        const user = await userRes.json() as { id?: string };
        if (!user.id || !UUID.test(user.id)) return json({ error: '본인 확인에 실패했어요' }, 403);
        if (Number(req.headers.get('Content-Length') ?? 0) > 300000) return json({ error: '요청이 너무 커요' }, 413);
        const body = await req.json() as { keys?: unknown };
        if (!Array.isArray(body.keys) || body.keys.length > 500 || body.keys.some((k) => typeof k !== 'string' || k.length > 512)) return json({ error: '미디어 요청을 확인해 주세요' }, 400);
        const resolved = await request(`${config.url}/rest/v1/rpc/resolve_result_assets`, {
          method: 'POST', headers: { apikey: config.anonKey, Authorization: authorization, 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys: body.keys }), signal: AbortSignal.timeout(8000),
        });
        if (!resolved.ok) return json({ error: '미디어 권한을 확인하지 못했어요' }, 503);
        const rows = await resolved.json() as { result_id: string; path: string; asset: 'file' | 'thumb'; epoch: string }[];
        const key = await signingKey();
        const urls = await Promise.all(rows.map(async (row) => {
          const ticket: Ticket = { result: row.result_id, viewer: user.id!, asset: row.asset, epoch: String(row.epoch), expires: Math.floor(now() / 1000) + 3600 };
          const payload = base64(new TextEncoder().encode(JSON.stringify(ticket)));
          const signature = base64(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))));
          return { path: row.path, url: `${config.publicUrl ?? new URL(req.url).origin + '/functions/v1/revocable-media'}?ticket=${payload}.${signature}` };
        }));
        return json({ urls });
      }
      if (req.method !== 'GET') return json({ error: '허용되지 않은 요청이에요' }, 405);
      const token = new URL(req.url).searchParams.get('ticket') ?? '';
      if (token.length > 1024) return json({ error: '미디어 주소를 확인해 주세요' }, 403);
      const [payload, signature, extra] = token.split('.');
      if (!payload || !signature || extra || !await crypto.subtle.verify('HMAC', await signingKey(), unbase64(signature), new TextEncoder().encode(payload))) return json({ error: '유효하지 않은 미디어 주소예요' }, 403);
      const ticket = JSON.parse(new TextDecoder().decode(unbase64(payload))) as Ticket;
      if (!UUID.test(ticket.result) || !UUID.test(ticket.viewer) || !['file', 'thumb'].includes(ticket.asset) || !/^\d{1,19}$/.test(ticket.epoch) || !Number.isSafeInteger(ticket.expires) || ticket.expires <= Math.floor(now() / 1000) || ticket.expires > Math.floor(now() / 1000) + 3660) return json({ error: '만료되거나 유효하지 않은 주소예요' }, 403);
      const targetRes = await request(`${config.url}/rest/v1/rpc/result_media_target`, {
        method: 'POST', headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rid: ticket.result, viewer: ticket.viewer, epoch: ticket.epoch, asset: ticket.asset }), signal: AbortSignal.timeout(8000),
      });
      if (!targetRes.ok) return json({ error: '미디어 권한을 확인하지 못했어요' }, 503);
      const target = (await targetRes.json() as { path: string; output: string; owner_id: string; project_id: string }[])[0];
      if (!target || !UUID.test(target.owner_id) || !UUID.test(target.project_id)) return json({ error: '미디어를 열 수 없어요' }, 404);
      // Only canonical published result objects, never raw posts or arbitrary Storage paths.
      const canonical = new RegExp(`^${target.owner_id}/${target.project_id}/results/${ticket.result}${ticket.asset === 'thumb' ? '_t\\.jpg' : target.output === 'mp4' ? '\\.mp4' : '\\.jpg'}$`, 'i');
      if (!canonical.test(target.path)) return json({ error: '미디어 파일 확인이 필요해요' }, 404);
      const range = req.headers.get('Range');
      if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) return json({ error: '잘못된 범위 요청이에요' }, 416);
      const streamController = new AbortController();
      const headerTimeout = setTimeout(() => streamController.abort(), 8000);
      let data: Response;
      try { data = await request(`${config.url}/storage/v1/object/authenticated/photos/${target.path.split('/').map(encodeURIComponent).join('/')}`, {
        headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, ...(range ? { Range: range } : {}) }, cache: 'no-store', signal: streamController.signal,
      }); } finally { clearTimeout(headerTimeout); }
      if (!data.ok) return json({ error: '미디어를 열 수 없어요' }, data.status === 416 ? 416 : 404);
      const outputHeaders = new Headers(headers);
      outputHeaders.set('Content-Type', target.output === 'mp4' ? 'video/mp4' : 'image/jpeg');
      outputHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
      for (const field of ['Content-Range', 'Accept-Ranges', 'Content-Length']) { const value = data.headers.get(field); if (value) outputHeaders.set(field, value); }
      return new Response(data.body, { status: data.status, headers: outputHeaders });
    } catch {
      return json({ error: '미디어 주소나 연결을 다시 확인해 주세요' }, 503);
    }
  };
}
