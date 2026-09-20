// 기록 메모 E2E: 편물 화면에서 메모를 쓰고, 게시물 상세와 피드에도 같은 글이 보인다.
// 실행 전: 로컬 Supabase, 웹 서버 8098
import { chromium } from 'playwright';

import { signUp } from './signup.mjs';

const BASE = 'http://localhost:8098';
const stamp = Date.now().toString(36);
const MEMO = '남색 실로 소매 시작';
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));

try {
  await signUp(page, { base: BASE, email: `memo_${stamp}@example.com`, username: `memo_${stamp}`, displayName: '메모' });
  await page.getByRole('button', { name: '편물 만들기' }).click({ timeout: 30000 });
  await page.getByPlaceholder('예: 회색 라글란 스웨터').fill('메모 스웨터');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 30000 });
  await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
  await page.getByRole('button', { name: '촬영' }).click();
  await page.getByText('1번째 / 1').waitFor({ timeout: 60000 });

  console.log('== 메모 쓰기');
  check('처음에는 "메모 추가"', await page.getByText('메모 추가').isVisible());
  await page.getByRole('button', { name: '메모 추가' }).click();
  await page.getByRole('textbox', { name: '메모', exact: true }).fill(MEMO);
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByText(MEMO).first().waitFor({ timeout: 30000 });
  check('편물 화면에 메모', true);

  console.log('\n== 새로고침해도 남는다');
  await page.reload();
  await page.getByText(MEMO).first().waitFor({ timeout: 60000 });
  check('서버에 저장됨', true);

  console.log('\n== 게시물 상세에서 고치기');
  await page.goto(`${BASE}/me`);
  await page.locator('[role="button"]:has(img)').first().click({ timeout: 30000 });
  await page.getByText(MEMO).first().waitFor({ timeout: 30000 });
  check('게시물 상세에 메모', true);
  await page.getByRole('button', { name: '더 보기' }).click();
  await page.getByRole('alert').getByRole('button', { name: '메모 고치기' }).click();
  await page.getByRole('textbox', { name: '메모', exact: true }).fill('고친 메모');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByText('고친 메모').first().waitFor({ timeout: 30000 });
  // 화면이 갱신되는 데 한 박자 걸린다. 옛 글이 사라질 때까지 기다린다
  await page.getByText(MEMO).first().waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  const leftovers = await page.getByText(MEMO).allTextContents();
  check('옛 메모는 사라진다', leftovers.length === 0, JSON.stringify(leftovers));
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 300));
  await page.screenshot({ path: '/tmp/memo-fail.png' }).catch(() => {});
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
