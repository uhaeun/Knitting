/** No SDK session persistence and no token/password logging. Kept injectable for security tests. */
export type HttpRequest = (input: string, init?: RequestInit) => Promise<Response>;
export type UsernameConfig = { url: string; anonKey: string; serviceKey: string };
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
export function changeUsernameHandler(config: UsernameConfig, request: HttpRequest = fetch) {
  const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers });
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return json({ error: '허용되지 않은 요청이에요' }, 405);
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: '로그인이 필요해요' }, 401);
    try {
      const body: unknown = await req.json();
      if (!body || typeof body !== 'object') return json({ error: '입력을 확인해 주세요' }, 400);
      const input = body as Record<string, unknown>;
      const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
      const password = typeof input.password === 'string' ? input.password : '';
      if (!/^[a-z0-9_]{3,20}$/.test(username) || !password || password.length > 1024) {
        return json({ error: '아이디와 현재 비밀번호를 확인해 주세요' }, 400);
      }
      // The target identity and email always come from Auth, never the request body.
      const userResponse = await request(`${config.url}/auth/v1/user`, {
        headers: { apikey: config.anonKey, Authorization: authorization }, signal: AbortSignal.timeout(8000),
      });
      if (!userResponse.ok) return json({ error: '다시 로그인해 주세요' }, 401);
      const user = await userResponse.json() as { id?: string; email?: string };
      if (!user.id || !user.email) return json({ error: '비밀번호를 확인할 수 없는 계정이에요' }, 403);
      const verifiedResponse = await request(`${config.url}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, password }), signal: AbortSignal.timeout(8000),
      });
      if (!verifiedResponse.ok) return json({ error: '현재 비밀번호를 확인해 주세요' }, verifiedResponse.status === 429 ? 429 : 403);
      const verified = await verifiedResponse.json() as { user?: { id?: string }; access_token?: string };
      if (verified.user?.id !== user.id || !verified.access_token) return json({ error: '본인 확인에 실패했어요' }, 403);
      try {
        const response = await request(`${config.url}/rest/v1/rpc/change_username_verified`, {
          method: 'POST', headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: user.id, next_username: username }), signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          const error = await response.json() as { code?: string };
          const message = error.code === '23505' ? '사용할 수 없는 아이디예요'
            : error.code === 'P0001' ? '마지막 아이디 변경 후 30일이 지나야 해요' : '아이디를 바꾸지 못했어요';
          return json({ error: message }, 409);
        }
        const payload = await response.json() as { id?: string; username?: string } | { id?: string; username?: string }[];
        const profile = Array.isArray(payload) ? payload[0] : payload;
        if (profile?.id !== user.id || profile.username !== username) return json({ error: '변경 결과를 다시 확인해 주세요' }, 503);
        return json({ profile });
      } finally {
        // Discard only the verification session, not the original user's session.
        await request(`${config.url}/auth/v1/logout?scope=local`, {
          method: 'POST', headers: { apikey: config.anonKey, Authorization: `Bearer ${verified.access_token}` },
          signal: AbortSignal.timeout(8000),
        }).catch(() => undefined);
      }
    } catch {
      return json({ error: '요청을 완료하지 못했어요. 프로필을 다시 확인해 주세요.' }, 503);
    }
  };
}
