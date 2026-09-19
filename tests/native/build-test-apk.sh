#!/usr/bin/env bash
# 시험용 안드로이드 앱: 로컬 Supabase(에뮬레이터에서 호스트는 10.0.2.2)에 붙는다. 실서버를 건드리지 않는다.
# 쓰는 법: SUPABASE_ANON_KEY=... tests/native/build-test-apk.sh   → tests/native/out/knitting-test.apk
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
: "${SUPABASE_ANON_KEY:?로컬 Supabase anon 키가 필요해요 (supabase status -o env 의 ANON_KEY)}"

cp capacitor.config.json /tmp/capacitor.config.backup.json
restore() { cp /tmp/capacitor.config.backup.json capacitor.config.json; npx cap sync android >/dev/null 2>&1 || true; }
trap restore EXIT

# 로컬 서버가 http라서 앱이 평문 요청을 허용해야 한다 (시험용에서만)
python3 - <<'PY'
import json, pathlib
p = pathlib.Path('capacitor.config.json'); c = json.loads(p.read_text())
c['server'] = {**c.get('server', {}), 'cleartext': True, 'androidScheme': 'http'}
c['android'] = {**c.get('android', {}), 'allowMixedContent': True}
p.write_text(json.dumps(c, ensure_ascii=False, indent=2))
PY

rm -rf dist
EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" npx expo export -p web --clear >/dev/null
npx cap sync android >/dev/null
(cd android && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug -q)
mkdir -p tests/native/out
cp android/app/build/outputs/apk/debug/app-debug.apk tests/native/out/knitting-test.apk
echo "시험용 APK: tests/native/out/knitting-test.apk"
