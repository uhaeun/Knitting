// 편물 날짜 E2E: 시작일을 골라서 만들고, 나중에 시작일을 바꾸고, 완성 표시를 켰다 끈다.
// 실행 전: 로컬 Supabase, 웹 서버 8098
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

import { signUp } from './signup.mjs';

const BASE = 'http://localhost:8098';
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const stamp = Date.now().toString(36);
const username = `date_${stamp}`;
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };
const sql = (q) => execFileSync('psql', [DB, '-tAc', q]).toString().trim();
const row = () => sql(`select started_at || '|' || coalesce(finished_at::text, 'null') from projects p join profiles pr on pr.id = p.owner_id where pr.username = '${username}'`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));

try {
  await signUp(page, { base: BASE, email: `date_${stamp}@example.com`, username, displayName: '날짜' });

  console.log('== 지난 날짜로 시작한 편물 만들기');
  await page.getByRole('button', { name: '편물 만들기' }).click({ timeout: 30000 });
  await page.getByPlaceholder('예: 회색 라글란 스웨터').fill('작년 목도리');
  await page.getByLabel('시작일').fill('2026-03-15');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await page.getByRole('button', { name: '사진 찍기' }).waitFor({ timeout: 60000 }); // 편물 화면으로 들어옴
  check('고른 날짜로 저장', row().startsWith('2026-03-15'), row());

  console.log('\n== 시작일 바꾸기');
  await page.getByRole('button', { name: '더 보기' }).click({ timeout: 30000 });
  await page.getByRole('alert').getByRole('button', { name: '날짜 바꾸기 · 완성 표시' }).click();
  await page.getByLabel('시작일').fill('2026-04-01');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByText('4월 1일 시작', { exact: false }).last().waitFor({ timeout: 30000 });
  check('바꾼 날짜가 저장됨', row().startsWith('2026-04-01'), row());

  console.log('\n== 완성 표시');
  await page.getByRole('button', { name: '더 보기' }).click();
  await page.getByRole('alert').getByRole('button', { name: '날짜 바꾸기 · 완성 표시' }).click();
  await page.getByRole('button', { name: '완성했어요' }).click();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByText('완성', { exact: false }).last().waitFor({ timeout: 30000 });
  check('완성일이 채워짐', !row().endsWith('null'), row());

  await page.goto(`${BASE}/projects`);
  await page.getByText('완성', { exact: true }).first().waitFor({ timeout: 30000 });
  check('목록 카드에 완성 표시', true);

  console.log('\n== 다시 진행 중으로');
  await page.getByText('작년 목도리').click();
  await page.getByRole('button', { name: '더 보기' }).click({ timeout: 30000 });
  await page.getByRole('alert').getByRole('button', { name: '날짜·완성 표시 바꾸기' }).click();
  await page.getByRole('button', { name: '다시 진행 중으로' }).click();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.waitForTimeout(1500);
  check('완성일이 비워짐', row().endsWith('null'), row());
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 300));
  await page.screenshot({ path: '/tmp/date-fail.png' }).catch(() => {});
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
