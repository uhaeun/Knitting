// 웹 E2E 전부 한 번에. 서버와 로컬 Supabase가 떠 있는지 먼저 보고, 스크립트를 하나씩 돌려 결과를 표로 모은다.
//
// 준비
//   1) 로컬 Supabase (0001~0005 적용)        → http://127.0.0.1:54321
//   2) 웹 서버: EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=… npx expo start --web --port 8098 --clear
//   3) SUPABASE_SERVICE_KEY (video-capture가 저장된 파일을 직접 받아 본다. 없으면 그 스크립트만 건너뛴다)
//
// 실행: npm run e2e            하나만: npm run e2e -- ux share
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ALL = ['tour', 'install-guide', 'ux', 'ready', 'crud', 'password-reset', 'share', 'result-ratios', 'video-results', 'video-capture'];
const pick = process.argv.slice(2);
const scripts = pick.length ? ALL.filter((s) => pick.includes(s)) : ALL;

const up = async (url) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return r.status < 500;
  } catch {
    return false;
  }
};

if (!(await up('http://127.0.0.1:54321/rest/v1/'))) {
  console.error('로컬 Supabase가 꺼져 있어요 (127.0.0.1:54321). supabase start 후 다시 실행하세요.');
  process.exit(2);
}
if (!(await up('http://localhost:8098'))) {
  console.error('웹 서버가 꺼져 있어요 (localhost:8098). 위 준비 2)의 명령으로 켠 뒤 다시 실행하세요.');
  process.exit(2);
}

const rows = [];
for (const name of scripts) {
  if (name === 'video-capture' && !process.env.SUPABASE_SERVICE_KEY) {
    rows.push({ name, result: 'SKIP', seconds: 0, fails: ['SUPABASE_SERVICE_KEY 없음'] });
    continue;
  }
  const started = Date.now();
  process.stdout.write(`▶ ${name} … `);
  const r = spawnSync(process.execPath, [join(here, `${name}.mjs`)], { encoding: 'utf8', env: process.env, timeout: 15 * 60_000 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const pass = /RESULT: PASS/.test(out);
  const fails = out.split('\n').filter((l) => l.startsWith('FAIL') || l.startsWith('ERROR')).slice(0, 3);
  const seconds = Math.round((Date.now() - started) / 1000);
  rows.push({ name, result: pass ? 'PASS' : 'FAIL', seconds, fails });
  console.log(`${pass ? 'PASS' : 'FAIL'} (${seconds}초)`);
}

console.log('\n결과');
for (const r of rows) {
  console.log(`  ${r.result.padEnd(4)}  ${r.name.padEnd(14)} ${String(r.seconds).padStart(4)}초`);
  for (const f of r.fails ?? []) if (r.result !== 'PASS') console.log(`        ${f.slice(0, 120)}`);
}
const failed = rows.filter((r) => r.result === 'FAIL').length;
console.log(failed ? `\n실패 ${failed}개` : `\n모두 통과 (${rows.filter((r) => r.result === 'PASS').length}개)`);
process.exit(failed ? 1 : 0);
