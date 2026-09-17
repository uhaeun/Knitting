# Knitting (닛팅)

뜨개 편물을 같은 각도로 찍어 쌓고, 그 사진을 이어붙여 성장 영상을 만드는 앱.
iOS · Android 동시 + 웹(같은 코드, 2026-09-17 추가). Expo + TypeScript.

**이 파일은 매 세션의 상시 규칙이다. 작업 시작 전에 반드시 읽는다.**

---

## 지금 어느 단계인가

> 이 절은 단계가 바뀔 때마다 갱신한다. **현재: MVP 구현 완료(2026-09-07). 다음은 실기기 검증과 스토어 준비.**

MVP 범위 = 촬영·타임라인·영상 + 계정·동기화 + 피드·팔로우·댓글·좋아요 + 신고·차단.

| | 상태 |
|---|---|
| 저장 위치 | **로컬 우선** (expo-sqlite + 파일) → Supabase로 push/pull |
| 서버 | Supabase. `supabase/migrations/` 0001 → 0004 순서로 적용 |
| 로그인 | 이메일+비밀번호. Apple·Google은 콘솔 설정 후 추가 |
| 목표 | 양쪽 실기기에서 촬영·영상·피드·댓글이 동작하고 기기를 바꿔도 데이터가 따라옴 |

### 하지 말 것

- 영상 인코딩은 앱은 `modules/video-encoder` (Swift AVAssetWriter / Kotlin MediaCodec), 웹은 `src/features/media/makeVideo.web.ts` (WebCodecs + mp4-muxer)에서만. 다른 라이브러리를 들이지 않는다
- **RLS 조건을 클라이언트에서 중복 작성하지 않는다.** 가시성 판정은 서버 정책이 한다
- **피드에서 서명 URL을 개별 발급하지 않는다.** `createSignedUrls` 배치만
- 대댓글·DM·알고리즘 추천·오프라인 업로드 큐는 v2

### 구조 규칙 (서버 전환을 이미 했으므로 더 중요하다)

- 데이터 접근은 **`src/features/*/repository.ts`(로컬)와 `src/features/*/api.ts`(서버)에만** 둔다. 화면에서 직접 DB·네트워크를 만지지 않는다
- ID는 전부 **UUID v4**. 로컬과 서버가 같은 id를 쓴다
- 삭제는 **soft delete** (`deleted_at`). 물리 삭제 금지
- 모든 레코드에 `created_at`, `updated_at`, `deleted_at`, `synced_at`
- 사진 파일명은 UUID. 로컬은 상대 경로, 서버는 `{owner}/{project}/{post}.jpg`

---

## 절대 규칙 — 단계와 무관

### 데이터

- ID는 UUID v4
- soft delete만. `deleted_at`
- 사진은 저장 전 **장변 1440px / JPEG q80**으로 리사이즈하고 **400px 썸네일**을 따로 만든다
- 사진은 저장 전 **EXIF 회전을 정규화**한다. 기기별로 방향이 제각각이다
- 촬영 결과는 **중앙 정사각 크롭**. 기기 센서 비율 차이를 여기서 흡수한다

### 저장 파이프라인 순서 — 고정

```
촬영 → EXIF 정규화 → 정사각 크롭 → 1440px 리사이즈 → 썸네일 생성
     → 파일 저장 → DB INSERT → 임시파일 삭제
```

**파일 저장이 DB INSERT보다 먼저다.** 반대로 하면 DB에 있는데 파일이 없는 레코드가 생긴다.
INSERT 실패 시 남은 고아 파일은 앱 시작 시 DB와 대조해 정리한다.

**업로드·저장이 확정되기 전에 원본 임시파일을 삭제하지 않는다.** 사진 소실은 이 앱에서 가장 치명적인 버그다.

### 스타일

- **색상값과 픽셀 숫자를 스타일에 직접 쓰지 않는다.** `src/shared/ui/tokens.ts`의 상수만 참조한다
- 그림자를 쓰지 않는다. 경계선으로 구분한다
- 공통 컴포넌트는 `src/shared/ui/`에. 화면별 예외 스타일 prop을 받지 않는다

### 플랫폼

- **Expo Go를 쓰지 않는다.** 네이티브 모듈 때문에 Development Build만 동작한다
- Android는 `targetSdk 36`. **edge-to-edge가 강제되므로 카메라 오버레이 좌표는 반드시 safe area 기준으로 계산한다**
- iOS 최소 16.4 / Android 최소 7.0
- `localStorage` 등 브라우저 스토리지 API를 직접 쓰지 않는다. 예외: 웹에서 Supabase 로그인 세션 보관 (AsyncStorage가 내부적으로 localStorage를 쓴다)

### 웹

앱과 같은 코드를 쓰고, 웹에서 다르게 동작해야 하는 파일만 같은 이름의 `.web.ts(x)`로 둔다. Metro가 웹 번들에서 자동으로 고른다.

- **웹은 로컬 저장이 없다.** Supabase가 원본이고 로그인 필수. 브라우저 저장소는 Safari가 7일 뒤 지울 수 있어 사진 원본을 둘 수 없다
- 웹 전용 파일: `features/project/repository.web.ts`, `features/capture/repository.web.ts`, `features/capture/Camera.web.tsx`, `features/sync/sync.web.ts`, `features/media/makeVideo.web.ts`, `features/media/useMakeVideo.web.ts`, `features/media/composeResult.web.ts`, `shared/lib/files.web.ts`, `shared/lib/dialog.web.ts`, `shared/lib/remote.web.ts`
- 웹 저장소는 함수 이름이 같고 결과가 Promise다. **`repository.ts`에 함수를 추가하면 `.web.ts`에도 같은 이름으로 추가한다**
- 웹에서 읽어 온 `Post.photo_path`·`thumb_path`, `ProjectSummary.cover_thumb_path`에는 Storage 키 대신 **서명 URL**이 들어 있다. 발급은 `remote.web.ts`의 `signPaths`로만 (만료 전 재사용)
- 웹에서 여러 행을 읽는 쿼리는 1000행 제한에 걸린다. 끝까지 읽어야 하면 `readAllPages`, 집계는 서버 함수로
- 여러 테이블을 함께 바꾸는 쓰기(편물 삭제·공개 범위)는 서버 함수(`0004`)로 한 트랜잭션에서
- `Alert.alert`는 웹에서 아무것도 띄우지 않는다. **`@/shared/lib/dialog`의 `showAlert`만 쓴다**
- 웹은 넓은 창에서도 폰 너비 한 칸(`size.webColumn`)으로 보인다. 사진 크기는 `useWindowDimensions` 대신 **`@/shared/ui/layout`의 `useContentWidth`·`useSquareSide`**로 계산한다 (앱은 기존과 같은 값)
- 웹 빌드는 SPA(`app.json` → `web.output: "single"`). 배포 시 모든 경로를 `index.html`로 돌려야 하고, 카메라는 **HTTPS에서만** 열린다
- 새 `.web.ts` 파일을 만든 뒤에는 `npx expo start --web --clear`로 다시 켠다 (watchman이 없으면 Metro가 새 파일을 못 본다)

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
| 오프라인 업로드 큐 | 제외. 단 저장 실패 시 재시도 버튼은 필수 |
| 다크 모드 | 나중. 단 토큰 구조는 대비해 둔다 |

---

## 스택 고정값

| 계층 | 선택 |
|---|---|
| 런타임 | Expo SDK 57 (RN 0.86 / React 19.2) |
| 라우팅 | Expo Router |
| 서버 상태 | TanStack Query v5 |
| 로컬 상태 | Zustand v5 |
| 카메라 | expo-camera |
| 이미지 | expo-image, expo-image-manipulator |
| 합성 | @shopify/react-native-skia |
| 로컬 DB | expo-sqlite |
| 배포 | EAS Build / Update |
| 백엔드 (2~3주차) | Supabase |

**쓰지 않기로 한 것**: Redux/MobX, ffmpeg 계열(FFmpegKit 은퇴), NativeWind, 자체 API 서버, Expo Go.

---

## 디렉터리

```
src/app/                Expo Router 화면 (템플릿 기본 위치. 루트 app/ 아님)
src/
  features/
    capture/            촬영, 고스트 레이어, 저장 파이프라인
    project/            편물 CRUD, 타임라인
    media/              합성, 영상 (2주차~)
  shared/
    ui/tokens.ts        디자인 토큰. 모든 스타일의 유일한 출처
    ui/                 공통 컴포넌트
    lib/                db, 파일, 유틸
    types/              타입
modules/
  video-encoder/        네이티브 영상 인코더 (encode(frames, options) → mp4, onProgress)
docs/                   설계도, 스파이크 기록
scripts/                검증 도구
```

각 feature 폴더에 `repository.ts`를 두고 데이터 접근을 여기로 모은다.

---

## 작업 방식

- 커밋 메시지: `feat:` `fix:` `chore:` `docs:` 접두사
- 한 커밋에 한 가지 변경
- 배포는 주 2회. TypeScript만 바뀌었으면 `eas update`, 네이티브가 바뀌었으면 `eas build`
- 큰 변경 전에 무엇을 할지 먼저 요약해서 확인받는다

## 완료의 정의

코드만 쓰고 끝내지 않는다. 아래를 채워야 완료다.

1. 실기기에서 동작 확인 (시뮬레이터만으로는 부족)
2. 에러 케이스 처리 — 권한 거부, 저장 실패, 빈 데이터
3. 빈 상태 화면
4. 검증 방법 명시 — 어떻게 확인하면 되는지

## 불확실할 때

추측으로 단정하지 않는다. 모르는 것은 "확인 필요"로 표시하고 확인 방법을 함께 제시한다.
설계 판단이 필요하면 `docs/설계도.html`을 먼저 참조한다.
