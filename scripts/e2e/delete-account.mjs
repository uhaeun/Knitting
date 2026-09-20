// 계정 삭제 E2E: 사진까지 올린 계정을 지우고, 다시 로그인되지 않는지·자료가 사라졌는지 본다.
// 실행 전: 로컬 Supabase, 웹 서버 8098
import { chromium } from 'playwright';

import { signUp } from './signup.mjs';

const BASE = 'http://localhost:8098';
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const stamp = Date.now().toString(36);
const email = `del_${stamp}@example.com`;
const username = `del_${stamp}`;
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };

// psql로 서버에 정말 남았는지 센다 (화면만 보면 캐시를 볼 수도 있다)
const { execFileSync } = await import('node:child_process');
const count = (sql) => Number(execFileSync('psql', [DB, '-tAc', sql]).toString().trim());
const one = (sql) => execFileSync('psql', [DB, '-tAc', sql]).toString().trim();

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));

try {
  console.log('== 가입하고 기록 남기기');
  await signUp(page, { base: BASE, email: email, username: username, displayName: '삭제' });
  await page.getByRole('button', { name: '편물 만들기' }).click({ timeout: 60000 });
  await page.getByPlaceholder('예: 회색 라글란 스웨터').fill('지울 스웨터');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 30000 });
  await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
  await page.getByRole('button', { name: '촬영' }).click();
  await page.getByText('1번째 / 1').waitFor({ timeout: 60000 });

  const uid = one(`select id from profiles where username = '${username}'`);
  const before = {
    profile: count(`select count(*) from profiles where username = '${username}'`),
    posts: count(`select count(*) from posts p join profiles pr on pr.id = p.owner_id where pr.username = '${username}'`),
    files: count(`select count(*) from storage.objects where bucket_id = 'photos' and name like '${uid}/%'`),
  };
  check('서버에 프로필·기록·파일이 있다', before.profile === 1 && before.posts === 1 && before.files >= 2, JSON.stringify(before));

  console.log('\n== 계정 삭제');
  await page.goto(`${BASE}/settings`);
  await page.getByRole('button', { name: '계정 삭제' }).click({ timeout: 30000 });
  await page.getByText('지우면 되돌릴 수 없어요.').waitFor({ timeout: 15000 });
  const confirm = page.getByRole('button', { name: '계정 지우기' });
  check('아이디를 적기 전에는 못 지운다', (await confirm.getAttribute('aria-disabled')) === 'true');
  await page.getByPlaceholder(username).fill('틀린아이디');
  check('아이디가 틀리면 못 지운다', (await confirm.getAttribute('aria-disabled')) === 'true');
  await page.getByPlaceholder(username).fill(username);
  await confirm.click();
  await page.getByRole('button', { name: '로그인' }).waitFor({ timeout: 60000 });
  check('지우면 로그인 화면으로', true);

  const after = {
    users: count(`select count(*) from auth.users where email = '${email}'`),
    profile: count(`select count(*) from profiles where username = '${username}'`),
    posts: count(`select count(*) from posts where owner_id = '${uid}'`),
    files: count(`select count(*) from storage.objects where bucket_id = 'photos' and name like '${uid}/%'`),
  };
  check('auth 계정이 없다', after.users === 0, JSON.stringify(after));
  check('프로필이 없다', after.profile === 0);
  check('기록이 없다', after.posts === 0);
  check('올린 파일이 저장소에서 사라졌다', after.files === 0);

  console.log('\n== 지운 계정으로 로그인 시도');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('6자 이상').fill('password123');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.getByText('이메일 또는 비밀번호가 맞지 않아요').waitFor({ timeout: 30000 });
  check('다시 로그인되지 않는다', true);
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 300));
  await page.screenshot({ path: '/tmp/del-fail.png' }).catch(() => {});
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
