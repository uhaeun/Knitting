// No remote URL/DB overrides: synthetic users/files in the disposable local stack only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { signUp } from './signup.mjs';
const API = 'http://127.0.0.1:54321';
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BASE = 'http://localhost:8098';
const anon = process.env.SB_ANON_KEY?.replace(/^"|"$/g, '');
const service = process.env.SB_SERVICE_ROLE_KEY?.replace(/^"|"$/g, '');
const secret = readFileSync('/tmp/p0-functions.env', 'utf8').split('\n').find((l) => l.startsWith('REVOCATION_WORKER_SECRET='))?.split('=')[1];
assert.ok(anon && service && secret && /^[a-f0-9]{64}$/.test(secret));
const sql = (query: string) => execFileSync('psql', [DB, '-X', '-v', 'ON_ERROR_STOP=1', '-tAc', query], { encoding: 'utf8' }).trim();
const sb = createClient(API, service, { auth: { persistSession: false, autoRefreshToken: false } });
const stamp = Date.now().toString(36); const username = `link_${stamp}`;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(() => localStorage.setItem('knitting.tourSeen', '1'));
const page = await context.newPage();
try {
  await signUp(page, { base: BASE, email: `${username}@example.com`, username, displayName: '링크 QA', password: 'password123' });
  const session = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
    return JSON.parse(localStorage.getItem(key!)!) as { access_token: string; refresh_token: string };
  });
  const ownerClient = createClient(API, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.equal((await ownerClient.auth.setSession(session)).error, null);
  const owner = sql(`select id from profiles where username='${username}'`);
  const pid = randomUUID(); const rid = randomUUID(); const post = randomUUID();
  assert.equal((await sb.from('projects').insert({ id: pid, owner_id: owner, name: '과거 링크 테스트', default_visibility: 'public' })).error, null);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=32x32:d=1', '-frames:v', '1', '/tmp/legacy-link.jpg']);
  const bytes = readFileSync('/tmp/legacy-link.jpg');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const paths = [`${owner}/${pid}/results/${rid}.jpg`, `${owner}/${pid}/results/${rid}_t.jpg`];
  const raw = `${owner}/${pid}/${post}.jpg`;
  for (const path of [...paths, raw]) assert.equal((await sb.storage.from('photos').upload(path, bytes, { contentType: 'image/jpeg' })).error, null);
  assert.equal((await sb.from('posts').insert({ id: post, project_id: pid, owner_id: owner, photo_path: raw, thumb_path: raw, width: 32, height: 32, taken_at: new Date().toISOString() })).error, null);
  assert.equal((await sb.from('results').insert({ id: rid, project_id: pid, owner_id: owner, kind: 'single', ratio: '1:1', output: 'jpeg', file_path: paths[0], thumb_path: paths[1], legacy_links_unverified: true })).error, null);
  const signed = await sb.storage.from('photos').createSignedUrls(paths, 3600);
  assert.equal(signed.error, null);
  const oldURLs = signed.data!.map((x) => x.signedUrl);
  for (const url of oldURLs) assert.equal((await fetch(url)).status, 200);
  assert.equal((await ownerClient.rpc('set_project_visibility', { pid, v: 'private' })).error, null);
  const jid = sql(`select id from result_link_jobs where result_id='${rid}'`);
  assert.ok(jid);
  const work = async () => {
    const response = await fetch(`${API}/functions/v1/revoke-legacy-links`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` } });
    assert.equal(response.status, 200);
    return await response.json() as { code: string };
  };
  assert.equal((await work()).code, 'CDN_UNVERIFIED');
  for (const url of oldURLs) {
    assert.ok([400, 401, 403, 404, 410].includes((await fetch(url)).status));
    assert.ok([400, 401, 403, 404, 410].includes((await fetch(url, { headers: { Range: 'bytes=0-9' } })).status));
  }
  assert.equal(sql(`select count(*) from result_link_objects where job_id='${jid}' and removed_at is not null and origin_blocked_at is not null`), '2');
  assert.equal(sql(`select count(*) from result_link_objects where job_id='${jid}' and cdn_verified_at is not null`), '0');
  assert.equal(sql(`select status from result_link_jobs where id='${jid}'`), 'unverified');
  const tickets = await ownerClient.functions.invoke('revocable-media', { body: { keys: paths } });
  assert.equal(tickets.error, null);
  for (const { url } of (tickets.data as { urls: { url: string }[] }).urls) {
    const result = await fetch(url);assert.equal(result.status, 200);
    assert.equal(createHash('sha256').update(Buffer.from(await result.arrayBuffer())).digest('hex'), digest);
    assert.equal((await fetch(url, { headers: { Range: 'bytes=0-9' } })).status, 206);
  }
  assert.ok((await ownerClient.storage.from('photos').upload(paths[0]!, bytes, { contentType: 'image/jpeg' })).error);
  assert.equal((await sb.storage.from('photos').download(raw)).error, null);
  assert.equal(sql(`select count(*) from posts where id='${post}' and deleted_at is null`), '1');
  console.log('PASS actual Storage old full/Range URLs blocked; copied bytes and source posts preserved');

  await page.goto(`${BASE}/results/links`);
  await page.getByText('과거 링크 테스트', { exact: true }).waitFor();
  await page.getByText('접근 차단 검증 미완료', { exact: true }).waitFor();
  await page.getByRole('button', { name: '링크 차단 다시 시도', exact: true }).click();
  await page.getByRole('alert').getByText('재시도를 요청했어요', { exact: true }).waitFor();
  assert.equal(sql(`select manual_requested from result_link_jobs where id='${jid}'`), 't');
  const beforeAuto = sql(`select auto_attempts from result_link_jobs where id='${jid}'`);
  await browser.close();
  // Install the actual scheduler in this throwaway project; encrypted secrets never printed.
  sql(`select vault.create_secret('http://kong:8000/functions/v1/revoke-legacy-links','knitting_revocation_function_url');select vault.create_secret('${secret}','knitting_revocation_worker_secret');`);
  execFileSync('psql', [DB, '-X', '-v', 'ON_ERROR_STOP=1', '-f', 'supabase/ops/schedule_link_revocation.sql'], { stdio: 'pipe' });
  assert.equal(sql(`select count(*) from cron.job where jobname='knitting-link-revocation' and active`), '1');
  let completed = false;
  for (let tick = 0; tick < 80; tick++) {
    if (sql(`select manual_attempts>0 and lease_token is null from result_link_jobs where id='${jid}'`) === 't') { completed = true;break; }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.ok(completed, 'pg_cron + pg_net must continue after the browser closes');
  assert.equal(sql(`select auto_attempts from result_link_jobs where id='${jid}'`), beforeAuto);
  assert.equal(sql(`select status from result_link_jobs where id='${jid}'`), 'unverified');
  sql(`select cron.unschedule('knitting-link-revocation');`);
  console.log('PASS persistent UI risk/manual retry and actual server schedule after app exit');
  writeFileSync('/tmp/legacy-links-results.json', JSON.stringify({ result: 'PASS', environment: 'disposable local Supabase', originRevocation: 'PASS', bytesPreserved: 'PASS', rawPostsPreserved: 'PASS', serverSchedule: 'PASS', actualHostedCDN: 'NOT_TESTED: local Storage is not a CDN; warning retained' }, null, 2));
  console.log('RESULT: PASS');
} catch (e) {
  console.error('ERROR', e instanceof Error ? e.message : 'Legacy link E2E failed');
  await page.screenshot({ path: '/tmp/legacy-links-failure.png' }).catch(() => undefined);
  process.exitCode = 1;
} finally { await browser.close(); }
