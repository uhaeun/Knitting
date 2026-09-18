// 공유 창(폰) 저장 E2E: 결과 사진은 JPEG 1개, 성장 영상은 MP4 1개가 공유 창으로 넘어간다.
// 실행 전: 로컬 Supabase, 웹 서버 8098 --clear
import { chromium } from 'playwright';
// 공유 창이 있는 브라우저(폰)를 흉내 낸다: navigator.canShare/share를 가로채 넘겨받은 파일을 기록
const BASE = 'http://localhost:8098'; const stamp = Date.now().toString(36);
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
await ctx.addInitScript(() => { try { localStorage.setItem('knitting.tourSeen', '1'); } catch {} }); // 사용법 안내는 tour.mjs가 따로 본다
await ctx.addInitScript(() => {
  window.__shared = [];
  navigator.canShare = (d) => !!d?.files?.length;
  navigator.share = async (d) => { window.__shared.push(d.files.map((f) => ({ name: f.name, type: f.type, size: f.size }))); };
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
page.on('dialog', async (d) => { console.log('[dialog]', d.message().slice(0, 200)); await d.accept(); });
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); if (!ok) failed += 1; };
try {
  await page.goto(BASE, { timeout: 180000 });
  await page.getByText('계정이 없어요, 가입할게요').click({ timeout: 120000 });
  await page.getByPlaceholder('you@example.com').fill(`sh_${stamp}@example.com`);
  await page.getByPlaceholder('6자 이상').fill('password123');
  await page.getByRole('button', { name: '가입하기' }).click();
  await page.getByPlaceholder('knitter_haeun').fill(`sh_${stamp}`);
  await page.getByPlaceholder('하은').fill('공유');
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.goto(`${BASE}/projects`);
  await page.getByRole('button', { name: '편물 만들기' }).click({ timeout: 30000 });
  await page.getByPlaceholder('예: 회색 라글란 스웨터').fill('공유 스웨터');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  for (const k of [1, 2]) {
    await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 30000 });
    await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
    await page.getByRole('button', { name: '촬영' }).click();
    await page.getByText(`${k}번째 / ${k}`).waitFor({ timeout: 60000 });
  }

  console.log('\n== 결과 사진 → 사진첩에 저장');
  await page.getByRole('button', { name: '결과 사진' }).click();
  const save = page.getByRole('button', { name: '사진첩에 저장' });
  await save.waitFor({ timeout: 30000 });
  check('공유 버튼 따로 없음', (await page.getByRole('button', { name: '공유', exact: true }).count()) === 0);
  // 합성이 끝나면 저장 버튼이 활성화된다
  await page.waitForFunction(() => [...document.querySelectorAll('[role="button"]')].some((b) => b.textContent === '사진첩에 저장' && b.getAttribute('aria-disabled') !== 'true'), null, { timeout: 60000 });
  check('안내 문구', await page.getByText('"이미지 저장"을 누르세요', { exact: false }).isVisible());
  await save.click();
  await page.waitForTimeout(500);
  const img = await page.evaluate(() => window.__shared.at(-1));
  check('공유 창에 JPEG 파일 1개', img?.length === 1 && img[0].type === 'image/jpeg' && img[0].size > 1000, JSON.stringify(img));

  console.log('\n== 영상 → 사진첩에 저장');
  await page.getByRole('button', { name: '뒤로' }).click();
  await page.getByRole('button', { name: '영상 만들기' }).click();
  await page.getByText('영상이 준비됐어요').waitFor({ timeout: 120000 });
  check('영상 안내 문구', await page.getByText('"비디오 저장"을 누르세요', { exact: false }).isVisible());
  await page.getByRole('button', { name: '사진첩에 저장' }).click();
  await page.waitForTimeout(500);
  const vid = await page.evaluate(() => window.__shared.at(-1));
  check('공유 창에 MP4 파일 1개', vid?.length === 1 && vid[0].type === 'video/mp4' && vid[0].size > 1000, JSON.stringify(vid));
} catch (e) {
  failed += 1; console.log('ERROR', e.message.slice(0, 400));
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
}
