// 대댓글·댓글 수정 E2E: 답글이 원 댓글 밑에 붙고, 내 댓글만 고칠 수 있다.
// 실행 전: 로컬 Supabase, 웹 서버 8098
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

import { signUp } from './signup.mjs';

const BASE = 'http://localhost:8098';
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const stamp = Date.now().toString(36);
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
  const a = await newPage();
  await signUp(a, { base: BASE, email: `cm_${stamp}@example.com`, username: `cm_${stamp}`, displayName: '주인' });
  await a.getByRole('button', { name: '편물 만들기' }).click({ timeout: 60000 });
  await a.getByPlaceholder('예: 회색 라글란 스웨터').fill('댓글 편물');
  await a.getByRole('radio', { name: '전체' }).click();
  await a.getByRole('button', { name: '만들기', exact: true }).click();
  await a.getByRole('button', { name: '사진 찍기' }).click({ timeout: 60000 });
  await a.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
  await a.getByRole('button', { name: '촬영' }).click();
  await a.getByText('1번째 / 1').waitFor({ timeout: 60000 });

  console.log('== 손님이 댓글, 주인이 답글');
  const b = await newPage();
  await signUp(b, { base: BASE, email: `cg_${stamp}@example.com`, username: `cg_${stamp}`, displayName: '손님' });
  await b.goto(`${BASE}/explore`);
  await b.locator('[role="button"]:has(img)').first().click({ timeout: 60000 });
  await b.getByPlaceholder('댓글 달기').fill('실 뭐 쓰셨어요?');
  await b.getByRole('button', { name: '등록' }).click();
  await b.getByText('실 뭐 쓰셨어요?').waitFor({ timeout: 30000 });

  await a.goto(`${BASE}/me`);
  await a.locator('[role="button"]:has(img)').first().click({ timeout: 60000 });
  await a.getByRole('button', { name: '답글' }).first().click({ timeout: 30000 });
  check('답글 안내가 뜬다', await a.getByText('손님님에게 답글').isVisible());
  await a.getByPlaceholder('답글 달기').fill('린넨이에요');
  await a.getByRole('button', { name: '등록' }).click();
  await a.getByText('린넨이에요').waitFor({ timeout: 30000 });

  // 이번 실행에서 만든 게시물의 댓글만 센다 (전에 돌린 검사 데이터가 섞이지 않게)
  const post = sql(`select p.id from posts p join profiles pr on pr.id = p.owner_id where pr.username = 'cm_${stamp}' limit 1`);
  const parents = sql(`select count(*) from comments where post_id = '${post}' and parent_id is null`);
  const replies = sql(`select count(*) from comments where post_id = '${post}' and parent_id is not null`);
  check('답글이 원 댓글에 붙는다', parents === '1' && replies === '1', `${parents}/${replies}`);
  check('답글에는 답글 버튼이 없다', (await a.getByRole('button', { name: '답글' }).count()) === 1);

  console.log('\n== 내 댓글 고치기');
  await a.getByRole('button', { name: '고치기' }).first().click({ timeout: 30000 });
  check('고치는 중 안내', await a.getByText('댓글 고치는 중').isVisible());
  await a.getByPlaceholder('댓글 고치기').fill('린넨 섞인 실이에요');
  await a.getByRole('button', { name: '저장', exact: true }).click();
  await a.getByText('린넨 섞인 실이에요').waitFor({ timeout: 30000 });
  await a.getByText('수정됨', { exact: false }).first().waitFor({ timeout: 15000 });
  check('수정됨 표시', true);

  console.log('\n== 남의 댓글은 못 고친다');
  const buttons = await a.getByRole('button', { name: '고치기' }).count();
  check('고치기는 내 댓글에만', buttons === 1, String(buttons));
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 300));
  await browser.contexts()[0]?.pages()[0]?.screenshot({ path: '/tmp/comments-fail.png' }).catch(() => {});
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
