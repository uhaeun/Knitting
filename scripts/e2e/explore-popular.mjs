// 탐색 인기 E2E: 12개에서 끊기지 않고 더 불러온다. 같은 글이 두 번 나오지 않는다.
// 실행 전: 로컬 Supabase, 웹 서버 8098
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

import { signUp } from './signup.mjs';

const BASE = 'http://localhost:8098';
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const stamp = Date.now().toString(36);
const username = `pop_${stamp}`;
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };
const sql = (q) => execFileSync('psql', [DB, '-tAc', q]).toString().trim();

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
// 12개가 한 화면에 다 들어가면 스크롤이 없어서 '더 보기'가 일어나지 않는다. 일부러 짧은 화면
const ctx = await browser.newContext({ viewport: { width: 390, height: 520 }, permissions: ['camera'] });
await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));

try {
  await signUp(page, { base: BASE, email: `pop_${stamp}@example.com`, username, displayName: '인기' });
  await page.getByRole('button', { name: '편물 만들기' }).click({ timeout: 30000 });
  await page.getByPlaceholder('예: 회색 라글란 스웨터').fill('인기 편물');
  await page.getByRole('radio', { name: '전체' }).click();
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 30000 });
  await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
  await page.getByRole('button', { name: '촬영' }).click();
  await page.getByText('1번째 / 1').waitFor({ timeout: 60000 });

  // 같은 사진 파일을 가리키는 공개 기록 19개를 더 만든다 (촬영을 20번 하면 너무 오래 걸린다)
  const owner = sql(`select id from profiles where username = '${username}'`);
  sql(`insert into posts (project_id, owner_id, media_type, photo_path, thumb_path, width, height, taken_at, visibility, like_count, created_at, updated_at)
       select project_id, owner_id, media_type, photo_path, thumb_path, width, height,
              taken_at - (g || ' minutes')::interval, 'public', (g % 4),
              created_at - (g || ' minutes')::interval, updated_at
       from posts, generate_series(1, 19) g where owner_id = '${owner}'`);
  const mine = Number(sql(`select count(*) from posts where owner_id = '${owner}' and visibility = 'public'`));
  check('공개 기록 20개 준비', mine === 20, String(mine));
  // 탐색은 다른 계정의 공개 글도 함께 보여 준다. 서버에 실제로 보이는 전체 개수를 기준으로 삼는다
  const visible = Number(sql(`select count(*) from posts where visibility = 'public' and deleted_at is null and hidden_at is null`));

  console.log('\n== 인기 탭');
  await page.goto(`${BASE}/explore`);
  await page.getByRole('radio', { name: '인기' }).or(page.getByRole('button', { name: '인기' })).first().click({ timeout: 30000 });
  const cells = page.locator('[role="button"]:has(img)');
  await page.waitForFunction(() => document.querySelectorAll('[role="button"] img').length >= 12, null, { timeout: 60000 });
  const first = await cells.count();
  check('처음에는 12개', first === 12, String(first));

  console.log('\n== 더 불러오기');
  // FlatList는 자기 스크롤 상자를 따로 쓴다. 그 상자를 끝까지 내린다
  // FlatList는 자기 스크롤 상자를 쓴다. 가장 많이 남은 상자를 끝까지 내리고 스크롤 이벤트를 알린다
  const scrollToEnd = () =>
    page.evaluate(() => {
      const boxes = [...document.querySelectorAll('*')]
        .filter((e) => e.scrollHeight - e.clientHeight > 20)
        .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
      const box = boxes[0];
      if (!box) return 'no-scrollbox';
      box.scrollTop = box.scrollHeight;
      box.dispatchEvent(new Event('scroll', { bubbles: true }));
      return `${box.tagName} ${box.scrollTop}/${box.scrollHeight}`;
    });
  // 한 묶음은 12개다. 서버에 있는 만큼(최대 네 묶음)까지 내려 본다.
  // GitHub 러너는 새 서버라 공개 글이 적고, 내 컴퓨터에는 지난 검사 글이 쌓여 있어서 기대값을 고정하면 안 된다
  const target = Math.min(visible, 48);
  const growTo = async (want) => {
    let last = 0;
    for (let i = 0; i < 40; i += 1) {
      await scrollToEnd();
      await page.waitForTimeout(600);
      const now = await cells.count();
      if (now >= want) return true;
      if (now === last && i > 3) return false; // 더 안 늘어나면 끝
      last = now;
    }
    return false;
  };
  check(`${target}개까지 이어 받는다`, await growTo(target), `${await cells.count()} / ${target}`);
  const after = await cells.count();
  check('스크롤하면 더 나온다', after > 12, String(after));

  // 개수가 서버의 공개 글 수와 정확히 같아야 한다 (모자라면 끊긴 것, 넘치면 같은 글이 두 번 나온 것)
  // 정확히 같아야 한다. 모자라면 끊긴 것, 넘치면 같은 글이 두 번 나온 것
  check('개수가 정확히 맞는다', after === target, `화면 ${after} / 목표 ${target} / 서버 ${visible}`);
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 300));
  await page.screenshot({ path: '/tmp/pop-fail.png' }).catch(() => {});
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
