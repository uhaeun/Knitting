// 휴지통 E2E: 지운 기록과 편물을 되돌리면 원래 자리로 돌아온다.
// 실행 전: 로컬 Supabase, 웹 서버 8098
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

import { signUp } from './signup.mjs';

const BASE = 'http://localhost:8098';
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const stamp = Date.now().toString(36);
const username = `trash_${stamp}`;
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };
const sql = (q) => execFileSync('psql', [DB, '-tAc', q]).toString().trim();

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));
const choose = (label) => page.getByRole('alert').getByRole('button', { name: label, exact: true }).click({ timeout: 45000 });

try {
  await signUp(page, { base: BASE, email: `trash_${stamp}@example.com`, username, displayName: '휴지통' });
  const owner = sql(`select id from profiles where username = '${username}'`);
  const alive = () => sql(`select count(*) from posts where owner_id = '${owner}' and deleted_at is null`);
  const projects = () => sql(`select count(*) from projects where owner_id = '${owner}' and deleted_at is null`);

  await page.getByRole('button', { name: '편물 만들기' }).click({ timeout: 60000 });
  await page.getByPlaceholder('예: 회색 라글란 스웨터').fill('되돌릴 편물');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  for (const k of [1, 2]) {
    await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 60000 });
    await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
    await page.getByRole('button', { name: '촬영' }).click();
    await page.getByText(`${k}번째 / ${k}`).waitFor({ timeout: 60000 });
  }

  console.log('== 기록 하나 지우고 되돌리기');
  await page.getByRole('button', { name: '더 보기' }).click({ timeout: 45000 });
  await choose('지금 보는 기록 지우기');
  await choose('지우기');
  await page.getByText('1번째 / 1').waitFor({ timeout: 45000 });
  check('지우면 1장', alive() === '1', alive());

  await page.goto(`${BASE}/settings/trash`);
  await page.getByRole('button', { name: /되돌리기$/ }).first().click({ timeout: 45000 });
  await page.waitForTimeout(2000);
  check('되돌리면 2장', alive() === '2', alive());
  check('휴지통이 비었다', (await page.getByText('휴지통이 비어 있어요').count()) === 1);

  console.log('\n== 편물 통째로 지우고 되돌리기');
  await page.goto(`${BASE}/projects`);
  await page.getByText('되돌릴 편물').click({ timeout: 45000 });
  await page.getByRole('button', { name: '더 보기' }).click({ timeout: 45000 });
  await choose('편물 삭제');
  await choose('삭제');
  await page.waitForTimeout(2000);
  check('편물이 사라짐', projects() === '0' && alive() === '0', `${projects()}/${alive()}`);

  await page.goto(`${BASE}/settings/trash`);
  await page.getByText('편물 전체').waitFor({ timeout: 45000 });
  await page.getByRole('button', { name: /되돌리기$/ }).first().click();
  await page.waitForTimeout(2500);
  check('편물과 기록이 함께 살아남', projects() === '1' && alive() === '2', `${projects()}/${alive()}`);

  await page.goto(`${BASE}/projects`);
  await page.getByText('되돌릴 편물').waitFor({ timeout: 45000 });
  check('목록에 다시 보인다', true);
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 300));
  await page.screenshot({ path: '/tmp/trash-fail.png' }).catch(() => {});
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
