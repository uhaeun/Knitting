# Knitting · 닛팅

뜨개 편물을 같은 구도로 찍고, 쌓인 사진과 영상으로 비교 사진이나 성장 영상을 만드는 앱입니다.

[웹에서 열기](https://knitting-pied.vercel.app) · [구현·검증 기록](docs/MVP_상태.md)

촬영할 때 이전 사진을 겹쳐 보며 구도를 맞출 수 있습니다. 일상 사진은 숨기고 완성한 결과물만 피드에 공유할 수도 있습니다.

Expo·React Native Web·TypeScript로 만든 화면을 웹과 Capacitor iOS·Android 앱에서 함께 씁니다. 인증, DB, 파일 저장에는 Supabase를 사용했습니다.

하은·다희가 함께 만든 프로젝트입니다. 다희가 맡은 촬영 성능, 줌, 비교 사진 위치, 결과물 발행, 영상 옵션 작업은 [PR #20](https://github.com/uhaeun/Knitting/pull/20)과 [작업 정리](docs/포트폴리오_초안.md)에 있습니다. 이 페이지는 팀 전체 작업을 소개합니다. 기능 코드와 테스트·문서 작성에는 AI를 사용했고, 요구사항 결정과 검토·QA는 사람이 맡았습니다.

## 만들면서 확인한 문제

결과물을 피드에 올리는 기능을 합친 뒤 사진 조회가 실패했습니다. DB 접근 정책이 서로를 다시 참조하는 문제였습니다. 상태 확인 함수를 분리한 뒤, 비공개 전환이나 차단·삭제·복원 후에도 사진이 보여야 할 사람에게만 보이는지 SQL로 확인했습니다. [수정 PR #25](https://github.com/uhaeun/Knitting/pull/25) · [검사 코드](supabase/tests/rls_matrix.sql)

웹 사용 흐름은 Playwright로 검사하고, DB 권한 검사는 로컬 Supabase에서 함께 실행합니다. [E2E 실행 설정](.github/workflows/e2e.yml)에 준비 과정이 있습니다. 앱의 카메라 권한·사진첩·알림은 [별도 검사](tests/native/README.md)로 확인합니다.

[9월 29일 기록](docs/MVP_상태.md)에는 자동 검사 결과와 실기기 확인이 남은 항목을 나눠 적었습니다. 당시 최신 설치본의 촬영·저장과 운영 인증 메일 수신은 추가 확인이 필요했습니다. 앱 빌드가 성공한 것만으로 이 기능들이 동작한다고 판단하지 않았습니다.

## 로컬에서 실행하기

Node.js 22.13 이상이 필요합니다. [Supabase 설정](supabase/README.md)을 마친 뒤 `.env`에 개발용 URL과 anon 공개 키를 넣습니다.

```bash
npm ci
cp .env.example .env
npm run web -- --port 8099
```

`http://localhost:8099`에서 엽니다. 휴대폰에서 카메라를 확인할 때는 HTTPS 주소가 필요합니다.

```bash
npm run lint -- --max-warnings 0
npx tsc --noEmit
npm test -- --runInBand
npm run build
```

전체 E2E는 8098 포트의 웹 서버와 로컬 Supabase를 준비한 뒤 실행합니다. 영상 촬영 검사는 로컬 시험 서버의 `SUPABASE_SERVICE_KEY`가 필요합니다. 키가 없어 건너뛴 검사는 통과로 세지 않습니다. 운영 데이터로 자동 검사를 실행하거나 운영 service-role 키를 앱에 넣지 않습니다.

Android 설치본과 iOS 빌드, 개발용 앱과 설치본의 차이는 [빌드 안내](docs/자동빌드.md)에 있습니다. 설정의 앱 정보에 표시되는 버전은 현재 로드된 웹 화면 기준입니다.

[개발 규칙](CLAUDE.md) · [QA 점검 기록](docs/개발_QA_점검_20260929.md)
