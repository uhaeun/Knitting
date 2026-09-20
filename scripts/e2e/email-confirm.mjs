// 이메일 인증 E2E: 가입하면 메일을 기다리고, 확인 링크를 눌러야 들어간다.
// 실행 전: 로컬 Supabase(config.toml의 enable_confirmations = true), 웹 서버 8098
import { chromium } from 'playwright';

const BASE = 'http://localhost:8098';
const MAIL = 'http://127.0.0.1:54324';
const stamp = Date.now().toString(36);
const email = `conf_${stamp}@example.com`;
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };

const mailsFor = async (to) => {
  const list = await fetch(`${MAIL}/api/v1/messages?limit=50`).then((r) => r.json());
  return (list.messages ?? []).filter((m) => (m.To ?? []).some((t) => t.Address === to));
};
const linkFor = async (to, want = 1) => {
  for (let i = 0; i < 30; i += 1) {
    const hits = await mailsFor(to);
    if (hits.length >= want) {
      const msg = await fetch(`${MAIL}/api/v1/message/${hits[0].ID}`).then((r) => r.json());
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

try {
  console.log('== 가입');
  await page.goto(BASE, { timeout: 180000 });
  await page.getByText('계정이 없어요, 가입할게요').click({ timeout: 120000 });
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('6자 이상').fill('password123');
  await page.getByRole('checkbox', { name: '약관과 개인정보처리방침에 동의합니다' }).click();
  await page.getByRole('button', { name: '가입하기' }).click();
  await page.getByText('확인 메일을 보냈어요', { exact: false }).waitFor({ timeout: 60000 });
  check('메일 기다리는 화면', true);

  console.log('\n== 확인 전에는 로그인 안 됨');
  await page.getByText('로그인으로 돌아가기').click();
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('6자 이상').fill('password123');
  await page.getByRole('button', { name: '로그인' }).click();
  // 서버가 뭐라고 답하든(확인 안 됨 / 맞지 않음) 방금 가입한 주소면 메일부터 안내한다
  await page.getByText('확인 메일을 보냈어요', { exact: false }).waitFor({ timeout: 30000 });
  check('확인 전 로그인하면 메일 안내로', true);

  console.log('\n== 메일 링크로 가입 마무리');
  const link = await linkFor(email);
  check('확인 메일이 왔다', !!link, link ? link.slice(0, 55) + '…' : '');
  if (!link) throw new Error('메일 없음');
  await page.goto(link, { timeout: 60000 });
  await page.getByPlaceholder('knitter_haeun').waitFor({ timeout: 60000 });
  check('링크를 누르면 첫 설정으로', !page.url().includes('access_token'), page.url());
  await page.getByPlaceholder('knitter_haeun').fill(`conf_${stamp}`);
  await page.getByPlaceholder('하은').fill('인증');
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.getByRole('button', { name: '편물 만들기' }).waitFor({ timeout: 60000 });
  check('가입 완료', true);
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 300));
  await page.screenshot({ path: '/tmp/conf-fail.png' }).catch(() => {});
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
