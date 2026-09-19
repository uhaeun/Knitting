// 첫 사용 안내 E2E: 가입 직후 3단계가 뜨고, 끝내면 홈 화면 추가 안내로 이어지고, 다시 뜨지 않는다.
// 실행 전: 로컬 Supabase, 웹 서버 8098 --clear
import { chromium } from 'playwright';
const BASE = 'http://localhost:8098';
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };
const browser = await chromium.launch();
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
const stamp = Date.now().toString(36);
try {
  await page.goto(BASE, { timeout: 180000 });
  await page.getByText('계정이 없어요, 가입할게요').click({ timeout: 120000 });
  await page.getByPlaceholder('you@example.com').fill(`tour_${stamp}@example.com`);
  await page.getByPlaceholder('6자 이상').fill('password123');
  await page.getByRole('button', { name: '가입하기' }).click();
  await page.getByPlaceholder('knitter_haeun').fill(`tour_${stamp}`);
  await page.getByPlaceholder('하은').fill('안내');
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.waitForTimeout(3000);
  const t1 = await page.locator('body').innerText();
  check('가입 직후 사용법이 뜬다', t1.includes('닛팅 쓰는 법') && t1.includes('같은 각도로 찍어요'));
  await page.getByRole('button', { name: '다음' }).last().click();
  await page.waitForTimeout(600);
  check('2단계: 쉬어도 괜찮다', (await page.locator('body').innerText()).includes('며칠 쉬어도 괜찮아요'));
  await page.getByRole('button', { name: '다음' }).last().click();
  await page.waitForTimeout(600);
  const t3 = await page.locator('body').innerText();
  check('3단계: 결과물', t3.includes('쌓이면 결과가 나와요') && t3.includes('시작하기'));
  await page.getByRole('button', { name: '시작하기' }).last().click();
  await page.waitForTimeout(1500);
  check('닫으면 홈 화면 추가 안내로 이어진다', (await page.locator('body').innerText()).includes('앱처럼 쓰기'));
  await page.getByRole('button', { name: '나중에' }).last().click();
  await page.reload();
  await page.waitForTimeout(3000);
  check('새로고침해도 사용법이 다시 뜨지 않는다', !(await page.locator('body').innerText()).includes('닛팅 쓰는 법'));

  // 탭 선택 표시는 눈으로 확인한다 (스크린샷). 선택자로는 안정적으로 못 집는다
  await page.goto(`${BASE}/explore`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${process.argv[2] ?? (process.env.TMPDIR ?? '/tmp')}/tabs.png` });
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 200));
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
}
