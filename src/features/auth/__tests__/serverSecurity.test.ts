/** @jest-environment node */
import { changeUsernameHandler } from '../../../../supabase/functions/_shared/changeUsername';
import { deleteAccountHandler } from '../../../../supabase/functions/_shared/deleteAccount';

const config = { url: 'http://127.0.0.1:54321', anonKey: 'public-test', serviceKey: 'server-test' };
const uid = '11111111-1111-1111-1111-111111111111';
const response = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const req = (body: object = {}, token: string | null = 'user-test') => new Request('http://localhost/functions/test', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
});
const mockFetch = (...responses: Response[]) => {
  const mock = jest.fn<Promise<Response>, [input: string, init?: RequestInit]>();
  for (const r of responses) mock.mockResolvedValueOnce(r);
  return mock;
};
describe('server-only username capability', () => {
  it('rejects missing bearer token without issuing any privileged request', async () => {
    const fetcher = mockFetch();
    expect((await changeUsernameHandler(config, fetcher)(req({ username: 'new_a', password: 'pw' }, null))).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects invalid username and empty current password before Auth', async () => {
    const fetcher = mockFetch();
    const handler = changeUsernameHandler(config, fetcher);
    expect((await handler(req({ username: 'ab', password: 'pw' }))).status).toBe(400);
    expect((await handler(req({ username: 'new_a', password: '' }))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects expired sessions, not just a well-formed bearer string', async () => {
    const fetcher = mockFetch(response({}, 401));
    expect((await changeUsernameHandler(config, fetcher)(req({ username: 'new_a', password: 'pw' }))).status).toBe(401);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('never invokes the database capability for a wrong current password', async () => {
    const fetcher = mockFetch(response({ id: uid, email: 'a@example.com' }), response({ error: 'wrong' }, 400));
    expect((await changeUsernameHandler(config, fetcher)(req({ username: 'new_a', password: 'wrong' }))).status).toBe(403);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('preserves Auth rate-limit rejection without a privileged database call', async () => {
    const fetcher = mockFetch(response({ id: uid, email: 'a@example.com' }), response({}, 429));
    expect((await changeUsernameHandler(config, fetcher)(req({ username: 'new_a', password: 'wrong' }))).status).toBe(429);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not accept a password verification for another identity', async () => {
    const fetcher = mockFetch(response({ id: uid, email: 'a@example.com' }), response({ user: { id: 'another' }, access_token: 'verification-test' }));
    expect((await changeUsernameHandler(config, fetcher)(req({ username: 'new_a', password: 'pw' }))).status).toBe(403);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('ignores a client target, binds the caller identity and revokes only the verification session', async () => {
    const fetcher = mockFetch(response({ id: uid, email: 'a@example.com' }), response({ user: { id: uid }, access_token: 'verification-test' }), response({ id: uid, username: 'new_a' }), response(null, 204));
    const result = await changeUsernameHandler(config, fetcher)(req({ target: 'victim', username: 'NEW_A', password: 'private-test' }));
    expect(result.status).toBe(200);
    expect(JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body))).toEqual({ target: uid, next_username: 'new_a' });
    expect(fetcher.mock.calls[3]?.[0]).toContain('scope=local');
    expect(fetcher.mock.calls[3]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer verification-test' });
    expect(JSON.stringify(await result.json())).not.toContain('private-test');
  });
  it('maps database errors without exposing raw tokens or SQL details', async () => {
    const fetcher = mockFetch(response({ id: uid, email: 'a@example.com' }), response({ user: { id: uid }, access_token: 'verification-test' }), response({ code: 'P0001', message: 'server-secret-test' }, 400), response(null, 204));
    const result = await changeUsernameHandler(config, fetcher)(req({ username: 'new_a', password: 'pw' }));
    expect(result.status).toBe(409);
    expect(JSON.stringify(await result.json())).not.toContain('server-secret-test');
  });
});
describe('account deletion with partial-failure recovery', () => {
  it('never uses the service role for an unauthenticated caller', async () => {
    const fetcher = mockFetch();
    expect((await deleteAccountHandler(config, fetcher)(req({}, null))).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('requires re-reading actual remaining files before final database deletion', async () => {
    const fetcher = mockFetch(response({ id: uid }), response('lease-test'), response([{ bucket_id: 'photos', name: `${uid}/project/result.jpg` }, { bucket_id: 'avatars', name: `${uid}/avatar.jpg` }]), response([]), response([]), response([]), response(null, 204));
    const res = await deleteAccountHandler(config, fetcher)(req({ target: 'victim' }));
    expect(await res.json()).toEqual({ completed: true });
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({ target: uid });
    expect(fetcher.mock.calls[5]?.[0]).toContain('account_deletion_objects');
    expect(fetcher.mock.calls[6]?.[0]).toContain('finish_account_deletion');
  });
  it('retains the job and does not delete Auth after Storage failure', async () => {
    const fetcher = mockFetch(response({ id: uid }), response('lease-test'), response([{ bucket_id: 'photos', name: `${uid}/project/result.jpg` }]), response({}, 503), response(null, 204));
    const result = await deleteAccountHandler(config, fetcher)(req());
    expect(result.status).toBe(503);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('finish_account_deletion'))).toBe(false);
    expect(fetcher.mock.calls[4]?.[0]).toContain('fail_account_deletion');
  });
  it.each([`other-owner/secret.jpg`, `${uid}/../other-owner/secret.jpg`, `${uid}/%2e%2e/secret.jpg`])('rejects an unexpected object owner/path: %s', async (name) => {
    const fetcher = mockFetch(response({ id: uid }), response('lease-test'), response([{ bucket_id: 'photos', name }]), response(null, 204));
    expect((await deleteAccountHandler(config, fetcher)(req())).status).toBe(503);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/storage/'))).toBe(false);
  });
});
