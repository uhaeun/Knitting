#!/usr/bin/env bash
# 시험용 안드로이드 앱: 로컬 Supabase(에뮬레이터에서 호스트는 10.0.2.2)에 붙는다. 실서버를 건드리지 않는다.
# 쓰는 법: SUPABASE_ANON_KEY=... tests/native/build-test-apk.sh   → tests/native/out/knitting-test.apk
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
: "${SUPABASE_ANON_KEY:?로컬 Supabase anon 키가 필요해요 (supabase status -o env 의 ANON_KEY)}"

# 개발 서버 환경이 상속되어도 시험 APK는 반드시 자체 화면을 사용한다.
unset CAP_DEV_URL CAP_LOCAL_TEST
restore() { npx cap sync android >/dev/null 2>&1 || true; }
trap restore EXIT

rm -rf dist
EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" npx expo export -p web --clear >/dev/null
CAP_LOCAL_TEST=1 npx cap sync android >/dev/null
(cd android && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug -q)
mkdir -p tests/native/out
cp android/app/build/outputs/apk/debug/app-debug.apk tests/native/out/knitting-test.apk
echo "시험용 APK: tests/native/out/knitting-test.apk"
