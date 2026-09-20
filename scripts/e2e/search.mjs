// 검색 E2E: 사람 · 편물 이름 · 메모(#태그)를 한 번에 찾는다. 비공개 편물은 남에게 안 걸린다.
// 실행 전: 로컬 Supabase, 웹 서버 8098
import { chromium } from 'playwright';

import { signUp } from './signup.mjs';

const BASE = 'http://localhost:8098';
const stamp = Date.now().toString(36);
const word = `털실${stamp.slice(-4)}`; // 이번 실행에만 쓰는 낱말
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
const shoot = async (page, n) => {
  await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 60000 });
  await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
  await page.getByRole('button', { name: '촬영' }).click();
  await page.getByText(`${n}번째 / ${n}`).waitFor({ timeout: 60000 });
};

try {
  console.log('== 공개 편물 + 메모, 비공개 편물 하나');
  const a = await newPage();
  await signUp(a, { base: BASE, email: `se_${stamp}@example.com`, username: `se_${stamp}`, displayName: `검색${stamp.slice(-3)}` });
  await a.getByRole('button', { name: '편물 만들기' }).click({ timeout: 60000 });
  await a.getByPlaceholder('예: 회색 라글란 스웨터').fill(`${word} 스웨터`);
  await a.getByRole('radio', { name: '전체' }).click();
  await a.getByRole('button', { name: '만들기', exact: true }).click();
  await shoot(a, 1);
  await a.getByRole('button', { name: '메모 추가' }).click({ timeout: 30000 });
  await a.getByRole('textbox', { name: '메모', exact: true }).fill(`#${word} 오늘 소매 시작`);
  await a.getByRole('button', { name: '저장', exact: true }).click();
  await a.waitForTimeout(1500);

  await a.goto(`${BASE}/projects`);
  // 편물이 하나라도 있으면 목록 화면의 버튼은 '편물 추가'다
  await a.getByRole('button', { name: '편물 추가' }).click({ timeout: 60000 });
  await a.getByPlaceholder('예: 회색 라글란 스웨터').fill(`${word} 비밀 목도리`);
  await a.getByRole('button', { name: '만들기', exact: true }).click();
  await shoot(a, 1);

  console.log('\n== 남이 검색하면');
  const b = await newPage();
  await signUp(b, { base: BASE, email: `sb_${stamp}@example.com`, username: `sb_${stamp}`, displayName: '검색손님' });
  await b.goto(`${BASE}/explore`);
  await b.getByLabel('검색').fill(word);
  await b.getByText('편물', { exact: true }).waitFor({ timeout: 30000 });
  await b.getByText(`${word} 스웨터`).first().waitFor({ timeout: 30000 });
  check('편물 이름으로 찾힌다', true);
  check('비공개 편물은 안 나온다', (await b.getByText(`${word} 비밀 목도리`).count()) === 0);

  console.log('\n== 해시태그로 찾기');
  await b.getByLabel('검색').fill(`#${word}`);
  await b.getByText('메모', { exact: true }).waitFor({ timeout: 30000 });
  check('메모 안의 태그로 찾힌다', await b.getByText(`#${word} 오늘 소매 시작`).first().isVisible());

  console.log('\n== 사람도 그대로');
  await b.getByLabel('검색').fill(`검색${stamp.slice(-3)}`);
  await b.getByText('사람', { exact: true }).waitFor({ timeout: 30000 });
  check('이름으로 사람 찾기', await b.getByText(`@se_${stamp}`).first().isVisible());

  await b.getByLabel('검색').fill('없을낱말zzz');
  await b.getByText('검색 결과가 없어요').waitFor({ timeout: 30000 });
  check('없으면 없다고 알려 준다', true);
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 300));
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
