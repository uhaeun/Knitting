// 약관·개인정보처리방침 E2E: 동의 없이는 가입이 막히고, 두 문서를 가입 화면과 설정에서 읽을 수 있다.
// 실행 전: 로컬 Supabase, 웹 서버 8098
import { chromium } from 'playwright';

import { confirmLink } from './signup.mjs';

const BASE = 'http://localhost:8098';
const stamp = Date.now().toString(36);
const email = `legal_${stamp}@example.com`;
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));
const enabled = async (name) =>
  (await page.getByRole('button', { name }).getAttribute('aria-disabled')) !== 'true';

try {
  await page.goto(BASE, { timeout: 180000 });
  await page.getByText('계정이 없어요, 가입할게요').click({ timeout: 120000 });
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('8자 이상').fill('password123');

  const agree = page.getByRole('checkbox', { name: '약관과 개인정보처리방침에 동의합니다' });
  check('가입 화면에 동의 칸', await agree.isVisible());
  check('동의 전에는 가입 못 함', !(await enabled('가입하기')));

  console.log('\n== 가입 화면에서 문서 읽기');
  await page.getByText('이용약관 보기').click();
  await page.getByText('1. 닛팅은 어떤 서비스인가요').waitFor({ timeout: 30000 });
  check('이용약관 본문', true);
  await page.getByRole('button', { name: '뒤로' }).click();
  await page.getByText('개인정보처리방침 보기').click();
  await page.getByText('1. 무엇을 받나요').waitFor({ timeout: 30000 });
  check('개인정보처리방침 본문', await page.getByText('위치 정보, 연락처, 광고 식별자', { exact: false }).isVisible());
  await page.getByRole('button', { name: '뒤로' }).click();

  console.log('\n== 동의하고 가입');
  await agree.click();
  check('동의하면 가입 가능', await enabled('가입하기'));
  await page.getByRole('button', { name: '가입하기' }).click();
  // 이메일 확인이 켜져 있으면 메일 링크를 눌러야 첫 설정으로 간다
  const waiting = page.getByText('확인 메일을 보냈어요', { exact: false });
  const onboarding = page.getByPlaceholder('knitter_haeun');
  await Promise.race([waiting.waitFor({ timeout: 60000 }).catch(() => {}), onboarding.waitFor({ timeout: 60000 }).catch(() => {})]);
  if (await waiting.isVisible().catch(() => false)) await page.goto(await confirmLink(email), { timeout: 60000 });
  await onboarding.waitFor({ timeout: 60000 });
  await onboarding.fill(`legal_${stamp}`);
  await page.getByPlaceholder('하은').fill('약관');
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.getByRole('button', { name: '편물 만들기' }).waitFor({ timeout: 60000 });
  check('가입 완료', true);

  console.log('\n== 설정에서도 읽을 수 있다');
  await page.goto(`${BASE}/settings`);
  await page.getByRole('button', { name: '이용약관' }).click({ timeout: 30000 });
  await page.getByText('7. 약관이 바뀔 때').waitFor({ timeout: 30000 });
  check('설정 → 이용약관', true);
  await page.getByRole('button', { name: '뒤로' }).click();
  await page.getByRole('button', { name: '개인정보처리방침' }).click();
  await page.getByText('8. 바뀔 때와 문의').waitFor({ timeout: 30000 });
  check('설정 → 개인정보처리방침', true);
  if (process.argv[2]) await page.screenshot({ path: `${process.argv[2]}/legal-privacy.png` });
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 300));
  await page.screenshot({ path: '/tmp/legal-fail.png' }).catch(() => {});
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
