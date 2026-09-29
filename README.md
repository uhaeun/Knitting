# 닛팅 (Knitting)

뜨개 편물을 같은 각도로 기록하고, 쌓인 사진·영상을 성장 영상과 비교 사진으로 만드는 서비스.

[웹 열기](https://knitting-pied.vercel.app) · [현재 구현·검증 상태](docs/MVP_상태.md) · [10월 초 완료 계획](docs/포트폴리오_완료계획_1002.md)

## 핵심 흐름

편물 만들기 → 이전 사진을 겹쳐 보며 촬영 → 기록 관리 → 전체·전후·3분할 사진 또는 성장 영상 생성 → 저장·피드 발행. 일상 사진은 다른 사람에게 숨기고 결과물만 공유할 수 있다.

## 구조

Expo 57·React Native Web·TypeScript의 웹 화면을 Vercel에 배포하고, Capacitor로 감싼 iOS·Android 앱에서도 사용한다. 별도의 네이티브 화면 구현은 없다.

```mermaid
flowchart LR
  W[웹 브라우저] --> UI[Expo Router · React Native Web]
  N[Capacitor iOS · Android] --> UI
  UI --> Q[TanStack Query · repository/API]
  Q --> A[Supabase Auth]
  Q --> D[PostgreSQL · RLS]
  Q --> S[Storage · 서명 URL]
  UI --> M[Canvas · WebCodecs · Mediabunny]
  M --> F[비교 사진 · 성장 영상]
  F --> B[웹 공유 / 파일 다운로드]
  F --> P[앱 사진첩 플러그인]
```

- 촬영: `getUserMedia`·`MediaRecorder`. 사진 줌은 디지털 크롭이며 영상 줌은 미지원이다.
- 저장: 사진·썸네일 업로드 후 DB 기록 생성. DB 저장 실패 시 업로드 파일을 정리한다.
- 접근 제어: 공개 범위·팔로우·차단·삭제 가시성은 서버 RLS가 판단한다.
- 미디어: Canvas로 비교 사진, WebCodecs·Mediabunny로 MP4를 생성한다.
- 앱 차이: 사진첩 저장·로컬 알림은 Capacitor 플러그인을 사용한다. 카메라·영상 처리에는 WebView 제약도 적용된다.

## 실행

Node.js 22.13 이상이 필요하며 CI는 Node 22를 사용한다. [Expo 57 문서](https://docs.expo.dev/versions/v57.0.0/)를 기준으로 개발한다.

```bash
npm ci
cp .env.example .env
# .env에 개발용 Supabase URL·anon 공개 키 입력
npm run web -- --port 8099
```

`http://localhost:8099`에서 연다. 휴대폰 브라우저의 카메라는 HTTPS 주소에서 검사한다. Supabase 준비는 [서버 안내](supabase/README.md)를 따른다. 운영 service-role 키를 앱 환경변수에 넣지 않는다.

## 검사

```bash
npm run lint -- --max-warnings 0
npx tsc --noEmit
npm test -- --runInBand
npm run build
```

전체 E2E에는 8098 포트의 웹 서버와 **로컬 Supabase**가 필요하다. 준비 과정은 [e2e.yml](.github/workflows/e2e.yml)에 있다.

```bash
npm run e2e
npm run e2e -- ux ready video-capture
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/rls_matrix.sql
```

영상 촬영 검사에는 로컬 Supabase의 `SUPABASE_SERVICE_KEY`가 필요하다. 키가 없어 건너뛴 결과를 전체 통과로 취급하지 않는다. 자동 검사는 운영 계정·데이터를 대상으로 실행하지 않는다.

| 검사 | 범위 |
|---|---|
| PR | lint · TypeScript · Jest |
| 전체 E2E | 사용자 흐름 30개 시나리오, 로컬 Supabase·가짜 카메라 |
| DB 권한 | RLS·서버 함수 45개 확인, 실패 시 SQL 예외 |
| Android 빌드 | 웹 산출물을 포함한 debug APK |
| iOS 빌드 | 관련 파일 변경 시 시뮬레이터 빌드, 배포용 서명 없음 |
| 실기기 QA | 권한·촬영 반응·화질·WebCodecs·사진첩 저장·알림 |

실행 증거는 [현재 상태](docs/MVP_상태.md), Appium 준비는 [네이티브 검사 안내](tests/native/README.md)를 참고한다.

## 배포와 앱

웹은 `npx vercel deploy --prod`로 배포한다. Vercel이 `npm ci` 후 `npx expo export -p web`을 실행한다. Supabase 환경변수는 Vercel 프로젝트 `knitting`에 등록하며 스키마 변경 시 호환성과 적용 순서를 확인한다.

설정 → **앱 정보**에서 현재 화면의 버전, 빌드 번호(커밋 앞 7자리), 빌드 시각(한국 시간)을 확인한다. `app.config.js`가 빌드할 때 정보를 넣으므로 이후 배포된 버전을 기존 앱의 버전으로 오인하지 않는다. 버전은 `app.json`의 `expo.version`을 사용한다. 빌드 번호는 `KNITTING_BUILD_SHA`, `VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA`, 로컬 Git 순으로 읽는다. Git 폴더 없이 CLI로 배포할 때는 실제 소스 커밋을 `--build-env KNITTING_BUILD_SHA=<커밋 SHA>`로 전달한다. 이 정보는 현재 로드된 화면 기준이며 설치된 iOS·Android 실행 파일의 버전은 아니다.

Android APK는 [Actions](https://github.com/uhaeun/Knitting/actions)의 `Android APK 빌드`에서 받는다. 최종 앱 QA는 `CAP_DEV_URL` 없이 웹 파일을 포함한 설치본으로 수행한다. `live-ios`·`live-android`는 배포 웹을 불러오는 개발용 모드다. 앱스토어 출시 완료를 의미하지 않는다.

## 협업과 AI 활용

하은·다희의 팀 프로젝트다. 이슈 → 브랜치 → PR → 검증 → 배포 → 제보자 재확인 순서로 진행한다. 다희님 PR #20~24와 통합 수정 PR #25를 포함한다.

AI는 기능 코드·검사 스크립트·문서 초안과 통합 오류 수정에 사용했다. 사람의 요구사항 결정·검토·QA와 AI 작업을 구분해 기록한다. 개인 포트폴리오에는 팀 전체 결과와 본인이 직접 담당한 범위를 구분한다.

## 문서

- [현재 상태와 한계](docs/MVP_상태.md) · [개발·QA 점검](docs/개발_QA_점검_20260929.md)
- [포트폴리오 완료 계획](docs/포트폴리오_완료계획_1002.md) · [작성 초안](docs/포트폴리오_초안.md)
- [자동 검사·빌드](docs/자동빌드.md) · [Supabase](supabase/README.md) · [개발 규칙](CLAUDE.md)
