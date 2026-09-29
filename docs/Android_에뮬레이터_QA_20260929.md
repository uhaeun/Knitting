# Android 에뮬레이터 QA — 2026-09-29

## 대상과 범위

출시 코드 `28611f6cdb45872d37085814a155c2b548d79e4c` 위에 테스트 복구 커밋 `fd470d2`를 적용했다. 앱 화면·기능 코드는 동일하며 시험용 Capacitor 설정과 가입 도우미를 수정했다. Pixel_6 AVD / Android 16 / arm64 / Appium UiAutomator2에서 로컬 Supabase에 연결한 APK를 실행했다. 이메일 확인은 로컬 Mailpit으로 처리했다.

실기기·운영 서버·실제 편물·운영 인증 메일 전달의 검증은 아니다. 아래 결과로 [실기기 QA 표](실기기_QA_기록_1002.md)를 완료 처리하지 않는다.

## 실행 결과

2026-09-29 22시대 KST 실행. **3 passed in 343.89s**, 종료 코드 0.

| 검사 | 결과 | 검증한 사실 |
|---|---|---|
| 카메라 권한 | PASS | 최초 촬영은 권한 창 표시, 앱 완전 종료·재실행 후 다시 촬영할 때 재요청 없이 카메라 준비 |
| 결과 사진 저장 | PASS | 사진 촬영 → 첫 기록 저장 → 결과 사진 생성 → 사진첩 저장 완료 안내와 Android MediaStore 이미지 수 증가 |
| 촬영 알림 | PASS | 알림 권한 허용 → 기기 시계 기준 2분 뒤 예약 → 앱을 백그라운드로 보낸 뒤 OS 알림창에서 문구 확인 |

실행 시간에는 가입·앱 설치·OS 대기 등이 포함되어 있어 촬영 지연이나 사용자 작업 시간의 지표로 사용하지 않는다. 결과 영상 저장·기기별 화질·앨범별 분류·공유 취소는 이 3개 검사에 포함되지 않는다.

## 재현

로컬 Supabase와 Mailpit을 켜고 `tests/native/README.md`대로 시험 APK를 만든다.

```bash
cd tests/native
ANDROID_SERIAL=emulator-5580 APPIUM_PORT=4735 .venv/bin/python -m pytest test_android.py -v --tb=short --junitxml=out/qa-20260929.xml
```

에뮬레이터 번호는 `adb devices`의 실제 값을 사용한다. 실기기는 테스트가 거부한다. 이번 AVD는 `-read-only -no-snapshot-save`로 실행해 시험 앱 설치 상태를 원래 AVD에 저장하지 않았다.

JUnit 기록: 로컬 `tests/native/out/qa-20260929.xml`. Appium 상세 로그는 인증 토큰이 포함될 수 있으므로 공개 저장소에 올리지 않는다.

## 복구한 테스트 환경

- 삭제된 `capacitor.config.json` 대신 현재 `capacitor.config.ts` 사용. `CAP_LOCAL_TEST=1`일 때만 로컬 HTTP 연결 허용. 배포 기본값은 HTTPS와 mixed content 차단 유지.
- 현재 가입 화면의 8자 비밀번호·약관 동의·이메일 확인 흐름 반영.
- ADB와 Appium이 같은 명시적 에뮬레이터만 선택하도록 변경.
- 타입 검사, lint 오류·경고 0, Python 구문 검사, shell 구문 검사 통과.

배포본 `28611f6`의 별도 CI도 [웹 E2E 30개·RLS 45개](https://github.com/uhaeun/Knitting/actions/runs/36574106766), [기본 검사](https://github.com/uhaeun/Knitting/actions/runs/36574106736), [Android APK 빌드](https://github.com/uhaeun/Knitting/actions/runs/36574106722) 모두 성공했다.
