// 로그인 화면 E2E: 비밀번호 8자 규칙과 소셜 로그인 버튼.
// 실행 전: 로컬 Supabase, 웹 서버 8098
import { chromium } from 'playwright';

const BASE = 'http://localhost:8098';
const stamp = Date.now().toString(36);
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));

try {
  await page.goto(BASE, { timeout: 180000 });
  await page.getByText('계정이 없어요, 가입할게요').click({ timeout: 120000 });
  check('안내 문구가 8자', await page.getByPlaceholder('8자 이상').isVisible());

  console.log('== 7자는 가입 안 됨');
  await page.getByPlaceholder('you@example.com').fill(`short_${stamp}@example.com`);
  await page.getByPlaceholder('8자 이상').fill('1234567');
  await page.getByRole('checkbox', { name: '약관과 개인정보처리방침에 동의합니다' }).click();
  check('7자면 가입 버튼이 꺼져 있다', (await page.getByRole('button', { name: '가입하기' }).getAttribute('aria-disabled')) === 'true');
  await page.getByPlaceholder('8자 이상').fill('12345678');
  check('8자면 켜진다', (await page.getByRole('button', { name: '가입하기' }).getAttribute('aria-disabled')) !== 'true');

  console.log('\n== MVP는 이메일·비밀번호만 지원');
  check('가입 화면 카카오 비노출', await page.getByRole('button', { name: '카카오로 계속하기' }).count() === 0);
  check('가입 화면 구글 비노출', await page.getByRole('button', { name: '구글로 계속하기' }).count() === 0);
  await page.getByText('이미 계정이 있어요').click();
  check('로그인 화면 소셜 비노출', await page.getByRole('button', { name: /카카오로 계속하기|구글로 계속하기/ }).count() === 0);
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 300));
  await page.screenshot({ path: '/tmp/social-fail.png' }).catch(() => {});
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
