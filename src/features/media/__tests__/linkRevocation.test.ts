import { webcrypto } from 'node:crypto';
import { linkRevocationHandler, type RevocationConfig } from '../../../../supabase/functions/_shared/linkRevocation';
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const owner = '71111111-1111-4111-8111-111111111111';
const project = '73333333-3333-4333-8333-333333333333';
const result = '74444444-4444-4444-8444-444444444444';
const id = '75555555-5555-4555-8555-555555555555';
const token = '76666666-6666-4666-8666-666666666666';
const secret = 'test-worker-secret-32-characters-only';
function setup(mode: 'origin' | 'cdn' = 'cdn') {
  let clock = Date.now(); let available = true; let purge = false; let hit = true; let corrupt = false; let rangeExposed = false;
  const stages: { asset: string; stage: string }[] = []; const deletes: string[] = []; const finishes: string[] = [];
  const objects = ['file', 'thumb'].map((asset, i) => ({
    id: `78888888-8888-4888-8888-88888888888${i}`, asset,
    source_path: `${owner}/${project}/results/${result}${asset === 'thumb' ? '_t' : ''}.jpg`,
    target_path: `${owner}/${project}/results/${result}/revoked/${id}/${asset === 'thumb' ? 'thumb' : 'file'}.jpg`,
    source_hash: null as string | null, probe_url: null as string | null, probe_cdn_hit: false,
    probe_warmed_at: null as string | null, activated_at: null as string | null, removed_at: null as string | null, cdn_verified_at: null as string | null,
  }));
  const files = new Map(objects.map((a) => [a.source_path, 'original-' + a.asset]));
  const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const fake = jest.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const u = new URL(url); const body = init?.body ? JSON.parse(String(init.body)) as Record<string, string> : {};
    if (u.pathname.includes('/rpc/')) {
      const method = u.pathname.split('/').pop();
      if (method === 'claim_link_revocation') { if (!available) return response(null); available = false; return response({ id, token }); }
      if (method === 'link_job_snapshot') return response({ id, token, owner_id: owner, project_id: project, result_id: result, objects });
      if (method === 'record_link_object') {
        const a = objects.find((o) => o.id === body.oid)!;
        stages.push({ asset: a.asset, stage: body.stage! });
        if (body.stage === 'prepared') { a.source_hash = body.digest!; a.probe_url = body.probe!; a.probe_cdn_hit = Boolean(body.cdn_hit); }
        if (body.stage === 'activated') a.activated_at = new Date(clock).toISOString();
        if (body.stage === 'removed') a.removed_at = new Date(clock).toISOString();
        if (body.stage === 'cdn_verified') a.cdn_verified_at = new Date(clock).toISOString();
        return response(null);
      }
      if (method === 'finish_link_revocation') { finishes.push(body.code!); return response(null); }
    }
    if (u.pathname.includes('/object/authenticated/photos/')) {
      const key = decodeURIComponent(u.pathname.split('/object/authenticated/photos/')[1]!);
      return files.has(key) ? new Response(files.get(key), { status: 200 }) : response({ statusCode: '404' }, 400);
    }
    if (u.pathname.includes('/object/sign/photos/')) {
      const path = u.pathname.split('/object/sign/photos/')[1]!;
      if (init?.method === 'POST') {
        const jwt = `e30.${btoa(JSON.stringify({ exp: Math.floor(clock / 1000) + 604800 }))}.signature`;
        return response({ signedURL: `/object/sign/photos/${path}?token=${jwt}` });
      }
      if (purge && !(rangeExposed && new Headers(init?.headers).has('Range'))) return response({ statusCode: '404' }, 400);
      const asset = path.endsWith('_t.jpg') ? 'thumb' : 'file';
      return new Response('original-' + asset, { status: 200, headers: hit ? { 'cf-cache-status': 'HIT' } : {} });
    }
    if (u.pathname.endsWith('/object/copy')) {
      files.set(body.destinationKey!, corrupt ? 'corrupt' : files.get(body.sourceKey!)!); return response({});
    }
    if (init?.method === 'DELETE') {
      const paths = (body as unknown as { prefixes: string[] }).prefixes;
      for (const p of paths) { files.delete(p); deletes.push(p); }return response({});
    }
    throw new Error('Unexpected test request');
  });
  const config: RevocationConfig = { url: 'http://internal.test', publicStorageUrl: 'https://cdn.test', anonKey: 'anon', serviceKey: 'service', workerSecret: secret, verification: mode };
  const run = () => linkRevocationHandler(config, fake, () => clock)(new Request('https://edge.test', { method: 'POST', headers: { Authorization: `Bearer ${secret}` } }));
  return { run, fake, config, objects, files, stages, deletes, finishes,
    next: () => { available = true; }, advance: () => { clock += 66_000; }, purge: () => { purge = true; }, noHit: () => { hit = false; }, corrupt: () => { corrupt = true; }, rangeExposed: () => { rangeExposed = true; } };
}
it('copies and verifies both objects before retiring exact old paths; cached CDN remains a risk', async () => {
  const t = setup(); await t.run();
  expect(t.deletes).toEqual(t.objects.map((a) => a.source_path));
  expect(t.finishes).toEqual(['CDN_ACCESSIBLE']);
  expect(t.objects.every((a) => a.activated_at && a.removed_at)).toBe(true);
  expect(t.stages.filter((s) => s.stage === 'cdn_verified')).toHaveLength(0);
  expect(t.fake.mock.calls.filter(([, init]) => init?.method === 'DELETE').every(([, init]) => JSON.parse(String(init!.body)).prefixes.length === 1)).toBe(true);
});
it('verifies the exact warmed old URLs after CDN propagation without re-copying or re-deleting', async () => {
  const t = setup(); await t.run(); t.purge(); t.advance(); t.next(); await t.run();
  expect(t.finishes.at(-1)).toBe('OK');
  expect(t.stages.filter((s) => s.stage === 'cdn_verified')).toHaveLength(2);
  expect(t.deletes).toHaveLength(2);
});
it('never confirms before the 65 second propagation guard', async () => {
  const t = setup(); await t.run(); t.purge(); t.next(); await t.run();
  expect(t.finishes.at(-1)).toBe('CDN_PENDING');
});
it('origin-only cannot claim actual CDN verification', async () => {
  const t = setup('origin'); await t.run(); t.purge(); t.advance(); t.next(); await t.run();
  expect(t.finishes.at(-1)).toBe('CDN_UNVERIFIED');
  expect(t.objects.every((a) => !a.cdn_verified_at)).toBe(true);
});
it('a server without an observed cache HIT still retires origin but cannot confirm CDN', async () => {
  const t = setup(); t.noHit(); await t.run(); t.purge(); t.advance(); t.next(); await t.run();
  expect(t.deletes).toHaveLength(2);expect(t.finishes.at(-1)).toBe('CDN_UNVERIFIED');
});
it('a working old Range download prevents confirmation even if full GET is denied', async () => {
  const t = setup(); await t.run(); t.purge(); t.advance(); t.rangeExposed(); t.next(); await t.run();
  expect(t.finishes.at(-1)).toBe('CDN_ACCESSIBLE');
});
it('copy corruption preserves both original objects and never activates damaged targets', async () => {
  const t = setup();t.corrupt();await t.run();
  expect(t.finishes.at(-1)).toBe('DIGEST_MISMATCH');expect(t.deletes).toHaveLength(0);
  expect(t.objects.every((a) => t.files.has(a.source_path) && !a.activated_at)).toBe(true);
});
it('unsafe source paths fail before any Storage mutation', async () => {
  const t = setup();t.objects.forEach((o) => { o.source_path = '../../another-owner/original.jpg'; });await t.run();
  expect(t.finishes.at(-1)).toBe('UNSAFE_PATH');expect(t.fake.mock.calls.some(([url]) => url.includes('/storage/'))).toBe(false);
});
it('a missing sole source is preserved as an explicit failure rather than fabricated success', async () => {
  const t = setup();t.objects.forEach((o) => t.files.delete(o.source_path));await t.run();
  expect(t.finishes.at(-1)).toBe('SOURCE_MISSING');expect(t.deletes).toHaveLength(0);
});
it('expired probe denial is not accepted as revocation proof', async () => {
  const t = setup();await t.run();t.objects.forEach((a) => { a.probe_url = a.probe_url!.replace(/token=.*/, `token=e30.${btoa(JSON.stringify({ exp: 1 }))}.sig`); });t.next();t.purge();await t.run();
  expect(t.finishes.at(-1)).toBe('CDN_UNVERIFIED');
});
it('workers reject unauthorized calls and caller-selected job/path payloads', async () => {
  const t = setup();const handler = linkRevocationHandler(t.config, t.fake);
  expect((await handler(new Request('https://edge.test', { method: 'POST' }))).status).toBe(401);
  expect((await handler(new Request('https://edge.test', { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, body: '{"path":"x"}' }))).status).toBe(400);
  expect(t.fake).not.toHaveBeenCalled();
});
