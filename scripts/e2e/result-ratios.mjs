// 결과 사진 비율 E2E: 3분할은 4:5·9:16만, 전체는 네 비율 모두. 내려받아 크기를 확인한다.
// 실행 전: 로컬 Supabase, 웹 서버 8098 --clear. 필요한 명령: ffprobe
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

import { signUp } from './signup.mjs';

const BASE = 'http://localhost:8098';
const dir = mkdtempSync(join(tmpdir(), 'knit-ratio-'));
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };
const size = (f) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).toString().trim();

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'], acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
const stamp = Date.now().toString(36);
try {
  await signUp(page, { base: BASE, email: `ratio_${stamp}@example.com`, username: `ratio_${stamp}`, displayName: '비율' });
  await page.goto(`${BASE}/projects`);
  await page.getByRole('button', { name: '편물 만들기' }).first().click({ timeout: 30000 });
  await page.getByPlaceholder('예: 회색 라글란 스웨터').fill('비율 스웨터');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  for (const k of [1, 2, 3]) {
    await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 30000 });
    await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
    await page.getByRole('button', { name: '촬영' }).click();
    await page.getByText(`${k}번째 / ${k}`).waitFor({ timeout: 60000 });
  }
  await page.getByRole('button', { name: '결과 사진' }).click();
  await page.getByRole('radio', { name: '9:16' }).waitFor({ timeout: 30000 });
  check('3분할 기본 비율 9:16', (await page.getByRole('radio', { name: '9:16' }).getAttribute('aria-checked')) === 'true');
  check('3분할에는 정사각·16:9 없음', (await page.getByRole('radio', { name: '정사각' }).count()) === 0 && (await page.getByRole('radio', { name: '16:9' }).count()) === 0);
  const cases = [['3분할', '4:5', '1080,1350'], ['3분할', '9:16', '1080,1920'], ['전체', '정사각', '1080,1080'], ['전체', '16:9', '1920,1080']];
  for (const [kind, label, want] of cases) {
    await page.getByRole('radio', { name: kind }).click();
    await page.getByRole('radio', { name: label }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('[role="button"]')].some((b) => b.textContent === '파일로 저장' && b.getAttribute('aria-disabled') !== 'true'), null, { timeout: 60000 });
    await page.waitForTimeout(400);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '파일로 저장' }).click()]);
    const f = join(dir, dl.suggestedFilename());
    await dl.saveAs(f);
    check(`${kind} ${label} ${want.replace(',', '×')}`, size(f) === want, `${dl.suggestedFilename()} ${size(f)}`);
    await page.screenshot({ path: join(process.argv[2] ?? dir, `ratio-${kind}-${label.replace(':', 'x')}.png`) });
  }
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 200));
} finally {
  if (!process.env.KEEP_TMP) rmSync(dir, { recursive: true, force: true });
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
