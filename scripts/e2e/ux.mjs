// UX 개선 E2E: 앱 안 대화상자(번호 입력 없음), 카드 '찍기' 바로가기, 촬영 버튼 편물 고르기, 겉뜨기 코 눌러 이동.
// 실행 전: 로컬 Supabase, 웹 서버 8098 --clear
import { chromium } from 'playwright';

const BASE = 'http://localhost:8098';
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} });
const page = await ctx.newPage();
let browserDialogs = 0;
page.on('dialog', (d) => { browserDialogs += 1; void d.dismiss(); });
const stamp = Date.now().toString(36);
const body = () => page.locator('body').innerText();
const makeProject = async (name) => {
  await page.goto(`${BASE}/projects`);
  await page.getByRole('button', { name: '편물 추가' }).click({ timeout: 30000 });
  await page.getByPlaceholder('예: 회색 라글란 스웨터').fill(name);
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await page.waitForTimeout(1500);
};
const shoot = async (n) => {
  await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
  await page.getByRole('button', { name: '촬영' }).last().click();
  await page.getByText(`${n}번째 / ${n}`).waitFor({ timeout: 60000 });
};
try {
  await page.goto(BASE, { timeout: 180000 });
  await page.getByText('계정이 없어요, 가입할게요').click({ timeout: 120000 });
  await page.getByPlaceholder('you@example.com').fill(`ux_${stamp}@example.com`);
  await page.getByPlaceholder('6자 이상').fill('password123');
  await page.getByRole('button', { name: '가입하기' }).click();
  await page.getByPlaceholder('knitter_haeun').fill(`ux_${stamp}`);
  await page.getByPlaceholder('하은').fill('편의');
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.waitForTimeout(2000);

  await makeProject('모자');
  await makeProject('장갑');
  await page.goto(`${BASE}/projects`);
  await page.waitForTimeout(1500);

  // 2) 카드 찍기 바로가기
  await page.getByRole('button', { name: '장갑 찍기', exact: true }).click();
  await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
  check("카드 '찍기'로 바로 장갑 촬영 화면", (await body()).includes('장갑 · 첫 장'));
  await page.getByRole('button', { name: '촬영' }).last().click();
  await page.waitForTimeout(4000);
  check('찍고 나면 목록으로 돌아와 기록이 늘어 있다', (await body()).includes('기록 1개'));

  // 4) 장갑 화면에서 한 장 더 찍고 코를 눌러 첫 기록으로
  await page.getByText('장갑', { exact: true }).click();
  await page.getByText('1번째 / 1').waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: '사진 찍기' }).click();
  await shoot(2);
  await page.getByRole('button', { name: '1번째 기록' }).click();
  await page.waitForTimeout(500);
  check('겉뜨기 코를 누르면 그 기록으로', (await body()).includes('1번째 / 2'));

  // 1) 편물 ⋯ 메뉴가 앱 안 시트로 뜬다 (번호 입력 없음)
  await page.getByRole('button', { name: '더 보기' }).click();
  await page.waitForTimeout(600);
  const menu = await body();
  check('⋯ 메뉴가 앱 안 시트', menu.includes('공개 범위 바꾸기') && menu.includes('편물 삭제') && !menu.includes('번호를 입력'));
  await page.getByRole('button', { name: '공개 범위 바꾸기' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: '전체 공개' }).click();
  await page.waitForTimeout(1500);
  check('공개 범위를 버튼으로 바꾼다', (await body()).includes('전체 공개'));

  // 3) 가운데 촬영 버튼: 편물이 둘이면 고르기
  await page.goto(`${BASE}/projects`);
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '촬영' }).first().click();
  await page.waitForTimeout(600);
  const pick = await body();
  check('촬영 버튼: 어느 편물인지 고른다', pick.includes('어느 편물을 찍을까요?') && pick.includes('모자') && pick.includes('장갑'));
  await page.getByRole('button', { name: '모자' }).last().click();
  await page.waitForTimeout(2000);
  check('고른 편물의 촬영 화면으로', (await body()).includes('모자'));

  check('브라우저 기본 대화상자가 한 번도 안 떴다', browserDialogs === 0, String(browserDialogs));
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 200)); console.log('URL', page.url()); await page.screenshot({ path: process.env.SHOT ?? '/tmp/ux-fail.png' });
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
