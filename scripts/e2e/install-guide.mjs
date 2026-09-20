// 홈 화면 추가 안내 E2E: 아이폰(설치 전) 배너·단계 안내, 닫으면 다시 안 뜸, 홈 화면 앱이면 숨김.
// 실행 전: 로컬 Supabase, 웹 서버 8098 --clear

import { chromium } from 'playwright';

import { signUp } from './signup.mjs';
const BASE = 'http://localhost:8098'; const stamp = Date.now().toString(36);
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: IPHONE_UA });
await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} }); // 사용법 안내는 tour.mjs가 따로 본다
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
try {
  await signUp(page, { base: BASE, email: `inst_${stamp}@example.com`, username: `inst_${stamp}`, displayName: '설치' });
  await page.waitForTimeout(2500);
  check('처음 들어오면 안내가 저절로 열린다', (await page.locator('body').innerText()).includes('앱처럼 쓰기'));
  check('아이폰(설치 전)에 배너가 보인다', await page.getByText('홈 화면에 추가하기').first().isVisible());
  const body = await page.locator('body').innerText();
  check('시트에 따라 할 단계 3개', ['공유 버튼', '홈 화면에 추가', '추가'].every((t) => body.includes(t)));
  check('Safari 안내 문구', body.includes('Safari에서만'));
  await page.screenshot({ path: `${process.argv[2] ?? (process.env.TMPDIR ?? '/tmp')}/SCR-install-guide.png` });
  await page.getByRole('button', { name: '나중에' }).last().click();
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForTimeout(2500);
  check('두 번째부터는 저절로 열리지 않는다', !(await page.locator('body').innerText()).includes('앱처럼 쓰기'));
  await page.getByRole('button', { name: '안내 닫기' }).last().click();
  await page.waitForTimeout(500);
  check('× 누르면 배너가 사라진다', !(await page.getByText('홈 화면에 추가하기').first().isVisible().catch(() => false)));
  await page.reload();
  await page.waitForTimeout(2500);
  check('새로고침해도 다시 뜨지 않는다', !(await page.getByText('홈 화면에 추가하기').first().isVisible().catch(() => false)));
  await page.goto(`${BASE}/settings`);
  await page.waitForTimeout(1500);
  check('설정에서 다시 열 수 있다', (await page.locator('body').innerText()).includes('홈 화면에 추가하기'));

  // 홈 화면 앱으로 연 경우: 배너가 없어야 한다
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: IPHONE_UA });
  await ctx2.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
  const p2 = await ctx2.newPage();
  p2.on('dialog', (d) => d.accept());
  await p2.goto(`${BASE}/projects`, { timeout: 120000 });
  await p2.waitForTimeout(3000);
  check('홈 화면 앱으로 열면 배너가 없다', !(await p2.getByText('홈 화면에 추가하기').first().isVisible().catch(() => false)));
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 200));
  await page.screenshot({ path: `${process.argv[2] ?? (process.env.TMPDIR ?? '/tmp')}/install-failure.png` });
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
}
