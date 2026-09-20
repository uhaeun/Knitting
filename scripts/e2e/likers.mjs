// 좋아요 누른 사람 목록 E2E: 숫자를 누르면 누가 눌렀는지 보이고, 이름을 누르면 프로필로 간다.
// 실행 전: 로컬 Supabase, 웹 서버 8098
import { chromium } from 'playwright';

import { signUp } from './signup.mjs';

const BASE = 'http://localhost:8098';
const stamp = Date.now().toString(36);
const guestName = `좋아요${stamp.slice(-3)}`;
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 150)));
  return page;
};

try {
  const a = await newPage();
  await signUp(a, { base: BASE, email: `lk_${stamp}@example.com`, username: `lk_${stamp}`, displayName: '주인' });
  await a.getByRole('button', { name: '편물 만들기' }).click({ timeout: 60000 });
  await a.getByPlaceholder('예: 회색 라글란 스웨터').fill('좋아요 편물');
  await a.getByRole('radio', { name: '전체' }).click();
  await a.getByRole('button', { name: '만들기', exact: true }).click();
  await a.getByRole('button', { name: '사진 찍기' }).click({ timeout: 60000 });
  await a.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
  await a.getByRole('button', { name: '촬영' }).click();
  await a.getByText('1번째 / 1').waitFor({ timeout: 60000 });

  console.log('== 아직 좋아요가 없을 때');
  await a.goto(`${BASE}/me`);
  await a.locator('[role="button"]:has(img)').first().click({ timeout: 60000 });
  check('0이면 눌리지 않는다', (await a.getByRole('button', { name: '좋아요 누른 사람' }).getAttribute('aria-disabled')) === 'true');

  console.log('\n== 손님이 좋아요를 누르면');
  const b = await newPage();
  await signUp(b, { base: BASE, email: `lg_${stamp}@example.com`, username: `lg_${stamp}`, displayName: guestName });
  await b.goto(`${BASE}/explore`);
  await b.locator('[role="button"]:has(img)').first().click({ timeout: 60000 });
  await b.getByRole('button', { name: '좋아요', exact: true }).click({ timeout: 30000 });
  await b.waitForTimeout(1500);

  await a.reload();
  await a.getByRole('button', { name: '좋아요 누른 사람' }).click({ timeout: 60000 });
  await a.getByText(guestName).first().waitFor({ timeout: 30000 });
  check('누른 사람 이름이 보인다', true);
  check('아이디도 보인다', await a.getByText(`@lg_${stamp}`).first().isVisible());

  await a.getByText(guestName).first().click();
  await a.waitForURL(new RegExp(`/user/lg_${stamp}$`), { timeout: 30000 });
  check('이름을 누르면 프로필로', true);
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 300));
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
