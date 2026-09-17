# Knitting (닛팅)

뜨개 편물을 같은 각도로 찍어 쌓고, 그 사진으로 성장 영상과 결과 사진을 만드는 **웹앱**.
Expo(react-native-web) + TypeScript + Supabase. 폰 브라우저가 주 사용처다.

**이 파일은 매 세션의 상시 규칙이다. 작업 시작 전에 반드시 읽는다.**

---

## 지금 어느 단계인가

> 이 절은 단계가 바뀔 때마다 갱신한다. **현재: 웹앱 전환 완료(2026-09-17). 다음은 HTTPS 배포와 iPhone Safari 실사용.**

**2026-09-17 결정: iOS·Android 네이티브 앱을 접고 웹앱 하나로 간다.** 혼자 개발하므로 네이티브 빌드·스토어·플랫폼별 인코더 유지 비용을 없앤다.
네이티브 코드는 커밋 `a26640a`(PR #1 병합)까지 git 기록에 있다. 되살리지 말자는 결정이 아니라 **지금은 안 한다**는 결정이다.

| | 상태 |
|---|---|
| 저장 위치 | **Supabase가 원본.** 로컬 DB·파일·동기화 없음 |
| 로그인 | 필수. 이메일+비밀번호 |
| 서버 | Supabase. `supabase/migrations/` 0001 → 0004 순서로 적용 (실서버 적용 완료) |
| 목표 | iPhone Safari에서 매일 촬영 → 결과 사진·영상을 사진첩에 저장까지 막힘없이 |

`docs/닛팅_설계도_v1.1.html`·`진행가이드`·`함께시작하기_다희`는 **네이티브 2인 개발 시절 문서**다. 데이터 모델·RLS·화면 흐름은 여전히 참고하되, 스택·빌드·역할 분담 부분은 이 파일이 우선한다.

### 하지 말 것

- **iOS·Android 네이티브 코드를 다시 들이지 않는다** (Skia, expo-sqlite, expo-file-system, 네이티브 모듈, EAS Build). 하은이 네이티브 복귀를 정하기 전까지
- `.web.ts` 같은 플랫폼 분기 파일을 만들지 않는다. `Platform.OS` 분기도 쓰지 않는다. 플랫폼은 웹 하나다
- **RLS 조건을 클라이언트에서 중복 작성하지 않는다.** 가시성 판정은 서버 정책이 한다
- **서명 URL을 개별 발급하지 않는다.** `createSignedUrls` 배치만
- 대댓글·DM·알고리즘 추천·오프라인 업로드 큐는 v2

---

## 절대 규칙

### 데이터

- ID는 UUID v4 (`crypto.randomUUID`). auto-increment 금지
- soft delete만. `deleted_at`. 물리 삭제 금지
- 모든 레코드에 `created_at`, `updated_at`, `deleted_at`
- 사진은 **장변 1440px / JPEG q80** + **400px 썸네일**. **중앙 정사각 크롭**, **EXIF 회전 정규화**
- Storage 경로는 `{owner}/{project}/{post}.jpg`, 썸네일 `_t.jpg`

### 저장 파이프라인 순서 — 고정

```
촬영 → EXIF 정규화 → 정사각 크롭 → 1440px 리사이즈 → 썸네일 생성
     → Storage 업로드 (원본 → 썸네일) → posts INSERT
```

**업로드가 INSERT보다 먼저다.** 반대로 하면 DB에 있는데 사진이 없는 행이 생긴다.
INSERT가 실패하면 올린 파일을 지운다. 저장 실패 시 **재시도 버튼**은 필수다. 사진 소실은 이 앱에서 가장 치명적인 버그다.

### 서버 접근

- 데이터 접근은 **`src/features/*/repository.ts`(편물·사진)와 `src/features/*/api.ts`(계정·소셜)에만** 둔다. 화면은 `queries.ts`의 훅만 쓴다
- 읽어 온 `Post.photo_path`·`thumb_path`, `ProjectSummary.cover_thumb_path`에는 Storage 키 대신 **서명 URL**이 들어 있다. 발급은 `@/shared/lib/remote`의 `signPaths`로만 (만료 15분 전까지 재사용)
- 여러 행을 읽는 쿼리는 PostgREST **1000행 제한**에 걸린다. 끝까지 읽어야 하면 `readAllPages`, 집계는 서버 함수로
- 여러 테이블을 함께 바꾸는 쓰기(편물 삭제·공개 범위)는 **서버 함수 한 트랜잭션**으로 (`0004`)
- 마이그레이션은 새 번호 파일로 추가한다. 이미 적용한 파일을 고치지 않는다. 추가하면 `supabase/tests/rls_matrix.sql`에 케이스를 넣고 ALL PASS를 확인한다

### 저장·공유 (사진첩)

- 웹은 사진첩에 직접 쓸 수 없다. **저장 버튼 = 공유 창을 연다 → 사용자가 "이미지 저장"/"비디오 저장"을 누른다.** 공유 창이 없는 브라우저(데스크톱)는 파일 내려받기
- `@/shared/lib/saveFile`의 `saveOrShare`만 쓴다. **공유할 `File`은 버튼을 누르기 전에 만들어 둔다** (iPhone Safari는 누른 직후가 아니면 공유 창을 막는다. 누른 뒤 await로 파일을 만들면 막힌다)
- 저장 버튼 근처에 "공유 창에서 '이미지 저장'을 누르세요" 안내를 둔다

### 화면·스타일

- **색상값과 픽셀 숫자를 스타일에 직접 쓰지 않는다.** `src/shared/ui/tokens.ts`의 상수만 참조한다
- 그림자를 쓰지 않는다. 경계선으로 구분한다
- 공통 컴포넌트는 `src/shared/ui/`에. 화면별 예외 스타일 prop을 받지 않는다
- 넓은 창(데스크톱·VS Code)에서도 **폰 너비 한 칸**(`size.webColumn`)으로 보인다. 사진 크기는 `useWindowDimensions` 대신 **`@/shared/ui/layout`의 `useContentWidth`·`useSquareSide`**로 계산한다
- `Alert.alert`는 웹에서 아무것도 띄우지 않는다. **`@/shared/lib/dialog`의 `showAlert`만 쓴다**
- 선택 상태는 `accessibilityState` 대신 **`aria-checked`/`aria-selected`** props로 (react-native-web이 accessibilityState를 ARIA로 옮기지 않는다)

### 브라우저

- 카메라는 **HTTPS에서만** 열린다 (localhost 제외). 폰 테스트는 배포 주소로
- 카메라는 `src/features/capture/Camera.tsx`(getUserMedia, 높은 해상도 요청). expo-camera의 뷰는 640×480밖에 안 받아서 쓰지 않는다 (권한 훅만 사용)
- 영상은 WebCodecs H.264 + mp4-muxer (`makeVideo.ts`). 사진은 한 장씩만 메모리에 둔다
- 결과 사진은 Canvas 2D (`composeResult.ts`). 장면 계산은 `resultPlan.ts` 순수 함수
- 대상: iOS Safari 16.4+, Android Chrome 최신. 데스크톱은 확인용
- 브라우저 저장소는 **로그인 세션 보관**(supabase-js 기본 localStorage)과 화면 편의 설정에만 쓴다. 사진·기록 원본은 두지 않는다
- 빌드는 SPA(`app.json` → `web.output: "single"`). 배포 시 모든 경로를 `index.html`로 돌린다

### 코드

- TypeScript만. JavaScript 파일을 만들지 않는다
- `strict: true`, `noUncheckedIndexedAccess: true`
- `any` 금지. 불가피하면 주석으로 이유를 남긴다
- 서버 상태는 TanStack Query, 화면 로컬 상태는 Zustand. 두 역할을 섞지 않는다
- `src/shared/types/database.ts`는 **자동 생성물이다. 손으로 수정 금지**

---

## 제외된 기능 — 다시 제안하지 않는다

뜨개 앱 맥락에서 자연스러워 보여도 **의도적으로 뺀 것들**이다. 요청받지 않은 이상 만들지 않고, 제안하지도 않는다.

| 항목 | 사유 |
|---|---|
| **단수 기록, `row_delta`, 진척 그래프** | 제거 확정. 사진과 영상에 집중 |
| **푸르시오(frogging) 기록** | 위와 함께 제거 |
| 단수 카운터, 실 재고 관리, 도안 뷰어 | 종합형 앱과 정면 경쟁하지 않는다 |
| 대댓글, DM, 알고리즘 추천 | v2 |
| 오프라인 업로드 큐 · 로그인 없이 쓰기 | 제외. 서버가 원본이다. 단 저장 실패 시 재시도 버튼은 필수 |
| 네이티브 앱 (iOS·Android) | 2026-09-17 보류. 위 "지금 어느 단계인가" |
| 다크 모드 | 나중. 단 토큰 구조는 대비해 둔다 |

---

## 스택 고정값

| 계층 | 선택 |
|---|---|
| 런타임 | Expo SDK 57 웹 (react-native-web, React 19.2) |
| 라우팅 | Expo Router |
| 서버 상태 | TanStack Query v5 |
| 로컬 상태 | Zustand v5 |
| 카메라 | getUserMedia (`Camera.tsx`) + expo-camera 권한 훅 |
| 이미지 | expo-image, expo-image-manipulator, expo-image-picker |
| 영상 | WebCodecs + mp4-muxer |
| 결과 사진 | Canvas 2D |
| 백엔드 | Supabase (Auth · Postgres + RLS · Storage) |
| 배포 | 정적 호스팅 (`npm run build` → `dist/`) |

**쓰지 않기로 한 것**: Redux/MobX, ffmpeg 계열, NativeWind, 자체 API 서버, Skia, expo-sqlite, EAS Build.

---

## 디렉터리

```
src/app/                Expo Router 화면
src/
  features/
    auth/               로그인, 온보딩, 세션
    capture/            촬영(Camera.tsx), 고스트 레이어, 저장 파이프라인, 사진 repository
    project/            편물 repository, 타임라인
    media/              영상(makeVideo), 결과 사진(resultPlan · composeResult)
    social/             피드, 팔로우, 댓글, 좋아요, 신고·차단
  shared/
    ui/tokens.ts        디자인 토큰. 모든 스타일의 유일한 출처
    ui/                 공통 컴포넌트, layout 훅
    lib/                supabase, remote(서명 URL·페이지), dialog, saveFile, 날짜
    types/              타입
supabase/
  migrations/           0001~ 순서대로
  tests/rls_matrix.sql  RLS·서버 함수 검증. 마지막 줄 ALL PASS
docs/                   기획·상태 문서
```

---

## 작업 방식

- 커밋 메시지: `feat:` `fix:` `chore:` `docs:` 접두사. 한 커밋에 한 가지 변경
- 기능 단위 작업은 브랜치 → PR → 하은이 확인 후 `main`에 병합. 작은 수정은 `main`에 바로 커밋해도 된다
- 큰 변경 전에 무엇을 할지 먼저 요약해서 확인받는다
- 로컬 실행: VS Code `⌘⇧P` → Tasks: Run Task → **닛팅 웹 켜기** → Simple Browser `http://localhost:8099`
- 새 파일을 만든 뒤에는 `npx expo start --web --clear`로 다시 켠다 (watchman이 없으면 Metro가 새 파일·변경을 못 본다)

## 완료의 정의

코드만 쓰고 끝내지 않는다. 아래를 채워야 완료다.

1. **폰 브라우저에서 동작 확인** (iPhone Safari 우선). 데스크톱 브라우저만으로는 부족 — 카메라·공유 창·WebCodecs가 다르다
2. 에러 케이스 처리 — 권한 거부, 저장 실패, 빈 데이터
3. 빈 상태 화면
4. 검증 방법 명시 — 어떻게 확인하면 되는지. 데스크톱에서 자동 검증한 것과 폰에서 확인 못 한 것을 구분해 적는다

## 불확실할 때

추측으로 단정하지 않는다. 모르는 것은 "확인 필요"로 표시하고 확인 방법을 함께 제시한다.
