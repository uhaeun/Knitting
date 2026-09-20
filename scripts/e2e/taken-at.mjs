// 기록 날짜 고치기 E2E: 날짜를 바꾸면 저장되고 타임라인 순서도 따라 바뀐다.
// 실행 전: 로컬 Supabase, 웹 서버 8098
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

import { signUp } from './signup.mjs';

const BASE = 'http://localhost:8098';
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const stamp = Date.now().toString(36);
const username = `taken_${stamp}`;
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };
const sql = (q) => execFileSync('psql', [DB, '-tAc', q]).toString().trim();

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));

try {
  await signUp(page, { base: BASE, email: `taken_${stamp}@example.com`, username, displayName: '날짜고침' });
  await page.getByRole('button', { name: '편물 만들기' }).click({ timeout: 60000 });
  await page.getByPlaceholder('예: 회색 라글란 스웨터').fill('날짜 편물');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  for (const k of [1, 2]) {
    await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 60000 });
    await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
    await page.getByRole('button', { name: '촬영' }).click();
    await page.getByText(`${k}번째 / ${k}`).waitFor({ timeout: 60000 });
  }

  console.log('== 두 번째 기록의 날짜를 지난달로');
  await page.getByRole('button', { name: '더 보기' }).click({ timeout: 60000 });
  await page.getByRole('alert').getByRole('button', { name: '이 기록의 날짜 고치기' }).click();
  await page.getByLabel('날짜').last().fill('2026-08-15');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.waitForTimeout(2000);

  const owner = sql(`select id from profiles where username = '${username}'`);
  const days = sql(`select string_agg(to_char(taken_at at time zone 'UTC', 'MM-DD'), ',' order by taken_at) from posts where owner_id = '${owner}'`);
  check('날짜가 바뀌어 저장됨', days.startsWith('08-15'), days);
  check('순서도 바뀐다 (바꾼 기록이 첫 장)', days.split(',').length === 2, days);

  console.log('\n== 화면에도 반영');
  await page.reload();
  await page.getByRole('button', { name: '1번째 기록' }).click({ timeout: 60000 }); // 첫 장으로 이동
  await page.getByText('8월 15일', { exact: false }).first().waitFor({ timeout: 30000 });
  check('첫 장 캡션이 8월 15일', true);
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 300));
  await page.screenshot({ path: '/tmp/taken-fail.png' }).catch(() => {});
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
