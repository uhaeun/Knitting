// 프로필 사진 E2E: 앨범에서 고른 사진이 올라가고, 나·피드에 동그라미로 보인다. 지우면 첫 글자로 돌아간다.
// 실행 전: 로컬 Supabase, 웹 서버 8098
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

import { signUp } from './signup.mjs';

const BASE = 'http://localhost:8098';
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const stamp = Date.now().toString(36);
const username = `ava_${stamp}`;
const dir = mkdtempSync(join(tmpdir(), 'knit-ava-'));
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };
const sql = (q) => execFileSync('psql', [DB, '-tAc', q]).toString().trim();

// 올릴 사진 한 장 만들기 (세로로 긴 그림 → 정사각으로 잘려야 한다)
const photo = join(dir, 'me.jpg');
execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=600x900:duration=1:rate=1', '-frames:v', '1', photo], { stdio: 'ignore' });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));

try {
  await signUp(page, { base: BASE, email: `ava_${stamp}@example.com`, username, displayName: '사진사' });

  console.log('== 사진 넣기');
  await page.goto(`${BASE}/me`);
  await page.getByRole('button', { name: '프로필 편집' }).click({ timeout: 30000 });
  await page.getByText('사진 넣기').waitFor({ timeout: 15000 });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 30000 }),
    page.getByText('사진 넣기').click(),
  ]);
  await chooser.setFiles(photo);
  await page.getByText('사진 바꾸기').waitFor({ timeout: 60000 });
  check('올리면 "사진 바꾸기"로 바뀐다', true);

  const path = sql(`select coalesce(avatar_path, '') from profiles where username = '${username}'`);
  check('프로필에 사진 경로 저장', path.startsWith(sql(`select id from profiles where username = '${username}'`)), path);
  const objects = sql(`select count(*) from storage.objects where bucket_id = 'avatars' and name = '${path}'`);
  check('저장소에 파일이 있다', objects === '1', objects);

  console.log('\n== 화면에 보인다');
  await page.getByRole('button', { name: '닫기' }).click().catch(() => {});
  await page.reload();
  const img = page.locator('img[src*="/avatars/"]').first();
  await img.waitFor({ timeout: 60000 });
  check('나 탭에 사진', true);
  const box = await img.boundingBox();
  check('동그라미가 찌그러지지 않는다', !!box && Math.abs(box.width - box.height) <= 1, JSON.stringify(box));

  console.log('\n== 지우면 첫 글자로');
  await page.getByRole('button', { name: '프로필 편집' }).click();
  await page.getByText('사진 지우기').click();
  await page.getByText('사진 넣기').waitFor({ timeout: 30000 });
  const cleared = sql(`select coalesce(avatar_path, 'null') from profiles where username = '${username}'`);
  check('프로필에서 사진이 빠진다', cleared === 'null', cleared);
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 300));
  await page.screenshot({ path: '/tmp/ava-fail.png' }).catch(() => {});
} finally {
  rmSync(dir, { recursive: true, force: true });
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
