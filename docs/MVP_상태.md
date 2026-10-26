# 닛팅 구현과 검증 기록

문서 정리: 2026-10-26. 아래 실행 결과는 2026-09-29 기록이며, 이번에 기능을 다시 검사한 결과는 아닙니다.

웹은 https://knitting-pied.vercel.app 에 배포했습니다. Expo·React Native Web 화면을 Capacitor iOS·Android 앱에서도 사용합니다. 인증·기록·파일은 Supabase에 저장합니다. 기능별 동작은 [기능 명세서](기능명세서.md), 환경과 실행 방법은 [자동 검사·빌드](자동빌드.md)와 [Supabase 안내](../supabase/README.md)에 있습니다.

## 확인한 결과

검증 기준 코드는 `d43894d5ca9bd2550c7aec2af88819bc38f92ddc`입니다. 다희의 PR #20~24, 통합 수정 #25, 화면·lint 수정 #26과 Android 시험 환경 수정 #27이 반영된 버전입니다.

- [lint·타입·단위 검사](https://github.com/uhaeun/Knitting/actions/runs/36575873018): 단위 테스트 135개를 포함해 통과
- [웹 E2E·DB 권한 검사](https://github.com/uhaeun/Knitting/actions/runs/36575873070): 사용자 흐름 30개와 권한 검사 45개 통과. 로컬 Supabase와 가짜 카메라 사용
- [Android APK](https://github.com/uhaeun/Knitting/actions/runs/36575873083)·[iOS 시뮬레이터 빌드](https://github.com/uhaeun/Knitting/actions/runs/36575873090): 빌드 성공
- [Android 에뮬레이터](Android_에뮬레이터_QA_20260929.md): 카메라 권한·갤러리 저장·알림 3개 확인
- [iPhone 설치 기록](실기기_QA_기록_1002.md): 배포 웹 연결 앱 설치·실행 확인. 촬영·저장 기능 QA는 당시 미확인

운영 DB 마이그레이션 0013·0014와 웹 배포 확인은 [개발·QA 점검 기록](개발_QA_점검_20260929.md)에 있습니다. 앱 빌드, 개발용 앱 실행과 실제 설치본의 기능 확인은 각각 다른 결과입니다. 9월 17일 Safari에서 확인한 결과를 이 버전의 실기기 결과로 사용하지 않습니다.

## 추가 확인이 필요한 것

기록상 남은 항목입니다. 이후 완료 여부는 이슈와 실제 수행 자료로 확인해야 합니다.

- 운영 가입·인증·비밀번호 재설정 메일 수신과 앱 복귀
- 최신 후보를 이용한 iPhone·Android 촬영, 결과물 생성과 사진첩 저장
- 촬영 지연 제보의 동일 기기 재확인
- 계정 두 개로 공개 범위·차단·숨김·삭제·복원 확인
- 약관·개인정보 내용, 데모 자료와 개인 기여 정리

후속 수행은 [실기기 QA 기록표](실기기_QA_기록_1002.md)에, 제출 준비는 [포트폴리오 남은 작업](포트폴리오_완료계획_1002.md)에 기록합니다. 스토어 출시와 촬영 성능 개선율·실사용자 수는 이 기록으로 확인되지 않습니다.

[정리 전 상태 문서](https://github.com/uhaeun/Knitting/blob/1389be9fa212c8d0c2e504ce52ca8855f6157ac3/docs/MVP_%EC%83%81%ED%83%9C.md)
