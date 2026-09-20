// 편물·기록 CRUD E2E: 편물 이름 바꾸기, 편물 화면에서 기록 지우기, 게시물 상세에서 내 기록 지우기.
// 실행 전: 로컬 Supabase, 웹 서버 8098 --clear
import { chromium } from 'playwright';

import { signUp } from './signup.mjs';

const BASE = 'http://localhost:8098'; const stamp = Date.now().toString(36);
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); if (!ok) failed += 1; };
// 앱 안 대화상자(DialogHost)의 버튼 누르기
const choose = async (label) => page.getByRole('alert').getByRole('button', { name: label, exact: true }).click({ timeout: 45000 });
try {
  await signUp(page, { base: BASE, email: `cr_${stamp}@example.com`, username: `cr_${stamp}`, displayName: '크루드' });
  await page.goto(`${BASE}/projects`);
  await page.getByRole('button', { name: '편물 만들기' }).click({ timeout: 60000 });
  await page.getByPlaceholder('예: 회색 라글란 스웨터').fill('원래 이름');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  for (const k of [1, 2, 3]) {
    await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 60000 });
    await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 60000 });
    await page.getByRole('button', { name: '촬영' }).click();
    await page.getByText(`${k}번째 / ${k}`).waitFor({ timeout: 60000 });
  }

  console.log('\n== 편물 이름 바꾸기 (U)');
  await page.getByRole('button', { name: '더 보기' }).click();
  await choose('이름 바꾸기');
  const field = page.locator('input[value="원래 이름"]');
  check('지금 이름이 채워져 있음', (await field.count()) === 1);
  await field.fill('바꾼 이름');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByText('바꾼 이름').last().waitFor({ timeout: 45000 });
  check('편물 화면에 새 이름', true);

  console.log('\n== 편물 화면에서 기록 지우기 (D)');
  await page.getByRole('button', { name: '더 보기' }).click();
  await choose('지금 보는 기록 지우기');
  await choose('지우기');
  await page.getByText('2번째 / 2').waitFor({ timeout: 45000 });
  check('3장 → 2장', true);

  console.log('\n== 게시물 상세에서 내 기록 지우기 (D)');
  await page.goto(`${BASE}/me`);
  const cells = page.locator('[role="button"]:has(img)');
  await cells.first().waitFor({ timeout: 60000 });
  check('나 탭에 2장', (await cells.count()) === 2, `(${await cells.count()})`);
  await cells.first().click();
  await page.getByRole('button', { name: '더 보기' }).click({ timeout: 60000 });
  await choose('이 사진 지우기');
  await choose('지우기');
  await page.waitForURL(/\/me$/, { timeout: 45000 });
  await page.waitForFunction(() => document.querySelectorAll('[role="button"] img').length === 1, null, { timeout: 45000 }).catch(() => {});
  check('나 탭에 1장', (await cells.count()) === 1, `(${await cells.count()})`);

  console.log('\n== 목록에도 반영');
  await page.goto(`${BASE}/projects`);
  await page.getByText('바꾼 이름').first().waitFor({ timeout: 60000 });
  check('편물 목록에 새 이름', (await page.getByText('원래 이름').count()) === 0);
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 400));
  await page.screenshot({ path: '/tmp/crud-fail.png' }).catch(() => {});
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
}
