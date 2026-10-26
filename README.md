# 닛팅 (Knitting)

뜨개 편물을 같은 구도로 촬영하고, 쌓인 사진·영상을 비교 사진과 성장 영상으로 만드는 서비스입니다.

[배포 웹](https://knitting-pied.vercel.app) · [구현·검증 기록](docs/MVP_상태.md) · [포트폴리오 초안](docs/포트폴리오_초안.md)

## 서비스 구성

편물 생성 → 이전 사진을 겹쳐 보며 촬영 → 기록 관리 → 비교 사진·성장 영상 생성 → 저장·피드 발행으로 이어집니다. 일상 사진은 숨기고 결과물만 공유할 수 있습니다.

Expo·React Native Web·TypeScript로 만든 화면을 Vercel 웹과 Capacitor iOS·Android 앱에서 공유합니다. 인증·기록·파일은 Supabase를 사용하고, 공개 범위와 팔로우·차단에 따른 접근은 PostgreSQL RLS로 제한합니다. 사진 합성은 Canvas, 영상 생성은 WebCodecs·Mediabunny를 사용합니다.

## 협업과 역할

하은·다희의 공동 프로젝트입니다. 이슈와 PR로 변경을 검토하고, 배포 후 제보한 사람이 다시 확인하는 방식으로 작업했습니다.

- 다희는 촬영 성능·줌·비교 사진 위치·결과물 발행·영상 옵션을 작업했습니다. [PR #20](https://github.com/uhaeun/Knitting/pull/20)과 [포트폴리오 초안](docs/포트폴리오_초안.md)에 작업 근거가 있습니다.
- 이 README의 구현·검사 내용은 팀 작업 기준입니다. 개인별 작업 근거는 이슈·PR와 포트폴리오 초안에서 확인합니다.
- AI는 기능 코드·검사 스크립트·문서 초안 작성과 통합 오류 수정에 사용했습니다. 요구사항 결정과 검토·QA는 사람이 담당했습니다.

## 검증 사례와 근거

결과물 발행 기능을 통합하면서 DB 접근 정책이 서로를 참조해 사진 조회가 실패했습니다. 상태 확인 함수를 분리하고, 비공개 전환·차단·삭제·복원에 따른 접근을 SQL 검사로 확인했습니다. [통합 PR #25](https://github.com/uhaeun/Knitting/pull/25) · [권한 검사 코드](supabase/tests/rls_matrix.sql)

| 검사 | 범위·근거 |
|---|---|
| 웹 | Playwright 사용자 흐름 30개와 로컬 Supabase를 이용한 [E2E 검사](.github/workflows/e2e.yml) |
| DB | 공개 범위·사용자 관계·서버 함수에 대한 [SQL 검사 45개](supabase/tests/rls_matrix.sql) |
| 앱 | Android APK·iOS 시뮬레이터 빌드, 권한·사진첩·알림 [검사 안내](tests/native/README.md) |

검사 수는 [2026-09-29 기록](docs/MVP_상태.md) 기준입니다. 당시 최신 설치본의 실기기 촬영·저장과 운영 인증 메일 수신은 추가 확인 대상으로 남아 있었습니다. 앱 빌드 결과와 실기기 확인·스토어 출시 여부는 구분해 읽어야 합니다.

## 실행과 검사

Node.js 22.13 이상이 필요합니다. [Supabase 설정](supabase/README.md) 후 개발용 URL과 anon 공개 키를 입력합니다.

```bash
npm ci
cp .env.example .env
npm run web -- --port 8099
```

`http://localhost:8099`에서 엽니다. 휴대폰 카메라는 HTTPS 주소에서 확인합니다.

```bash
npm run lint -- --max-warnings 0
npx tsc --noEmit
npm test -- --runInBand
npm run build
```

전체 E2E는 8098 포트의 웹 서버와 로컬 Supabase가 필요합니다. [준비·실행 절차](.github/workflows/e2e.yml)를 따릅니다. 영상 촬영 검사는 로컬 시험 서버의 `SUPABASE_SERVICE_KEY`가 필요하며, 키가 없어 건너뛴 결과를 전체 통과로 세지 않습니다. 운영 계정·데이터를 대상으로 자동 검사를 실행하거나 운영 service-role 키를 앱에 넣지 않습니다.

Android 설치본은 [Actions](https://github.com/uhaeun/Knitting/actions)의 `Android APK 빌드`에서 받습니다. 개발용 `live-ios`·`live-android`와 웹 파일을 포함한 설치본의 검증을 구분합니다. 설정의 앱 정보는 현재 로드된 웹 화면의 버전이며, 설치 파일의 버전과 다를 수 있습니다.

- [자동 검사·빌드와 배포 설정](docs/자동빌드.md)
- [개발·QA 점검 기록](docs/개발_QA_점검_20260929.md)
- [개발 규칙](CLAUDE.md)
