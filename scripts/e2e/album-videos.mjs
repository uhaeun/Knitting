// 앨범 영상 여러 편 한 번에 올리기 E2E: 2편을 고르면 둘 다 5초 이하 영상 기록으로 쌓인다.
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
const username = `vid_${stamp}`;
const dir = mkdtempSync(join(tmpdir(), 'knit-vids-'));
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };
const sql = (q) => execFileSync('psql', [DB, '-tAc', q]).toString().trim();

// 3초짜리와 8초짜리 (긴 쪽은 앞 5초만 저장돼야 한다)
for (const [name, dur] of [['a.mp4', 3], ['b.mp4', 8]]) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=green:s=640x640:r=30:d=${dur}`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(dir, name)], { stdio: 'ignore' });
}

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));

try {
  await signUp(page, { base: BASE, email: `vid_${stamp}@example.com`, username, displayName: '영상여럿' });
  await page.getByRole('button', { name: '편물 만들기' }).click({ timeout: 60000 });
  await page.getByPlaceholder('예: 회색 라글란 스웨터').fill('영상 편물');
  await page.getByRole('button', { name: '만들기', exact: true }).click();

  console.log('== 영상 2편 한 번에');
  await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 60000 });
  await page.getByRole('radio', { name: '영상' }).click({ timeout: 30000 });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 30000 }),
    page.getByRole('button', { name: '앨범에서 가져오기' }).click(),
  ]);
  check('영상도 여러 편 고를 수 있다', chooser.isMultiple());
  await chooser.setFiles([join(dir, 'a.mp4'), join(dir, 'b.mp4')]);
  await page.getByText('2번째 / 2').waitFor({ timeout: 180000 });
  check('2편이 쌓인다', true);

  const owner = sql(`select id from profiles where username = '${username}'`);
  const rows = sql(`select string_agg(media_type || ':' || duration_ms, ',' order by created_at) from posts where owner_id = '${owner}'`);
  check('둘 다 영상 기록', (rows.match(/video/g) ?? []).length === 2, rows);
  const longest = Number(sql(`select max(duration_ms) from posts where owner_id = '${owner}'`));
  check('긴 영상은 5초로 잘림', longest <= 5000, String(longest));
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 300));
  await page.screenshot({ path: '/tmp/vids-fail.png' }).catch(() => {});
} finally {
  rmSync(dir, { recursive: true, force: true });
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
