// PR #20~24 통합 회귀. 실제 UI로 촬영·위치 조정·피드 발행·숨김·영상 옵션을 확인한다.
// 로컬 Supabase만 사용한다. DB 조회는 테스트 결과 확인용이다.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { signUp } from './signup.mjs';

const BASE = 'http://localhost:8098';
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const stamp = Date.now().toString(36);
const username = `rel_${stamp}`;
const sql = (q) => execFileSync('psql', [DB, '-X', '-v', 'ON_ERROR_STOP=1', '-tAc', q], { encoding: 'utf8' }).trim();
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
  await ctx.addInitScript(() => localStorage.setItem('knitting.tourSeen', '1'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  return page;
};
const a = await newPage();
const choose = (page, label) => page.getByRole('alert').getByRole('button', { name: label, exact: true }).click();
try {
  await signUp(a, { base: BASE, email: `${username}@example.com`, username, displayName: '병합 QA' });
  await a.getByRole('button', { name: '편물 만들기' }).click();
  await a.getByPlaceholder('예: 회색 라글란 스웨터').fill('병합 시험 편물');
  await a.getByRole('radio', { name: '전체', exact: true }).click();
  await a.getByRole('button', { name: '만들기', exact: true }).click();
  for (const k of [1, 2, 3]) {
    await a.getByRole('button', { name: '사진 찍기' }).click({ timeout: 60000 });
    await a.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0);
    if (k === 1) {
      await a.getByRole('button', { name: '확대', exact: true }).click();
      assert.equal(await a.getByText('1.5x', { exact: true }).count(), 1);
    }
    await a.getByRole('button', { name: '촬영', exact: true }).click();
    await a.getByText(`${k}번째 / ${k}`).waitFor({ timeout: 60000 });
  }
  const projectUrl = a.url();
  const ownerId = sql(`select id from profiles where username = '${username}'`);
  const pid = sql(`select id from projects where owner_id = '${ownerId}' order by created_at desc limit 1`);
  console.log('PASS 확대 촬영과 연속 기록 저장');

  await a.getByRole('button', { name: '결과 사진', exact: true }).click();
  const publish = a.getByRole('button', { name: '피드에 올리기', exact: true });
  await a.waitForFunction(() => [...document.querySelectorAll('[role="button"]')].some(b => b.textContent === '피드에 올리기' && b.getAttribute('aria-disabled') !== 'true'), null, { timeout: 90000 });
  const preview = a.getByRole('img', { name: '결과 사진 미리보기', exact: true });
  const before = await preview.getAttribute('src');
  const panel = a.getByLabel('3분할 사진 위치 조정').first();
  await panel.click();
  const rect = await panel.boundingBox();
  assert.ok(rect);
  await a.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await a.mouse.down();
  await a.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2 + 25, { steps: 5 });
  await a.mouse.up();
  await a.waitForFunction(old => document.querySelector('img[aria-label="결과 사진 미리보기"]')?.src !== old, before);
  await a.waitForFunction(() => [...document.querySelectorAll('[role="button"]')].some(b => b.textContent === '피드에 올리기' && b.getAttribute('aria-disabled') !== 'true'));
  assert.equal(await a.getByLabel('3분할 사진 위치 조정').locator('img').count(), 0, '합성된 날짜 라벨을 조정용 이미지가 덮지 않는다');
  await a.screenshot({ path: '/tmp/knitting-release-result.png' });
  console.log('PASS 3분할 위치 변경 후 재합성');
  await publish.click();
  await a.getByText('피드에 올렸어요', { exact: true }).waitFor({ timeout: 60000 });
  await choose(a, '확인');
  assert.equal(sql(`select count(*) from results where owner_id = '${ownerId}'`), '1');
  console.log('PASS 결과물 업로드·발행');

  await a.goto(projectUrl);
  await a.getByRole('button', { name: '더 보기', exact: true }).click({ timeout: 60000 });
  await choose(a, '일상 사진 남에게 숨기기 (결과물만 보이게)');
  await a.getByText('일상 사진 숨김', { exact: false }).waitFor();
  const b = await newPage();
  await signUp(b, { base: BASE, email: `guest_${stamp}@example.com`, username: `g_${stamp}`, displayName: '팔로워 QA' });
  await b.goto(`${BASE}/user/${username}`);
  await b.getByRole('button', { name: '팔로우', exact: true }).click({ timeout: 60000 });
  await b.getByRole('button', { name: '팔로잉', exact: true }).waitFor({ timeout: 30000 });
  await b.goto(`${BASE}/projects`);
  await b.getByRole('tab', { name: '피드', exact: true }).click();
  await b.getByRole('button', { name: '병합 QA의 결과물', exact: true }).waitFor({ timeout: 30000 });
  await b.getByRole('button', { name: '병합 QA의 결과물', exact: true }).click();
  await b.getByRole('img', { name: '결과물', exact: true }).waitFor();
  console.log('PASS 일상 사진이 없어도 팔로워 피드에 결과물 표시·열기');

  await a.getByRole('button', { name: '영상 만들기', exact: true }).click();
  await choose(a, '1초씩');
  await choose(a, '부드럽게 (페이드)');
  await a.getByText('영상이 준비됐어요', { exact: true }).waitFor({ timeout: 120000 });
  await a.getByText('4.0초 · 120프레임', { exact: false }).waitFor();
  console.log('PASS 유지 시간 1초·페이드 영상 생성');
  console.log('RESULT: PASS');
} catch (e) {
  console.error('ERROR', e.message);
  await a.screenshot({ path: '/tmp/knitting-release-fail.png' }).catch(() => {});
  console.log('RESULT: FAIL');
  process.exitCode = 1;
} finally {
  await browser.close();
  // 숨김 설정을 한 시험 기록이 다음 탐색 검사에 남지 않도록 계정과 종속 데이터를 정리한다.
  sql(`delete from auth.users where email in ('${username}@example.com', 'guest_${stamp}@example.com')`);
}
