# 네이티브(하이브리드 앱) 검사 — Appium

웹 화면은 Playwright(`npm run e2e`)가 본다. 여기서는 **앱에서만 생기는 것**을 본다.

| 검사 | 무엇을 확인하나 | 웹 검사로 못 보는 이유 |
|---|---|---|
| `test_camera_permission_is_asked_once` | 카메라 권한을 처음 한 번만 묻고, 앱을 다시 열면 묻지 않는다 | OS 권한 창은 웹 밖이다 |
| `test_result_photo_goes_to_gallery_without_share_sheet` | 결과 사진이 공유 창 없이 갤러리 '닛팅' 앨범에 들어간다 | 사진첩은 네이티브 저장소다 |
| `test_reminder_notification_arrives` | 촬영 알림을 켜면 정한 시각에 알림이 온다 | 알림 창은 OS가 그린다 |

웹뷰 안(로그인·편물 만들기)은 `WEBVIEW` 컨텍스트로, 권한 창·알림은 `NATIVE_APP` 컨텍스트로 다룬다.

## 한 번만 준비

```bash
npm i -g appium                      # 3.x
appium driver install uiautomator2   # 안드로이드
python3 -m venv tests/native/.venv
tests/native/.venv/bin/pip install Appium-Python-Client pytest
```

## 돌리기

1. 로컬 Supabase를 켠다 (현재 0001~0014 적용. 새 환경 준비는 [서버 안내](../../supabase/README.md) 참고)
2. 안드로이드 에뮬레이터를 켠다 (`emulator -avd Pixel_6`). `adb devices`에서 `emulator-5554` 같은 번호를 확인한다. 테스트는 매번 시험 앱을 삭제하므로 실기기는 허용하지 않는다.
3. 시험용 APK를 만든다 — **실서버가 아니라 로컬 Supabase에 붙는다** (에뮬레이터에서 맥은 `10.0.2.2`)
   ```bash
   SUPABASE_ANON_KEY=<supabase status 의 ANON_KEY> tests/native/build-test-apk.sh
   ```
4. 검사
   ```bash
   cd tests/native && ANDROID_SERIAL=emulator-5554 .venv/bin/python -m pytest test_android.py -q
   ```

Appium 서버는 없으면 알아서 띄운다(포트 4725, 다른 작업의 4723을 비켜 간다). `APPIUM_PORT`로 바꿀 수 있다.

시험 빌드는 `CAP_LOCAL_TEST=1`을 Capacitor 동기화에만 적용한다. 현재 `capacitor.config.ts`를 사용하며 소스 설정 파일을 덮어쓰지 않는다. 이메일 확인이 켜진 로컬 서버에서는 Mailpit(54324)의 확인 링크로 가입을 마친다. 외부 수신함이나 운영 계정은 사용하지 않는다.

## 알아 둘 것

- 알림은 '대략 그 시각'으로 예약한다(정확한 알람을 요구하면 안드로이드가 설정 화면으로 튕긴다). 그래서 도착까지 몇 분 걸릴 수 있어 최대 15분 기다린다
- 에뮬레이터를 오래 켜 두면 Appium 도우미가 느려져 시간 초과가 난다. 그때는 에뮬레이터를 껐다 켠다
- 웹 E2E와 **동시에 돌리지 않는다.** 맥 부하가 올라가 양쪽 다 시간 초과가 난다

## 이 검사가 잡은 버그 (2026-09-19)

1. 처음 촬영할 때 권한 창 전에 '카메라를 쓸 수 없어요' 화면이 먼저 떠서 한 번 더 눌러야 했다
2. 앱을 다시 열면 빈 피드 화면으로 시작했다 (편물 목록이 첫 화면이어야 한다)
3. 안드로이드에서 사진첩 저장이 'Album identifier required'로 실패했다
4. 안드로이드에서 알림을 켜면 '알람 및 리마인더' 설정 화면으로 튕겼다

아이폰(XCUITest)은 다음 차례다. 시뮬레이터에는 카메라가 없어 권한·저장·알림 중 카메라를 뺀 둘부터 옮긴다.

## 개발용 앱 (다시 빌드하지 않고 화면 확인)

앱이 내 컴퓨터 개발 서버(8110)를 불러오게 한다. 한 번 설치하면 화면 코드를 고쳐도 15초 안에 앱에 반영된다.

1. `npm run dev:app` (터미널 하나를 계속 차지)
2. `scripts/app-dev.sh android` 또는 `scripts/app-dev.sh ios`
3. 테스터에게 줄 빌드 전: `scripts/app-dev.sh off`

아이폰은 맥 IP가 바뀔 때마다 빈 화면이 된다. 그래서 `scripts/app-dev.sh live-ios`로 **배포된 웹 주소**를 보게 하는 쪽을 쓴다.
맥이 꺼져 있어도 켜지고, https라서 카메라도 열리며, 배포할 때마다 앱 내용이 같이 바뀐다 (2026-09-20부터 하은 아이폰이 이 방식).

- 안드로이드는 `adb reverse`로 localhost를 써서 카메라까지 된다
- 아이폰은 `http://맥IP`라 보안 연결이 아니어서 앱 안 카메라가 안 열린다. 맥과 같은 와이파이여야 하고, 맥 서버가 꺼져 있으면 앱이 빈 화면이다
- 개발 서버는 `.env`의 실제 Supabase를 쓴다
- 8100번은 다른 세션의 Appium(WebDriverAgent)이 쓰고 있어 피했다
- 원본 설정은 `capacitor.config.ts`이며 개발 URL은 `CAP_DEV_URL` 환경 변수로만 지정한다. 동기화된 네이티브 설정 파일은 빌드 산출물이다.
