// 오류 모니터링 E2E: 화면에서 터진 오류가 서버에 남는다. 같은 오류가 쏟아져도 한 번만.
// 실행 전: 로컬 Supabase, 웹 서버 8098
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

import { signUp } from './signup.mjs';

const BASE = 'http://localhost:8098';
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const stamp = Date.now().toString(36);
const mark = `검사오류-${stamp}`;
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed += 1; };
const sql = (q) => execFileSync('psql', [DB, '-tAc', q]).toString().trim();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', () => {}); // 일부러 터뜨리는 검사라 조용히

try {
  await signUp(page, { base: BASE, email: `err_${stamp}@example.com`, username: `err_${stamp}`, displayName: '오류' });

  console.log('== 화면에서 오류를 일부러 터뜨린다');
  await page.evaluate((m) => { setTimeout(() => { throw new Error(m); }, 0); }, mark);
  await page.waitForTimeout(3000);
  const rows = Number(sql(`select count(*) from client_errors where message like '%${mark}%'`));
  check('오류가 서버에 남는다', rows === 1, String(rows));

  const row = sql(`select coalesce(app,'?') || '|' || coalesce(where_at,'?') || '|' || case when user_id is null then '손님' else '로그인' end || '|' || case when stack is null then '스택없음' else '스택있음' end from client_errors where message like '%${mark}%' limit 1`);
  check('어디서·누가·어떤 스택인지 함께', row === 'web|/projects|로그인|스택있음', row);

  console.log('\n== 같은 오류가 쏟아져도');
  for (let i = 0; i < 5; i += 1) {
    await page.evaluate((m) => { setTimeout(() => { throw new Error(m); }, 0); }, mark);
  }
  await page.waitForTimeout(3000);
  const again = Number(sql(`select count(*) from client_errors where message like '%${mark}%'`));
  check('1분 안에는 한 번만 쌓인다', again === 1, String(again));

  console.log('\n== 앱에서는 읽을 수 없다 (대시보드에서만)');
  // 앱이 쓰는 키로 직접 물어봐도 빈 목록이어야 한다 (읽기 정책이 없으니 RLS가 다 걸러낸다)
  const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
  if (!anonKey) {
    console.log('SKIP 읽기 권한 검사 (SUPABASE_ANON_KEY 없음)');
  } else {
    const seen = await page.evaluate(async (key) => {
      const res = await fetch('http://127.0.0.1:54321/rest/v1/client_errors?select=id&limit=5', {
        headers: { apikey: key },
      }).catch(() => null);
      if (!res) return -1;
      const body = await res.json().catch(() => []);
      return Array.isArray(body) ? body.length : -1;
    }, anonKey);
    check('앱 키로는 한 줄도 못 읽는다', seen === 0, String(seen));
  }
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 300));
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
