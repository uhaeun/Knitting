// 설정에서 비밀번호 바꾸기 E2E: 지금 비밀번호가 틀리면 막히고, 바꾸면 새 비밀번호로만 로그인된다.
// 실행 전: 로컬 Supabase, 웹 서버 8098
import { chromium } from 'playwright';

import { signUp } from './signup.mjs';

const BASE = 'http://localhost:8098';
const stamp = Date.now().toString(36);
const email = `pwch_${stamp}@example.com`;
const OLD = 'password123';
const NEW = 'newpass789';
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));
const signOut = async () => {
  await page.goto(`${BASE}/settings`);
  await page.getByRole('button', { name: '로그아웃' }).click({ timeout: 45000 });
  await page.getByRole('button', { name: '로그인' }).waitFor({ timeout: 45000 });
};
const signIn = async (pw) => {
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('8자 이상').fill(pw);
  await page.getByRole('button', { name: '로그인' }).click();
};

try {
  await signUp(page, { base: BASE, email, username: `pwch_${stamp}`, displayName: '비번변경', password: OLD });

  console.log('== 지금 비밀번호가 틀리면');
  await page.goto(`${BASE}/settings`);
  await page.getByRole('button', { name: '비밀번호 바꾸기' }).click({ timeout: 45000 });
  await page.getByLabel('지금 비밀번호').fill('틀린비밀번호');
  await page.getByLabel('새 비밀번호').fill(NEW);
  await page.getByLabel('한 번 더').fill(NEW);
  await page.getByRole('button', { name: '바꾸기', exact: true }).click();
  await page.getByText('지금 비밀번호가 맞지 않아요').waitFor({ timeout: 45000 });
  check('틀린 비밀번호는 막힌다', true);

  console.log('\n== 확인이 다르면');
  await page.getByLabel('지금 비밀번호').fill(OLD);
  await page.getByLabel('한 번 더').fill('다른비밀번호');
  await page.getByText('두 번 입력한 비밀번호가 달라요').waitFor({ timeout: 30000 });
  check('확인이 다르면 알려 준다', true);

  console.log('\n== 제대로 바꾸기');
  await page.getByLabel('한 번 더').fill(NEW);
  await page.getByRole('button', { name: '바꾸기', exact: true }).click();
  await page.getByText('비밀번호를 바꿨어요').waitFor({ timeout: 45000 });
  await page.getByRole('button', { name: '확인' }).click();
  check('바꿨다고 알려 준다', true);

  console.log('\n== 새 비밀번호로만 로그인');
  await signOut();
  await signIn(OLD);
  await page.getByText('이메일 또는 비밀번호가 맞지 않아요').waitFor({ timeout: 45000 });
  check('옛 비밀번호는 막힌다', true);
  await signIn(NEW);
  await page.getByRole('button', { name: '편물 만들기' }).waitFor({ timeout: 60000 });
  check('새 비밀번호로 들어간다', true);
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 300));
  await page.screenshot({ path: '/tmp/pwch-fail.png' }).catch(() => {});
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
