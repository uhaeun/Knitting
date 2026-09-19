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

1. 로컬 Supabase를 켠다 (`supabase start`, 0001~0005 적용)
2. 안드로이드 에뮬레이터를 켠다 (`emulator -avd Pixel_6`)
3. 시험용 APK를 만든다 — **실서버가 아니라 로컬 Supabase에 붙는다** (에뮬레이터에서 맥은 `10.0.2.2`)
   ```bash
   SUPABASE_ANON_KEY=<supabase status 의 ANON_KEY> tests/native/build-test-apk.sh
   ```
4. 검사
   ```bash
   cd tests/native && .venv/bin/python -m pytest test_android.py -q
   ```

Appium 서버는 없으면 알아서 띄운다(포트 4725, 다른 작업의 4723을 비켜 간다). `APPIUM_PORT`로 바꿀 수 있다.

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

- 안드로이드는 `adb reverse`로 localhost를 써서 카메라까지 된다
- 아이폰은 `http://맥IP`라 보안 연결이 아니어서 앱 안 카메라가 안 열린다. 맥과 같은 와이파이여야 하고, 맥 서버가 꺼져 있으면 앱이 빈 화면이다
- 개발 서버는 `.env`의 실제 Supabase를 쓴다
- 8100번은 다른 세션의 Appium(WebDriverAgent)이 쓰고 있어 피했다
- 동기화된 `capacitor.config.json`은 git이 무시하므로 개발 주소가 커밋될 일은 없다
