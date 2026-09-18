// 영상 기록 E2E: 로컬 웹(8098) + 로컬 Supabase + Chromium 가짜 카메라(원 그림 y4m).
// 실행 전: 로컬 Supabase에 0005 적용, 웹 서버 --clear로 실행.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = 'http://localhost:8098';
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const API = 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // npx supabase status -o env 의 SERVICE_ROLE_KEY
if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_KEY 환경변수가 필요해요');

const dir = mkdtempSync(join(tmpdir(), 'knit-video-'));
const run = (cmd, args) => execFileSync(cmd, args, { maxBuffer: 64 * 1024 * 1024 });
const sql = (q) => run('psql', [DB, '-Atc', q]).toString().trim();
let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
  if (!ok) failed += 1;
};

// 가짜 카메라: 흰 바탕 가운데 파란 원 (가로 1920×1080). 원이 원으로 남는지로 찌그러짐을 잡는다
const circle = "geq=r='if(lt(hypot(X-960,Y-540),300),0,255)':g='if(lt(hypot(X-960,Y-540),300),0,255)':b=255";
run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=1920x1080:r=30:d=6', '-vf', circle, '-pix_fmt', 'yuv420p', join(dir, 'cam.y4m')]);
// 앨범용: 8초, 세로(회전 90°) 영상
run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=1920x1080:r=30:d=8', '-vf', circle, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(dir, 'src8.mp4')]);
run('ffmpeg', ['-v', 'error', '-y', '-display_rotation', '90', '-i', join(dir, 'src8.mp4'), '-c', 'copy', join(dir, 'album8.mp4')]);

/** 저장된 mp4를 받아 ffprobe 정보와 원의 가로/세로 비율(가운데 프레임)을 잰다 */
async function inspect(key) {
  const res = await fetch(`${API}/storage/v1/object/photos/${key}`, { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } });
  const file = join(dir, key.replaceAll('/', '_'));
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', file]).toString());
  const raw = run('ffmpeg', ['-v', 'error', '-ss', '1', '-i', file, '-frames:v', '1', '-vf', 'scale=270:270', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  let minX = 270, maxX = -1, minY = 270, maxY = -1;
  for (let y = 0; y < 270; y += 1) for (let x = 0; x < 270; x += 1) {
    const i = (y * 270 + x) * 3;
    if (raw[i] < 100 && raw[i + 1] < 100 && raw[i + 2] > 150) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  const ratio = (maxX - minX + 1) / (maxY - minY + 1);
  return { probe, ratio };
}

const browser = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${join(dir, 'cam.y4m')}`],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
/** 뜬 대화상자 전부. 구간마다 몇 개가 떴는지 본다 */
const dialogs = [];
page.on('dialog', async (d) => { console.log('[dialog]', d.message()); dialogs.push(d.message()); await d.accept(); });
const stamp = Date.now().toString(36);
const email = `vid_${stamp}@example.com`;

try {
  await page.goto(BASE, { timeout: 180000 });
  await page.getByText('계정이 없어요, 가입할게요').click({ timeout: 120000 });
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('6자 이상').fill('password123');
  await page.getByRole('button', { name: '가입하기' }).click();
  await page.getByPlaceholder('knitter_haeun').fill(`vid_${stamp}`);
  await page.getByPlaceholder('하은').fill('영상');
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.goto(`${BASE}/projects`);
  await page.getByRole('button', { name: '편물 만들기' }).click({ timeout: 30000 });
  await page.getByPlaceholder('예: 회색 라글란 스웨터').fill('영상 스웨터');
  await page.getByRole('button', { name: '만들기', exact: true }).click();

  console.log('\n== 3초 녹화');
  await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 30000 });
  await page.getByRole('radio', { name: '영상' }).click();
  await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
  await page.getByRole('button', { name: '녹화', exact: true }).click();
  await page.waitForTimeout(3200);
  await page.getByRole('button', { name: '녹화 끝' }).click();
  await page.getByText('1번째 / 1').waitFor({ timeout: 120000 });

  const owner = sql(`select id from auth.users where email = '${email}'`);
  const rec = sql(`select media_type || '|' || duration_ms || '|' || video_path || '|' || photo_path || '|' || thumb_path from posts where owner_id = '${owner}' order by created_at desc limit 1`).split('|');
  check('DB 영상 기록', rec[0] === 'video' && Number(rec[1]) >= 2500 && Number(rec[1]) <= 5000, rec.slice(0, 2).join(' '));
  const recInfo = await inspect(rec[2]);
  const v = recInfo.probe.streams.find((s) => s.codec_type === 'video');
  check('녹화 파일 1080×1080 H.264', v?.width === 1080 && v?.height === 1080 && v?.codec_name === 'h264', `${v?.width}×${v?.height} ${v?.codec_name}`);
  check('녹화 파일 오디오 없음', !recInfo.probe.streams.some((s) => s.codec_type === 'audio'));
  check('녹화 원이 원으로 남음 (0.95~1.05)', recInfo.ratio > 0.95 && recInfo.ratio < 1.05, recInfo.ratio.toFixed(3));
  check('대표 사진 존재', sql(`select count(*) from storage.objects where name = '${rec[3]}'`) === '1');
  check('썸네일 존재', sql(`select count(*) from storage.objects where name = '${rec[4]}'`) === '1', rec[4]);

  console.log('\n== 앨범 8초 세로 영상');
  const albumDialogsFrom = dialogs.length;
  await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 30000 });
  await page.getByRole('radio', { name: '영상' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 30000 }),
    page.getByRole('button', { name: '앨범에서 가져오기' }).click(),
  ]);
  await chooser.setFiles(join(dir, 'album8.mp4'));
  await page.getByText('2번째 / 2').waitFor({ timeout: 120000 });
  const alb = sql(`select duration_ms || '|' || video_path from posts where owner_id = '${owner}' order by created_at desc limit 1`).split('|');
  check('앨범 영상 5초로 잘림', Number(alb[0]) >= 4900 && Number(alb[0]) <= 5000, alb[0]);
  const albInfo = await inspect(alb[1]);
  check('앨범 회전 영상 원이 원으로 남음', albInfo.ratio > 0.95 && albInfo.ratio < 1.05, albInfo.ratio.toFixed(3));
  const albumDialogs = dialogs.slice(albumDialogsFrom);
  check('앨범 8초 영상은 잘렸다고 알림', albumDialogs.some((m) => m.includes('앞 5초만 저장했어요')), JSON.stringify(albumDialogs));

  console.log('\n== 사진 모드 회귀');
  await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 30000 });
  await page.getByRole('radio', { name: '사진' }).click();
  await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
  await page.getByRole('button', { name: '촬영' }).click();
  await page.getByText('3번째 / 3').waitFor({ timeout: 60000 });
  check('사진 기록은 photo', sql(`select media_type from posts where owner_id = '${owner}' order by created_at desc limit 1`) === 'photo');

  console.log('\n== 녹화 끝을 누르지 않고 5초 자동 정지');
  await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 30000 });
  await page.getByRole('radio', { name: '영상' }).click();
  await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
  const autoDialogsFrom = dialogs.length;
  const startedAt = Date.now();
  await page.getByRole('button', { name: '녹화', exact: true }).click();
  await page.getByRole('button', { name: '녹화 끝' }).waitFor({ timeout: 5000 });
  // 5초에 스스로 멈춰야 한다 (여유 포함 6.5초 안에 '녹화 끝' 버튼이 사라짐)
  await page.getByRole('button', { name: '녹화 끝' }).waitFor({ state: 'detached', timeout: 6500 });
  const stoppedAfter = Date.now() - startedAt;
  check('5초에 자동 정지', stoppedAfter >= 4900 && stoppedAfter <= 6500, `${stoppedAfter}ms`);
  await page.getByText('4번째 / 4').waitFor({ timeout: 120000 });
  const auto = sql(`select media_type || '|' || duration_ms from posts where owner_id = '${owner}' order by created_at desc limit 1`).split('|');
  check('자동 정지 영상 기록 (5초 이하)', auto[0] === 'video' && Number(auto[1]) >= 4500 && Number(auto[1]) <= 5000, auto.join(' '));
  const autoDialogs = dialogs.slice(autoDialogsFrom);
  check('자동 정지 녹화에는 대화상자가 뜨지 않음', autoDialogs.length === 0, JSON.stringify(autoDialogs));
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
