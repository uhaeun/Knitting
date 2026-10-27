/** @jest-environment node */
/// <reference types="node" />
import { webcrypto } from 'node:crypto';
import { revocableMediaHandler } from '../../../../supabase/functions/_shared/revocableMedia';
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const owner = '11111111-1111-4111-8111-111111111111';
const project = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const path = `${owner}/${project}/results/${id}.jpg`;
const config = { url: 'http://127.0.0.1:54321', publicUrl: 'http://127.0.0.1:54321/functions/v1/revocable-media', anonKey: 'test-public', serviceKey: 'test-server', mediaSecret: 'test-only-32-character-signing-secret' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const requester = (...responses: Response[]) => { const mock = jest.fn<Promise<Response>, [string, RequestInit?]>(); for (const r of responses) mock.mockResolvedValueOnce(r); return mock; };
async function ticket() {
  const calls = requester(json({ id: owner }), json([{ result_id: id, path, asset: 'file', epoch: '1' }]));
  const response = await revocableMediaHandler(config, calls, () => 0)(new Request(config.publicUrl, { method: 'POST', headers: { Authorization: 'Bearer user-test', 'Content-Type': 'application/json' }, body: JSON.stringify({ keys: [path] }) }));
  const body = await response.json() as { urls: { url: string }[] };
  return body.urls[0]!.url;
}
it('does not mint tickets for an anonymous caller', async () => {
  const calls = requester();
  const res = await revocableMediaHandler(config, calls)(new Request(config.publicUrl, { method: 'POST' }));
  expect(res.status).toBe(401);expect(calls).not.toHaveBeenCalled();
});
it('does not embed Storage paths or service keys in the resulting URL', async () => {
  const url = await ticket();expect(url).not.toContain('/results/');expect(url).not.toContain(config.serviceKey);
});
it('rejects a forged signature without querying privileged state', async () => {
  const url = await ticket();const calls = requester();
  expect((await revocableMediaHandler(config, calls, () => 0)(new Request(url + 'tampered'))).status).toBe(403);
  expect(calls).not.toHaveBeenCalled();
});
it('rejects an expired ticket before querying the database', async () => {
  const url = await ticket();const calls = requester();
  expect((await revocableMediaHandler(config, calls, () => 3600000)(new Request(url))).status).toBe(403);
  expect(calls).not.toHaveBeenCalled();
});
it('does not download after a privacy, deletion, follow, block or epoch check rejects the ticket', async () => {
  const url = await ticket();const calls = requester(json([]));
  expect((await revocableMediaHandler(config, calls, () => 0)(new Request(url))).status).toBe(404);
  expect(calls).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(calls.mock.calls[0]?.[1]?.body))).toMatchObject({ rid: id, viewer: owner, epoch: '1' });
});
it('never fetches a malformed historical reference to another owners original media', async () => {
  const url = await ticket();const calls = requester(json([{ path, output: 'jpeg', owner_id: project, project_id: project }]));
  expect((await revocableMediaHandler(config, calls, () => 0)(new Request(url))).status).toBe(404);
  expect(calls).toHaveBeenCalledTimes(1);
});
it('streams approved media without cacheable credentials or public caching', async () => {
  const url = await ticket();const calls = requester(json([{ path, output: 'jpeg', owner_id: owner, project_id: project }]), new Response('jpeg-bytes'));
  const res = await revocableMediaHandler(config, calls, () => 0)(new Request(url));
  expect(res.status).toBe(200);expect(await res.text()).toBe('jpeg-bytes');expect(res.headers.get('Cache-Control')).toContain('no-store');
  expect(res.headers.get('Content-Type')).toBe('image/jpeg');
});
it('passes a single Range request through and preserves the partial response', async () => {
  const url = await ticket();const calls = requester(json([{ path, output: 'jpeg', owner_id: owner, project_id: project }]), new Response('bytes', { status: 206, headers: { 'Content-Range': 'bytes 0-4/10' } }));
  const res = await revocableMediaHandler(config, calls, () => 0)(new Request(url, { headers: { Range: 'bytes=0-4' } }));
  expect(res.status).toBe(206);expect(res.headers.get('Content-Range')).toBe('bytes 0-4/10');expect(calls.mock.calls[1]?.[1]?.headers).toMatchObject({ Range: 'bytes=0-4' });
});
