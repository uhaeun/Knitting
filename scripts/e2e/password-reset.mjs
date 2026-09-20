// 비밀번호 찾기 E2E: 메일 보내기 → 로컬 메일함(Mailpit)에서 링크 꺼내기 → 새 비밀번호 → 새 비밀번호로 로그인.
// 실행 전: 로컬 Supabase(메일함 54324), 웹 서버 8098
import { chromium } from 'playwright';

import { signUp } from './signup.mjs';

const BASE = 'http://localhost:8098';
const MAIL = 'http://127.0.0.1:54324';
const stamp = Date.now().toString(36);
const email = `pw_${stamp}@example.com`;
const OLD = 'password123';
const NEW = 'newpass456';

let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };

// 메일함에서 이 주소로 온 가장 최근 메일의 링크
const resetLinkFor = async (to) => {
  for (let i = 0; i < 30; i += 1) {
    const list = await fetch(`${MAIL}/api/v1/messages?limit=20`).then((r) => r.json());
    const hit = (list.messages ?? []).find((m) => (m.To ?? []).some((t) => t.Address === to));
    if (hit) {
      const msg = await fetch(`${MAIL}/api/v1/message/${hit.ID}`).then((r) => r.json());
      const link = (msg.Text ?? msg.HTML ?? '').match(/https?:\/\/[^\s"<>]*token[^\s"<>]*/)?.[0];
      if (link) return link.replace(/&amp;/g, '&');
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));
const signIn = async (pw) => {
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('8자 이상').fill(pw);
  await page.getByRole('button', { name: '로그인' }).click();
};
const signOut = async () => {
  await page.goto(`${BASE}/settings`);
  await page.getByRole('button', { name: '로그아웃' }).click({ timeout: 30000 });
  await page.getByRole('button', { name: '로그인' }).waitFor({ timeout: 30000 });
};

try {
  console.log('== 가입');
  await signUp(page, { base: BASE, email, username: `pw_${stamp}`, displayName: '비번', password: OLD });
  await signOut();

  console.log('\n== 재설정 메일 보내기');
  await page.getByText('비밀번호를 잊었어요').click({ timeout: 30000 });
  // 로그인 화면이 뒤에 그대로 남아 있어서 입력칸이 둘이다. 새로 올라온 쪽을 쓴다
  await page.getByPlaceholder('you@example.com').last().fill(email);
  await page.getByRole('button', { name: '재설정 메일 보내기' }).click();
  await page.getByText('메일을 보냈어요', { exact: false }).waitFor({ timeout: 30000 });
  check('보냈다고 알려 준다', true);

  const link = await resetLinkFor(email);
  check('메일에 링크가 있다', !!link, link ? link.slice(0, 60) + '…' : '');
  if (!link) throw new Error('메일 없음');

  console.log('\n== 링크로 새 비밀번호');
  await page.goto(link, { timeout: 60000 });
  await page.getByText('새 비밀번호', { exact: true }).first().waitFor({ timeout: 60000 });
  check('주소창에 토큰이 남지 않는다', !page.url().includes('access_token'), page.url());
  await page.getByPlaceholder('8자 이상').fill(NEW);
  await page.getByPlaceholder('같은 비밀번호').fill('다른비밀번호');
  await page.getByText('두 번 입력한 비밀번호가 달라요').waitFor({ timeout: 15000 });
  check('확인이 다르면 알려 준다', true);
  await page.getByPlaceholder('같은 비밀번호').fill(NEW);
  await page.getByRole('button', { name: '비밀번호 바꾸기' }).click();
  await page.getByRole('button', { name: '편물 만들기' }).waitFor({ timeout: 60000 });
  check('바꾸면 바로 앱으로', true);

  console.log('\n== 새 비밀번호로 로그인');
  await signOut();
  await signIn(OLD);
  await page.getByText('이메일 또는 비밀번호가 맞지 않아요').waitFor({ timeout: 30000 });
  check('옛 비밀번호는 막힌다', true);
  await signIn(NEW);
  await page.getByRole('button', { name: '편물 만들기' }).waitFor({ timeout: 60000 });
  check('새 비밀번호로 들어간다', true);

  console.log('\n== 만료된 링크');
  await signOut();
  await page.goto(`${BASE}/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`, { timeout: 60000 });
  await page.getByText('링크가 만료됐어요', { exact: false }).waitFor({ timeout: 60000 });
  check('만료되면 그렇게 알려 준다', true);
  if (process.argv[2]) await page.screenshot({ path: `${process.argv[2]}/pw-expired.png` });
  await page.getByRole('button', { name: '다시 보내기' }).click();
  await page.getByRole('button', { name: '로그인' }).waitFor({ timeout: 30000 });
  check('다시 보내기 → 로그인 화면', true);
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 300));
  await page.screenshot({ path: '/tmp/pw-fail.png' }).catch(() => {});
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
