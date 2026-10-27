import { webcrypto } from 'node:crypto';
import { resultCleanupHandler } from '../../../../supabase/functions/_shared/resultCleanup';
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const owner = '91111111-1111-4111-8111-111111111111';
const project = '93333333-3333-4333-8333-333333333333';
const rid = '94444444-4444-4444-8444-444444444444';
const id = '95555555-5555-4555-8555-555555555555';
const token = '96666666-6666-4666-8666-666666666666';
const secret = 'isolated-cleanup-secret-at-least-32-characters';
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function setup() {
  let present = true; let held = false; let lostResponse = false; let failedDelete = false; let customProbe: (() => Response) | null = null;
  const task = { id, token, owner_id: owner, project_id: project, result_id: rid, eligible: true, reason: 'READY', object: { id: '97777777-7777-4777-8777-777777777777', job_id: id, active_token: token, asset: 'file', location: 'original', path: `${owner}/${project}/results/${rid}.jpg`, metadata_present: true } };
  const outcomes: string[] = []; const deleted: string[][] = [];
  const fake = jest.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.endsWith('/claim_result_cleanup')) return response(task);
    if (url.endsWith('/cleanup_snapshot')) return response({ ...task, eligible: !held, reason: held ? 'RETENTION_HOLD' : 'READY', object: { ...task.object, metadata_present: present } });
    if (url.endsWith('/finish_result_cleanup')) { outcomes.push(body.outcome); return response(null); }
    if (init?.method === 'DELETE') {
      deleted.push(body.prefixes);
      if (failedDelete) return response({ error: 'unavailable' }, 503);
      present = false;if (lostResponse) throw new Error('response lost after deletion');return response({});
    }
    if (url.includes('/object/authenticated/photos/')) return customProbe ? customProbe() : present ? new Response('bytes') : response({ statusCode: '404', error: 'not_found' }, 400);
    throw new Error('Unexpected request');
  });
  const handler = resultCleanupHandler({ url: 'http://isolated.test', anonKey: 'anon', serviceKey: 'service', workerSecret: secret }, fake);
  const run = (body?: string, authorization = `Bearer ${secret}`) => handler(new Request('http://edge.test', { method: 'POST', headers: { Authorization: authorization }, body }));
  return { run, fake, task, deleted, outcomes, hold: () => { held = true; }, absent: () => { present = false; }, lost: () => { lostResponse = true; }, failDelete: () => { failedDelete = true; }, probe: (fn: () => Response) => { customProbe = fn; } };
}
it('deletes exactly one server-derived key and verifies absence', async () => {
  const t = setup(); expect((await t.run()).status).toBe(200);
  expect(t.deleted).toEqual([[t.task.object.path]]);expect(t.outcomes).toEqual(['ABSENT']);
});
it('confirms a lost DELETE response using actual absence, without deleting twice', async () => {
  const t = setup();t.lost();await t.run();expect(t.outcomes).toEqual(['ABSENT']);expect(t.deleted).toHaveLength(1);
});
it('probes a metadata-absent object without another deletion request', async () => {
  const t = setup();t.absent();await t.run();expect(t.deleted).toHaveLength(0);expect(t.outcomes).toEqual(['ABSENT']);
});
it('hold in the fresh snapshot prevents all Storage calls', async () => {
  const t = setup();t.hold();await t.run();expect(t.deleted).toHaveLength(0);expect(t.fake.mock.calls.some(([u]) => u.includes('/storage/'))).toBe(false);
});
it.each(['../../other-owner.jpg', `${owner}/${project}/results/another.jpg`, `${owner}/${project}/results/${rid}/revoked/../file.jpg`])('rejects unsafe key %s before any Storage call', async (path) => {
  const t = setup();t.task.object.path = path;await t.run();expect(t.fake.mock.calls.some(([u]) => u.includes('/storage/'))).toBe(false);
});
it.each([401, 403, 500, 503])('HTTP %s is never absence proof', async (status) => {
  const t = setup();t.probe(() => response({ statusCode: '404', error: 'not_found' }, status));await t.run();expect(t.outcomes).toEqual(['VERIFY_FAILED']);
});
it('HTML 404 is never absence proof', async () => {
  const t = setup();t.probe(() => new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/html' } }));await t.run();expect(t.outcomes).toEqual(['VERIFY_FAILED']);
});
it('a present object after failed Storage deletion stays failed', async () => {
  const t = setup();t.failDelete();await t.run();expect(t.outcomes).toEqual(['STORAGE_ERROR']);
});
it('unrecognized JSON route errors are not object absence proof', async () => {
  const t = setup();t.probe(() => response({ statusCode: '404', error: 'RouteNotFound' }, 404));await t.run();expect(t.outcomes).toEqual(['VERIFY_FAILED']);
});
it('rejects caller-selected jobs and unauthorized requests before touching persistence', async () => {
  const t = setup();expect((await t.run(undefined, 'Bearer no')).status).toBe(401);
  expect((await t.run('{"path":"x"}')).status).toBe(400);expect(t.fake).not.toHaveBeenCalled();
});
it.each([['file', 'jpg'], ['file', 'mp4'], ['thumb', 'jpg']])('cleans only the exact confirmed replacement key for %s.%s', async (asset, extension) => {
  const t = setup();t.task.object.location = 'rotated';t.task.object.asset = asset;
  t.task.object.path = `${owner}/${project}/results/${rid}/revoked/98888888-8888-4888-8888-888888888888/${asset}.${extension}`;
  await t.run();expect(t.deleted).toEqual([[t.task.object.path]]);expect(t.outcomes).toEqual(['ABSENT']);
});
