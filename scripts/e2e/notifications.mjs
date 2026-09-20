// 소식 E2E: 남이 좋아요·댓글·팔로우하면 내 소식에 쌓이고, 읽으면 배지가 사라진다.
// 실행 전: 로컬 Supabase, 웹 서버 8098
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

import { signUp } from './signup.mjs';

const BASE = 'http://localhost:8098';
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const stamp = Date.now().toString(36);
const owner = { email: `na_${stamp}@example.com`, username: `na_${stamp}`, name: '주인' };
const guest = { email: `nb_${stamp}@example.com`, username: `nb_${stamp}`, name: '손님' };
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };
const sql = (q) => execFileSync('psql', [DB, '-tAc', q]).toString().trim();

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 150)));
  return page;
};

try {
  console.log('== 주인이 공개 기록 한 장');
  const a = await newPage();
  await signUp(a, { base: BASE, email: owner.email, username: owner.username, displayName: owner.name });
  await a.getByRole('button', { name: '편물 만들기' }).click({ timeout: 60000 });
  await a.getByPlaceholder('예: 회색 라글란 스웨터').fill('소식 편물');
  await a.getByRole('radio', { name: '전체' }).click();
  await a.getByRole('button', { name: '만들기', exact: true }).click();
  await a.getByRole('button', { name: '사진 찍기' }).click({ timeout: 60000 });
  await a.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
  await a.getByRole('button', { name: '촬영' }).click();
  await a.getByText('1번째 / 1').waitFor({ timeout: 60000 });

  console.log('\n== 손님이 좋아요·댓글·팔로우');
  const b = await newPage();
  await signUp(b, { base: BASE, email: guest.email, username: guest.username, displayName: guest.name });
  await b.goto(`${BASE}/explore`);
  await b.locator('[role="button"]:has(img)').first().click({ timeout: 60000 });
  await b.getByRole('button', { name: '좋아요' }).click({ timeout: 30000 });
  await b.getByPlaceholder('댓글 달기').fill('예뻐요');
  await b.getByRole('button', { name: '등록' }).click();
  await b.getByText('예뻐요').waitFor({ timeout: 30000 });
  await b.goto(`${BASE}/user/${owner.username}`);
  await b.getByRole('button', { name: '팔로우', exact: true }).click({ timeout: 30000 });
  await b.waitForTimeout(2000);

  const ownerId = sql(`select id from profiles where username = '${owner.username}'`);
  const kinds = sql(`select string_agg(distinct kind::text, ',' order by kind::text) from notifications where user_id = '${ownerId}'`);
  check('좋아요·댓글·팔로우가 모두 쌓인다', kinds === 'comment,follow,like', kinds);
  const self = sql(`select count(*) from notifications where user_id = actor_id`);
  check('내가 한 일은 나에게 안 쌓인다', self === '0', self);

  console.log('\n== 주인 화면의 배지와 소식');
  await a.goto(`${BASE}/`);
  await a.getByText('피드', { exact: true }).first().click({ timeout: 60000 }); // 탭으로 이동
  const bell = a.getByRole('button', { name: '소식' }).first();
  await bell.waitFor({ timeout: 60000 });
  const badge = await bell.textContent();
  check('피드에 안 읽은 수 표시', badge?.includes('3'), badge ?? '');
  await bell.click();
  await a.getByText('님이 내 기록을 좋아해요', { exact: false }).waitFor({ timeout: 30000 });
  check('좋아요 소식', true);
  await a.getByText('님이 댓글을 남겼어요: 예뻐요', { exact: false }).waitFor({ timeout: 15000 });
  check('댓글 소식에 내용까지', true);
  await a.waitForTimeout(2500);
  const unread = sql(`select count(*) from notifications where user_id = '${ownerId}' and read_at is null`);
  check('열면 읽음 처리', unread === '0', unread);

  console.log('\n== 좋아요를 취소하면 소식도 사라진다');
  await b.goto(`${BASE}/explore`);
  await b.locator('[role="button"]:has(img)').first().click({ timeout: 30000 });
  await b.getByRole('button', { name: '좋아요 취소' }).click({ timeout: 30000 });
  await b.waitForTimeout(2000);
  const likes = sql(`select count(*) from notifications where user_id = '${ownerId}' and kind = 'like'`);
  check('좋아요 소식이 지워짐', likes === '0', likes);
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 300));
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
