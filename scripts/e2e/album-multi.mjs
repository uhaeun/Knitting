// 앨범에서 여러 장 한 번에 올리기 E2E: 고른 순서대로 기록이 쌓이고, 파일 시각이 촬영 시각이 된다.
// 실행 전: 로컬 Supabase, 웹 서버 8098
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

import { signUp } from './signup.mjs';

const BASE = 'http://localhost:8098';
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const stamp = Date.now().toString(36);
const username = `multi_${stamp}`;
const dir = mkdtempSync(join(tmpdir(), 'knit-multi-'));
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };
const sql = (q) => execFileSync('psql', [DB, '-tAc', q]).toString().trim();

// 사진 3장. 파일 시각을 3월 1·2·3일로 달아 둔다 (촬영 시각으로 쓰이는지 본다)
const files = [1, 2, 3].map((n) => {
  const f = join(dir, `p${n}.jpg`);
  execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', `testsrc=size=400x400:duration=1:rate=1`, '-frames:v', '1', f], { stdio: 'ignore' });
  const when = new Date(`2026-03-0${n}T04:00:00Z`).getTime() / 1000;
  utimesSync(f, when, when);
  return f;
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));

try {
  await signUp(page, { base: BASE, email: `multi_${stamp}@example.com`, username, displayName: '여러장' });
  await page.getByRole('button', { name: '편물 만들기' }).click({ timeout: 60000 });
  await page.getByPlaceholder('예: 회색 라글란 스웨터').fill('여러 장 편물');
  await page.getByRole('button', { name: '만들기', exact: true }).click();

  console.log('== 앨범에서 3장 한 번에');
  await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 60000 });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 30000 }),
    page.getByRole('button', { name: '앨범에서 가져오기' }).click(),
  ]);
  check('여러 장 고를 수 있다', chooser.isMultiple());
  await chooser.setFiles(files);
  await page.getByText('3번째 / 3').waitFor({ timeout: 120000 });
  check('3장이 한 번에 쌓인다', true);

  const owner = sql(`select id from profiles where username = '${username}'`);
  const dates = sql(`select string_agg(to_char(taken_at at time zone 'UTC', 'MM-DD'), ',' order by taken_at) from posts where owner_id = '${owner}'`);
  check('파일 시각이 촬영 시각으로', dates === '03-01,03-02,03-03', dates);
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 300));
  await page.screenshot({ path: '/tmp/multi-fail.png' }).catch(() => {});
} finally {
  rmSync(dir, { recursive: true, force: true });
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
