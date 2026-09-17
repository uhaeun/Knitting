// 영상 기록 3~5단계 E2E: 타임라인·상세 재생, 섞인 결과 MP4, 영상 섞인 성장 영상.
// 실행 전: 로컬 Supabase(0001~0005), 웹 서버 8098 --clear. SUPABASE_SERVICE_KEY 필요 없음 (파일은 브라우저가 내려받는다)
// 필요한 명령: psql, ffmpeg, ffprobe
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = 'http://localhost:8098';
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const dir = mkdtempSync(join(tmpdir(), 'knit-results-'));
const run = (cmd, args) => execFileSync(cmd, args, { maxBuffer: 64 * 1024 * 1024 });
const sql = (q) => run('psql', [DB, '-Atc', q]).toString().trim();
let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
  if (!ok) failed += 1;
};
const probe = (file) => {
  const j = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate:format=duration', '-of', 'json', file]).toString());
  const v = j.streams.find((s) => s.codec_type === 'video');
  return { v, duration: Number(j.format.duration) };
};

// 움직이는 화면 (영상 칸이 실제로 재생되는지·마지막 1초가 멈추는지 보려고)
run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=30:d=8', '-pix_fmt', 'yuv420p', join(dir, 'cam.y4m')]);
/** 두 프레임(번호)의 PSNR dB. 같은 화면이면 매우 높고(inf), 움직였으면 낮다. H.264 재인코딩 오차를 견디려고 해시 대신 쓴다 */
const psnr = (file, a, b) => {
  const pick = (i, n) => `[${n}]trim=start_frame=${i}:end_frame=${i + 1},setpts=PTS-STARTPTS[f${n}]`;
  const r = spawnSync('ffmpeg', ['-i', file, '-i', file, '-lavfi', `${pick(a, 0)};${pick(b, 1)};[f0][f1]psnr`, '-f', 'null', '-']);
  const m = /average:(inf|[\d.]+)/.exec(r.stderr.toString());
  return m ? (m[1] === 'inf' ? Infinity : Number(m[1])) : NaN;
};

const browser = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${join(dir, 'cam.y4m')}`],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'], acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('dialog', async (d) => { console.log('[dialog]', d.message()); await d.accept(); });
const stamp = Date.now().toString(36);
const email = `res_${stamp}@example.com`;

const waitCamera = () => page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
const shootPhoto = async (n) => {
  await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 30000 });
  await page.getByRole('radio', { name: '사진' }).click();
  await waitCamera();
  await page.getByRole('button', { name: '촬영' }).click();
  await page.getByText(`${n} / ${n}`).waitFor({ timeout: 60000 });
};
const download = async (buttonName, name) => {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.getByRole('button', { name: buttonName }).click()]);
  const file = join(dir, name);
  await dl.saveAs(file);
  return file;
};

try {
  await page.goto(BASE, { timeout: 180000 });
  await page.getByText('계정이 없어요, 가입할게요').click({ timeout: 120000 });
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('6자 이상').fill('password123');
  await page.getByRole('button', { name: '가입하기' }).click();
  await page.getByPlaceholder('knitter_haeun').fill(`res_${stamp}`);
  await page.getByPlaceholder('하은').fill('결과');
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.goto(`${BASE}/projects`);
  await page.getByRole('button', { name: '편물 만들기' }).click({ timeout: 30000 });
  await page.getByPlaceholder('예: 회색 라글란 스웨터').fill('섞인 스웨터');
  await page.getByRole('button', { name: '만들기', exact: true }).click();

  console.log('\n== 사진 2장 + 영상 1개');
  await shootPhoto(1);
  await shootPhoto(2);
  await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 30000 });
  await page.getByRole('radio', { name: '영상' }).click();
  await waitCamera();
  await page.getByRole('button', { name: '녹화', exact: true }).click();
  await page.waitForTimeout(3200);
  await page.getByRole('button', { name: '녹화 끝' }).click();
  await page.getByText('3 / 3').waitFor({ timeout: 120000 });
  const owner = sql(`select id from auth.users where email = '${email}'`);
  const [videoPostId, clipMs] = sql(`select id || '|' || duration_ms from posts where owner_id = '${owner}' and media_type = 'video'`).split('|');

  console.log('\n== 타임라인 재생');
  const playingLabel = () => [...document.querySelectorAll('video')].some((x) => x.getAttribute('aria-label') === '영상 기록' && x.currentTime > 0.3);
  await page.waitForFunction(playingLabel, null, { timeout: 15000 }).catch(() => {});
  const tl = await page.evaluate(() => {
    const v = [...document.querySelectorAll('video')].find((x) => x.getAttribute('aria-label') === '영상 기록');
    return v ? { playing: v.currentTime > 0.3, muted: v.muted, loop: v.loop, poster: !!v.getAttribute('poster') } : null;
  });
  check('타임라인 영상 자동 재생 (소리 없음·반복·포스터)', !!tl && tl.playing && tl.muted && tl.loop && tl.poster, JSON.stringify(tl));
  check('타임라인 ▶ 길이 배지', await page.getByText(/^▶ 0:0\d$/).isVisible());

  console.log('\n== 게시물 상세 재생');
  await page.goto(`${BASE}/post/${videoPostId}`);
  const detail = await page.waitForFunction(playingLabel, null, { timeout: 15000 }).then(() => true, () => false);
  check('게시물 상세 영상 재생', detail);
  await page.goBack();

  console.log('\n== 결과: 3분할 (사진·사진·영상) → MP4');
  await page.goto(`${BASE}/projects`);
  await page.getByText('섞인 스웨터').click();
  await page.getByRole('button', { name: '결과 사진' }).click();
  await page.getByRole('radio', { name: '3분할' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[role="button"]')].some((b) => b.textContent === '파일로 저장' && b.getAttribute('aria-disabled') !== 'true'), null, { timeout: 180000 });
  const triple = await download('파일로 저장', 'triple.mp4');
  const t = probe(triple);
  check('3분할 MP4 1080×1080 h264 30fps', t.v?.width === 1080 && t.v?.height === 1080 && t.v?.codec_name === 'h264' && t.v?.r_frame_rate === '30/1', JSON.stringify(t.v));
  check('3분할 길이 = 영상 길이', Math.abs(t.duration * 1000 - Number(clipMs)) < 150, `${t.duration}s vs ${clipMs}ms`);
  check('미리보기가 영상', await page.evaluate(() => [...document.querySelectorAll('video')].some((x) => x.getAttribute('aria-label') === '결과 영상 미리보기')));

  console.log('\n== 결과: 전체 1장이 영상이면 MP4, 전후도 MP4');
  await page.getByRole('radio', { name: '전체' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[role="button"]')].some((b) => b.textContent === '파일로 저장' && b.getAttribute('aria-disabled') !== 'true'), null, { timeout: 180000 });
  const single = probe(await download('파일로 저장', 'single.mp4'));
  check('전체(최근 기록 = 영상) MP4', single.v?.codec_name === 'h264' && single.v?.width === 1080, JSON.stringify(single.v));
  await page.getByRole('radio', { name: '전후' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[role="button"]')].some((b) => b.textContent === '파일로 저장' && b.getAttribute('aria-disabled') !== 'true'), null, { timeout: 180000 });
  const ba = probe(await download('파일로 저장', 'beforeAfter.mp4'));
  check('전후 MP4', ba.v?.codec_name === 'h264' && ba.v?.width === 1080, JSON.stringify(ba.v));

  console.log('\n== 성장 영상 (사진 500ms × 2 + 영상 + 마지막 1초)');
  await page.getByRole('button', { name: '뒤로' }).click();
  await page.getByRole('button', { name: '영상 만들기' }).click();
  await page.getByText('영상이 준비됐어요').waitFor({ timeout: 180000 });
  const growth = probe(await download('파일로 저장', 'growth.mp4'));
  const expected = 500 + 500 + Number(clipMs) + 1000;
  check('성장 영상 1080 h264 30fps', growth.v?.width === 1080 && growth.v?.codec_name === 'h264' && growth.v?.r_frame_rate === '30/1', JSON.stringify(growth.v));
  check('성장 영상 길이 = 구간 계산', Math.abs(growth.duration * 1000 - expected) < 150, `${growth.duration}s vs ${expected}ms`);
  const growthFile = join(dir, 'growth.mp4');
  const frames = Math.round((expected * 30) / 1000);
  const moving = psnr(growthFile, 35, 65); // 사진 2장(1초, 30프레임) 뒤 클립 안의 1초 간격
  const frozen = psnr(growthFile, frames - 29, frames - 1); // 마지막 1초의 처음과 끝
  check('성장 영상 속 클립이 움직인다', moving < 30, `PSNR ${moving}dB`);
  check('성장 영상 마지막 1초는 멈춘 화면', frozen > 35, `PSNR ${frozen}dB`);
} catch (e) {
  failed += 1;
  console.log('ERROR', e.message);
  await page.screenshot({ path: join(dir, 'failure.png') });
  console.log('스크린샷:', join(dir, 'failure.png'));
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
