// 기록 순서 바꾸기 E2E: 앞으로·뒤로 한 칸씩 옮기면 타임라인 순서가 바뀌어 저장된다.
// 실행 전: 로컬 Supabase, 웹 서버 8098
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

import { signUp } from './signup.mjs';

const BASE = 'http://localhost:8098';
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const stamp = Date.now().toString(36);
const username = `ord_${stamp}`;
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };
const sql = (q) => execFileSync('psql', [DB, '-tAc', q]).toString().trim();

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));
// 메모로 기록을 구분한다 (순서를 눈으로 확인하려고)
const order = () => sql(`select string_agg(coalesce(caption, '?'), ',' order by taken_at) from posts p join profiles pr on pr.id = p.owner_id where pr.username = '${username}' and p.deleted_at is null`);

try {
  await signUp(page, { base: BASE, email: `ord_${stamp}@example.com`, username, displayName: '순서' });
  await page.getByRole('button', { name: '편물 만들기' }).click({ timeout: 60000 });
  await page.getByPlaceholder('예: 회색 라글란 스웨터').fill('순서 편물');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  for (const name of ['하나', '둘', '셋']) {
    await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 60000 });
    await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
    await page.getByRole('button', { name: '촬영' }).click();
    await page.getByText('메모 추가').waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: '메모 추가' }).click();
    await page.getByRole('textbox', { name: '메모', exact: true }).fill(name);
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await page.getByText(name).first().waitFor({ timeout: 30000 });
  }
  check('처음 순서', order() === '하나,둘,셋', order());

  console.log('\n== 마지막 기록을 앞으로 한 칸');
  await page.getByRole('button', { name: '더 보기' }).click({ timeout: 60000 });
  await page.getByRole('alert').getByRole('button', { name: '기록 순서 바꾸기' }).click();
  await page.getByRole('button', { name: '← 앞으로' }).click({ timeout: 30000 });
  await page.waitForTimeout(2000);
  check('셋이 둘 앞으로', order() === '하나,셋,둘', order());

  console.log('\n== 한 칸 더 앞으로');
  await page.getByRole('button', { name: '← 앞으로' }).click();
  await page.waitForTimeout(2000);
  check('셋이 맨 앞으로', order() === '셋,하나,둘', order());

  console.log('\n== 다시 뒤로');
  await page.getByRole('button', { name: '뒤로 →' }).click();
  await page.waitForTimeout(2000);
  check('셋이 둘째로', order() === '하나,셋,둘', order());

  await page.getByRole('button', { name: '끝내기' }).click();
  check('끝내면 버튼이 사라진다', (await page.getByRole('button', { name: '← 앞으로' }).count()) === 0);
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 300));
  await page.screenshot({ path: '/tmp/order-fail.png' }).catch(() => {});
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
