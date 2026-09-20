#!/usr/bin/env bash
# 개발용 앱: 앱이 내 컴퓨터 개발 서버(8110)를 불러온다. 한 번 설치하면 화면 코드를 고쳐도 다시 빌드할 필요가 없다.
#
#   npm run dev:app              # 1) 개발 서버 (터미널 하나를 계속 차지)
#   scripts/app-dev.sh android   # 2) 에뮬레이터·USB 폰에 개발용 앱 설치
#   scripts/app-dev.sh ios       # 2) 아이폰에 개발용 앱 설치 (맥과 같은 와이파이)
#   scripts/app-dev.sh live-ios  # 아이폰 앱이 배포된 웹 주소를 보게 (맥 없이도 켜지고 카메라도 됨)
#   scripts/app-dev.sh off       # 테스터용으로 되돌리기. 테스터에게 줄 빌드 전에 반드시 실행
#
# 주의
# - 안드로이드는 adb reverse로 localhost를 쓰기 때문에 카메라가 된다.
# - 아이폰은 http://맥IP 라서 보안 연결이 아니다 → 앱 안 카메라(getUserMedia)가 안 열린다.
#   찍기 화면은 테스터용 빌드나 안드로이드에서 본다.
# - 개발 서버는 .env의 실제 Supabase를 쓴다. 여기서 만든 데이터는 10/2 전에 지운다.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=8110
IOS_DEVICE=00008140-000439892101801C
IOS_COREDEVICE=2808EE3C-285D-5C8A-A0B5-C483B7EB2AB9
TEAM=36343444V7
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
ADB="$HOME/Library/Android/sdk/platform-tools/adb"

case "${1:-}" in
  android)
    "$ADB" reverse tcp:$PORT tcp:$PORT
    CAP_DEV_URL="http://localhost:$PORT" npx cap sync android
    (cd android && ./gradlew assembleDebug -q)
    "$ADB" install -r android/app/build/outputs/apk/debug/app-debug.apk
    "$ADB" shell monkey -p app.knitting.web -c android.intent.category.LAUNCHER 1 >/dev/null
    echo "개발용 앱 설치 끝 → http://localhost:$PORT (adb reverse)"
    ;;
  ios)
    IP=$(ipconfig getifaddr en0)
    CAP_DEV_URL="http://$IP:$PORT" npx cap sync ios
    xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
      -destination "id=$IOS_DEVICE" -derivedDataPath /tmp/knitting-device \
      DEVELOPMENT_TEAM=$TEAM -allowProvisioningUpdates build -quiet
    xcrun devicectl device install app --device "$IOS_COREDEVICE" /tmp/knitting-device/Build/Products/Debug-iphoneos/App.app
    echo "개발용 앱 설치 끝 → http://$IP:$PORT (맥 IP가 바뀌면 다시 실행)"
    ;;
  live-ios)
    # 맥 IP가 바뀔 때마다 앱이 빈 화면이 되는 문제를 피한다. 배포할 때마다 앱 내용도 같이 바뀐다
    CAP_DEV_URL="https://knitting-pied.vercel.app" npx cap sync ios
    xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
      -destination "id=$IOS_DEVICE" -derivedDataPath /tmp/knitting-device \
      DEVELOPMENT_TEAM=$TEAM -allowProvisioningUpdates build -quiet
    xcrun devicectl device install app --device "$IOS_COREDEVICE" /tmp/knitting-device/Build/Products/Debug-iphoneos/App.app
    echo "아이폰 앱 → https://knitting-pied.vercel.app (배포하면 앱도 같이 바뀐다)"
    ;;
  off)
    npx expo export -p web >/dev/null
    npx cap sync
    echo "테스터용 설정으로 되돌림 (앱이 dist를 쓴다). 폰에 넣으려면 평소처럼 다시 빌드·설치"
    ;;
  *)
    echo "사용법: scripts/app-dev.sh android|ios|live-ios|off"; exit 1 ;;
esac
