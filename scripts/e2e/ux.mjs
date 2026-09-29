// UX 개선 E2E: 앱 안 대화상자(번호 입력 없음), 카드 '찍기' 바로가기, 촬영 버튼 편물 고르기, 겉뜨기 코 눌러 이동.
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
  await signUp(page, { base: BASE, email: `ux_${stamp}@example.com`, username: `ux_${stamp}`, displayName: '편의' });
  await page.waitForTimeout(2000);

  // 저장된 세션으로 앱을 새로 열면 목록으로, 이후 피드 탭은 그대로 유지한다.
  await page.goto(`${BASE}/`);
  await page.getByText('내 편물', { exact: true }).waitFor();
  check('첫 진입은 편물 목록', new URL(page.url()).pathname === '/projects');
  await page.getByRole('tab', { name: '피드', exact: true }).click();
  await page.getByText('아직 볼 게 없어요', { exact: true }).waitFor();
  check('피드 탭에서 목록으로 다시 튕기지 않는다', new URL(page.url()).pathname === '/');
  await page.goto(`${BASE}/projects`);

  // 빈 계정의 촬영 탭은 생성 창을 연다. 취소 후 다시 열 수 있어야 한다.
  await page.getByRole('button', { name: '촬영', exact: true }).click();
  const projectName = page.getByPlaceholder('예: 회색 라글란 스웨터');
  await projectName.waitFor();
  await page.getByLabel('닫기', { exact: true }).click({ position: { x: 5, y: 5 } });
  await projectName.waitFor({ state: 'hidden' });
  check('취소하면 생성 요청 주소도 지운다', !new URL(page.url()).searchParams.has('create'));
  await page.getByRole('button', { name: '촬영', exact: true }).click();
  await projectName.fill('모자');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await page.getByRole('button', { name: '사진 찍기' }).waitFor();
  check('촬영 탭에서 다시 열어 첫 편물 생성', true);
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
  const projectUrl = page.url();
  await page.reload();
  await page.getByText('2번째 / 2').waitFor({ timeout: 30000 });
  check('상세 직접 진입은 목록으로 바뀌지 않고 마지막 기록을 표시', page.url() === projectUrl);
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
  failed += 1; console.log('ERROR', e.message); console.log('URL', page.url()); await page.screenshot({ path: process.env.SHOT ?? '/tmp/ux-fail.png' });
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
