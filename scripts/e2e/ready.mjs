// 테스트 배포 전 점검 E2E: 기록 지우기, 촬영 설정 기억, 프로필 편집.
// 실행 전: 로컬 Supabase, 웹 서버 8098 --clear
import { chromium } from 'playwright';

import { signUp } from './signup.mjs';

const BASE = 'http://localhost:8098';
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} });
const page = await ctx.newPage();
const stamp = Date.now().toString(36);
const body = () => page.locator('body').innerText();
const shoot = async (n) => {
  await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
  await page.getByRole('button', { name: '촬영' }).last().click();
  await page.getByText(`${n}번째 / ${n}`).waitFor({ timeout: 60000 });
};
try {
  await signUp(page, { base: BASE, email: `ready_${stamp}@example.com`, username: `ready_${stamp}`, displayName: '점검' });
  await page.waitForTimeout(2000);
  await page.goto(`${BASE}/projects`);
  await page.getByRole('button', { name: '편물 만들기' }).first().click({ timeout: 30000 });
  await page.getByPlaceholder('예: 회색 라글란 스웨터').fill('점검 목도리');
  await page.getByRole('button', { name: '만들기', exact: true }).click();

  // 1) 기록 두 장 → 두 번째 지우기
  await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 30000 });
  await shoot(1);
  await page.getByRole('button', { name: '사진 찍기' }).click();
  // 2) 촬영 설정: 격자 끄고 겹치기 60%로 바꾸기
  await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
  await page.getByText('60%').click();
  await page.getByRole('button', { name: '촬영' }).last().click();
  await page.getByText('2번째 / 2').waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: '더 보기' }).click();
  await page.getByRole('button', { name: '지금 보는 기록 지우기' }).click();
  await page.waitForTimeout(500);
  check('지우기 전에 무엇을 지우는지 묻는다', (await body()).includes('2번째 기록을 지울까요?'));
  await page.getByRole('button', { name: '지우기', exact: true }).click();
  await page.getByText('1번째 / 1').waitFor({ timeout: 30000 });
  check('기록을 지우면 목록에서 빠진다', (await body()).includes('기록 1개'));

  // 2) 새로고침 후에도 촬영 설정이 남아 있다
  await page.reload();
  await page.waitForTimeout(2000);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('knitting.capture') ?? '{}'));
  check('겹치기 60%를 기기에 기억한다', saved?.state?.ghost === 'high', JSON.stringify(saved?.state));

  // 4) 프로필 편집
  await page.goto(`${BASE}/me`);
  await page.getByRole('button', { name: '프로필 편집' }).click({ timeout: 30000 });
  await page.getByPlaceholder('하은').fill('점검하는 사람');
  await page.getByRole('button', { name: '저장' }).last().click();
  await page.waitForTimeout(1500);
  check('표시 이름을 바꿀 수 있다', (await body()).includes('점검하는 사람'));
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 200));
  await page.screenshot({ path: process.env.SHOT ?? '/tmp/ready-fail.png' });
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
