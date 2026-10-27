// Hard-coded disposable local stack. No production URL/key overrides permitted.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { signUp } from './signup.mjs';
const API = 'http://127.0.0.1:54321';
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BASE = 'http://localhost:8098';
const anon = process.env.SB_ANON_KEY?.replace(/^"|"$/g, '');
const service = process.env.SB_SERVICE_ROLE_KEY?.replace(/^"|"$/g, '');
const secret = readFileSync('/tmp/p0-functions.env', 'utf8').split('\n').find((s) => s.startsWith('CLEANUP_WORKER_SECRET='))?.split('=')[1];
assert.ok(anon && service && secret && /^[a-f0-9]{64}$/.test(secret));
const sql = (query: string) => execFileSync('psql', [DB, '-X', '-v', 'ON_ERROR_STOP=1', '-tAc', query], { encoding: 'utf8' }).trim();
const sb = createClient(API, service, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = await chromium.launch();const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript(() => localStorage.setItem('knitting.tourSeen', '1'));
const cases: string[] = [];
try {
  const username = `clean_${Date.now().toString(36)}`;
  await signUp(page, { base: BASE, email: `${username}@example.com`, username, displayName: '정리 QA', password: 'password123' });
  const session = await page.evaluate(() => { const key = Object.keys(localStorage).find((s) => /^sb-.*-auth-token$/.test(s));return JSON.parse(localStorage.getItem(key!)!); });
  const client = createClient(API, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.equal((await client.auth.setSession(session)).error, null);
  const owner = sql(`select id from profiles where username='${username}'`);
  // Only this synthetic fixture is an authorized reviewer. No production grant.
  sql(`insert into result_retention_reviewers(user_id)values('${owner}')`);
  const pid = randomUUID();const post = randomUUID();
  assert.equal((await sb.from('projects').insert({ id: pid, owner_id: owner, name: '보존할 원본 편물', default_visibility: 'public' })).error, null);
  const jpeg = readFileSync('/tmp/legacy-link.jpg');const mp4 = readFileSync('/tmp/legacy-link.mp4');
  const raw = `${owner}/${pid}/${post}.jpg`;
  assert.equal((await sb.storage.from('photos').upload(raw, jpeg, { contentType: 'image/jpeg' })).error, null);
  assert.equal((await sb.from('posts').insert({ id: post, project_id: pid, owner_id: owner, photo_path: raw, thumb_path: raw, width: 32, height: 32, taken_at: new Date().toISOString() })).error, null);
  const add = async (kind: 'single' | 'growth', output: 'jpeg' | 'mp4', legacy = false) => {
    const rid = randomUUID();const paths = [`${owner}/${pid}/results/${rid}.${output === 'mp4' ? 'mp4' : 'jpg'}`, `${owner}/${pid}/results/${rid}_t.jpg`];
    for (const [i, path] of paths.entries()) assert.equal((await sb.storage.from('photos').upload(path, i === 0 && output === 'mp4' ? mp4 : jpeg, { contentType: i === 0 && output === 'mp4' ? 'video/mp4' : 'image/jpeg' })).error, null);
    const recipe = rid.replaceAll('-', '').repeat(2);
    const edition = await client.rpc('prepare_result_edition', { pid, recipe });assert.equal(edition.error, null);
    const editionId = (edition.data as { id: string }[])[0]!.id;
    assert.equal((await client.from('results').insert({ id: rid, project_id: pid, owner_id: owner, kind, ratio: '1:1', output, file_path: paths[0], thumb_path: paths[1], edition_id: editionId, display_title_override: '지울 결과 제목' })).error, null);
    if (legacy) sql(`update results set legacy_links_unverified=true where id='${rid}'`);
    return { rid, paths, editionId };
  };
  const work = async () => {
    const result = await fetch(`${API}/functions/v1/cleanup-results`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` } });
    assert.equal(result.status, 200, await result.clone().text());return await result.json();
  };
  const review = async (rid: string, decision: string) => assert.equal((await client.rpc('review_result_retention', { rid, decision, reference: 'qa:synthetic-only' })).error, null);
  const active = await add('single', 'jpeg');
  const fixtures = [await add('single', 'jpeg'), await add('single', 'mp4'), await add('growth', 'mp4')];
  const legacy = await add('growth', 'mp4', true);
  for (const f of [...fixtures, legacy]) assert.equal((await client.rpc('delete_result', { result_id: f.rid })).error, null);
  await work();
  for (const f of fixtures) {
    assert.equal(sql(`select project_name_snapshot is not null and display_title_override is not null from results where id='${f.rid}'`), 't');
    assert.equal((await sb.storage.from('photos').download(f.paths[0]!)).error, null);
  }
  cases.push('unknown review preserves all titles and bytes');
  for (const f of fixtures) await review(f.rid, 'hold');
  await review(legacy.rid, 'clear');await work();
  assert.equal(sql(`select sum(auto_attempts) from result_cleanup_objects o join result_cleanup_jobs j on j.id=o.job_id where j.owner_id='${owner}'`), '0');
  assert.equal(sql(`select result_cleanup_gate('${legacy.rid}')`), 'LINKS_UNCONFIRMED');
  cases.push('hold and unverified legacy CDN block without spending attempts');
  for (const f of fixtures) await review(f.rid, 'clear');
  // Actual Storage API race after a claim. The final DB fence rejects it.
  const task = await sb.rpc('claim_result_cleanup');assert.equal(task.error, null);
  const t = task.data as { id: string; token: string; result_id: string; object: { path: string } };
  assert.ok(fixtures.some((f) => f.rid === t.result_id));
  await review(t.result_id, 'hold');
  const removal = await sb.storage.from('photos').remove([t.object.path]);
  // Some Storage versions acknowledge an empty deletion list on authorization
  // failure; actual byte preservation is authoritative.
  assert.ok(removal.error || removal.data?.length === 0);
  assert.equal((await sb.storage.from('photos').download(t.object.path)).error, null);
  assert.equal((await sb.rpc('finish_result_cleanup', { jid: t.id, token: t.token, outcome: 'VERIFY_FAILED' })).error, null);
  await review(t.result_id, 'clear');
  cases.push('actual Storage transaction rejects hold after claim; bytes preserved');
  for (let n = 0; n < 8; n++) await work();
  for (const f of fixtures) {
    assert.equal(sql(`select status from result_cleanup_jobs where result_id='${f.rid}'`), 'confirmed');
    assert.equal(sql(`select project_name_snapshot is null and display_title_override is null and titles_purged_at is not null and deleted_at is not null from results where id='${f.rid}'`), 't');
    for (const path of f.paths) assert.ok((await sb.storage.from('photos').download(path)).error);
    assert.equal(sql(`select count(*) from storage.objects where bucket_id='photos' and name like '${owner}/${pid}/results/${f.rid}%'`), '0');
    assert.equal(sql(`select state from result_editions where id='${f.editionId}'`), 'deleted');
  }
  cases.push('JPEG, composite MP4, growth MP4 and three thumbnails physically absent via Storage API; tombstones retained');
  const attempts = sql(`select sum(auto_attempts) from result_cleanup_objects o join result_cleanup_jobs j on j.id=o.job_id where j.owner_id='${owner}'`);
  await work();assert.equal(sql(`select sum(auto_attempts) from result_cleanup_objects o join result_cleanup_jobs j on j.id=o.job_id where j.owner_id='${owner}'`), attempts);
  assert.equal((await sb.storage.from('photos').download(raw)).error, null);
  for (const path of active.paths) assert.equal((await sb.storage.from('photos').download(path)).error, null);
  assert.equal(sql(`select name from projects where id='${pid}'`), '보존할 원본 편물');
  assert.equal(sql(`select count(*) from posts where id='${post}' and deleted_at is null`), '1');
  assert.equal((await client.functions.invoke('revocable-media', { body: { keys: fixtures.flatMap((f) => f.paths) } })).data.urls.length, 0);
  cases.push('repeat calls do not repeat deletion; active publication, source post/media/project unchanged; no fresh deleted media tickets');
  await page.goto(`${BASE}/results/cleanup`);
  await page.getByTestId(`cleanup-${fixtures[0]!.rid}`).getByText('정리 확인', { exact: true }).first().waitFor();
  await page.getByTestId(`cleanup-${legacy.rid}`).getByText('과거 링크 차단 확인 대기', { exact: true }).waitFor();
  assert.equal(await page.locator('img,video').count(), 0);
  assert.equal(await page.getByText('지울 결과 제목', { exact: true }).count(), 0);
  await page.screenshot({ path: '/tmp/result-cleanup-status.png', fullPage: true });
  cases.push('separate technical status UI contains no deleted title or media');
  const scheduled = await add('single', 'jpeg');
  assert.equal((await client.rpc('delete_result', { result_id: scheduled.rid })).error, null);await review(scheduled.rid, 'clear');
  await browser.close();
  sql(`select vault.create_secret('http://kong:8000/functions/v1/cleanup-results','knitting_cleanup_function_url');select vault.create_secret('${secret}','knitting_cleanup_worker_secret');`);
  execFileSync('psql', [DB, '-X', '-v', 'ON_ERROR_STOP=1', '-f', 'supabase/ops/schedule_result_cleanup.sql'], { stdio: 'pipe' });
  let completed = false;
  for (let n = 0; n < 80; n++) {
    if (sql(`select status='confirmed' from result_cleanup_jobs where result_id='${scheduled.rid}'`) === 't') { completed = true;break; }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.ok(completed, 'independent pg_cron must finish two objects after app exit');
  sql(`select cron.unschedule('knitting-result-cleanup')`);
  cases.push('actual independent pg_cron/pg_net schedule completes after app exit');
  writeFileSync('/tmp/result-cleanup-results.json', JSON.stringify({ result: 'PASS', environment: 'disposable local Supabase', cases, actualHostedCDN: 'NOT_TESTED: legacy gate remains closed', legalReview: 'SYNTHETIC fixtures only; no real decision or reviewer provisioned' }, null, 2));
  for (const c of cases) console.log('PASS', c);
} catch (error) {
  console.error('ERROR', error instanceof Error ? error.message : 'Result cleanup E2E failed');process.exitCode = 1;
  await page.screenshot({ path: '/tmp/result-cleanup-failure.png', fullPage: true }).catch(() => undefined);
} finally { await browser.close(); }
