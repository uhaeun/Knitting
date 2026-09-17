# 영상 기록 (1~2단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 촬영 화면에서 최대 5초 영상을 녹화(또는 앨범에서 선택)해, 정사각 1080 H.264 MP4로 변환한 뒤 대표 사진과 함께 Supabase에 저장한다.

**Architecture:** DB는 `posts`에 `media_type`·`video_path`·`duration_ms`를 더하고, 영상 기록도 `photo_path`·`thumb_path`에 첫 장면을 넣어 기존 목록·피드·고스트 레이어가 그대로 동작하게 한다. 녹화는 MediaRecorder, 변환·첫 장면 추출은 Mediabunny, 대표 사진 리사이즈는 기존 `processCapture`를 재사용한다. 순수 계산(크롭·트림·녹화 시간·형식 선택)은 `clip.ts`로 분리해 단위 테스트한다.

**Tech Stack:** Expo SDK 57 웹 (react-native-web), TypeScript strict, Supabase (Postgres + RLS + Storage), Mediabunny 1.57.0, MediaRecorder, Jest (jest-expo), Playwright(E2E 스크립트), ffmpeg/ffprobe(검증).

**Spec:** `docs/superpowers/specs/2026-09-17-video-records-design.md` — 반드시 함께 읽는다. 이 계획은 7절 구현 순서의 **1단계(데이터)·2단계(촬영·저장)**만 다룬다. 3~5단계는 맨 아래 개요.

## Global Constraints

- 영상 기록 최대 길이 **5초** (`CLIP_MAX_MS = 5000`), 최소 **1초** (`CLIP_MIN_MS = 1000`)
- 저장 형식 고정: **1080×1080, H.264(avc) MP4, 오디오 트랙 없음, 30fps, 4,000,000bps**
- DB 제약: `media_type = 'video'` ⇔ `video_path`·`duration_ms` 있음, `duration_ms` 1~**5500**
- Storage: `photos` 버킷, 경로 `{owner}/{project}/{post}.mp4`, 허용 MIME `image/jpeg`·`video/mp4`, 용량 제한 **10485760**
- 저장 순서 고정: **변환 → 첫 장면 → 대표 사진·썸네일 → 업로드(영상 → 대표 사진 → 썸네일) → posts INSERT**. 실패 시 올린 파일 삭제
- 녹화 원본 Blob은 **저장 성공까지 유지** (다시 시도 = 재촬영 없이 처리만 반복)
- 녹화 형식은 **코덱을 명시**: `video/mp4;codecs=avc1.640028` → `video/mp4;codecs=avc1` → `video/webm;codecs=vp8` → `video/webm;codecs=vp9` 순
- **영상 모드에서는 카메라에 정사각 크기를 요청하지 않는다** (가로 `ideal: 1920`만). 크롭은 `getDisplayWidth/Height`(픽셀비율·회전 반영) 기준 가운데 정사각
- 변환마다 Mediabunny `Input`을 `dispose()` 한다
- 네이티브 코드·`Platform.OS` 분기·`.web.ts` 금지. 스타일 색·픽셀은 `tokens.ts`만. 대화상자는 `showAlert`
- 화면 문구는 한국어. 사진 규칙(1440/400/q80)은 사진 기록에만 적용하고, 영상 대표 사진은 1080(영상 크기) + 400 썸네일
- 마이그레이션은 새 파일로. 적용 후 `supabase/tests/rls_matrix.sql` ALL PASS
- 커밋 메시지 `feat:`/`fix:`/`test:`/`docs:` 접두사, 끝에 `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

## 로컬 환경 (실행자 필독)

- 저장소: `~/Projects/Knitting`, 브랜치 `feat/video-records`
- 로컬 Supabase: `/private/tmp/claude-501/-Users-yuha-Desktop-playwright-260917/d654ea50-4041-441d-9dfb-c6a280e92a3a/scratchpad/sb` 에서 Docker로 실행 중. DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, API `http://127.0.0.1:54321`, anon key는 `npx supabase status -o env`의 `ANON_KEY`
- 로컬 웹 서버(로컬 Supabase용): `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY> CI=1 npx expo start --web --port 8098 --clear`
- **새 파일을 만든 뒤에는 서버를 `--clear`로 다시 켠다** (watchman이 없어 Metro가 변경을 못 본다)
- 실서버 Supabase·Vercel 운영 배포는 **하은 승인 없이 건드리지 않는다** (Task 8)

## File Structure

| 파일 | 책임 |
|---|---|
| `supabase/migrations/0005_video_records.sql` (생성) | posts 컬럼·제약, 버킷 MIME·용량, photos_select에 video_path |
| `supabase/tests/rls_matrix.sql` (수정) | 영상 제약·파일 읽기 케이스 21~26 |
| `src/shared/types/remote.ts`, `src/shared/types/models.ts` (수정) | `MediaType`, 영상 필드 |
| `src/features/capture/clip.ts` (생성) | 순수 계산: 형식 선택, 크롭, 트림, 녹화 시간 판정, 표시 |
| `src/features/capture/__tests__/clip.test.ts` (생성) | clip.ts 단위 테스트 |
| `src/features/capture/videoPipeline.ts` (생성) | Mediabunny: 원본 Blob → MP4 + 첫 장면 URI |
| `src/features/capture/repository.ts` (수정) | 영상 필드 읽기·서명, `saveVideoPost` |
| `src/shared/lib/supabase.ts` (수정) | `remoteVideoPath` |
| `src/features/capture/queries.ts` (수정) | `useSaveVideoPost` |
| `src/features/capture/Camera.tsx` (수정) | `mode` prop, `startRecording`/`stopRecording` |
| `src/features/capture/store.ts` (수정) | `mode`(사진/영상) 기억 |
| `src/features/capture/MediaModeToggle.tsx` (생성) | 어두운 화면용 [사진 \| 영상] 세그먼트 |
| `src/app/capture/[projectId].tsx` (수정) | 영상 모드 셔터·타이머·진행·앨범 영상 |
| `scripts/e2e/video-capture.mjs` (생성) | 녹화·앨범 영상 저장 E2E + ffprobe·원 비율 검사 |
| `package.json` (수정) | `mediabunny` 의존성, `playwright` 개발 의존성 |

---

### Task 1: DB·저장소 마이그레이션 `0005` + RLS 테스트

**Files:**
- Create: `supabase/migrations/0005_video_records.sql`
- Modify: `supabase/tests/rls_matrix.sql` (앵커 `-- 0004 서버 함수: 권한과 원자성` 바로 위에 블록 추가)

**Interfaces:**
- Produces: `posts.media_type text ('photo'|'video')`, `posts.video_path text null`, `posts.duration_ms int null`; `photos_select`가 `video_path`로도 읽기 허용

- [ ] **Step 1: RLS 테스트에 영상 케이스를 먼저 추가 (실패해야 함)**

`supabase/tests/rls_matrix.sql`에서 `-- 0004 서버 함수: 권한과 원자성` 줄 바로 위에 넣는다:

```sql
-- 0005 영상 기록: 제약과 파일 읽기 ------------------------------
-- 저장소 객체를 사용자로 가장해 읽을 수 있는지
create or replace function pg_temp.object_visible_as(viewer uuid, object_name text)
returns boolean language plpgsql as $$
declare n int;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', viewer)::text, true);
  select count(*) into n from storage.objects where bucket_id = 'photos' and name = object_name;
  perform set_config('role', 'postgres', true);
  return n > 0;
end $$;

insert into t_result values
  (21,'영상 기록 저장 (경로·길이 있음)', true,
      pg_temp.writes_as((select id from t_ids where label='A'),
        $$insert into posts (id, project_id, owner_id, photo_path, thumb_path, width, height, taken_at, visibility, media_type, video_path, duration_ms)
          values ('c0000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-000000000001',
                  '11111111-1111-1111-1111-111111111111', 'a/21.jpg', 'a/21_t.jpg', 1080, 1080, now(), 'public', 'video', 'a/21.mp4', 4970)$$)),
  (22,'영상인데 영상 경로 없음은 거부', false,
      pg_temp.writes_as((select id from t_ids where label='A'),
        $$insert into posts (id, project_id, owner_id, photo_path, thumb_path, width, height, taken_at, media_type, duration_ms)
          values ('c0000000-0000-4000-8000-000000000022', 'a0000000-0000-4000-8000-000000000001',
                  '11111111-1111-1111-1111-111111111111', 'a/22.jpg', 'a/22_t.jpg', 1080, 1080, now(), 'video', 3000)$$)),
  (23,'영상 5.5초 초과는 거부', false,
      pg_temp.writes_as((select id from t_ids where label='A'),
        $$insert into posts (id, project_id, owner_id, photo_path, thumb_path, width, height, taken_at, media_type, video_path, duration_ms)
          values ('c0000000-0000-4000-8000-000000000023', 'a0000000-0000-4000-8000-000000000001',
                  '11111111-1111-1111-1111-111111111111', 'a/23.jpg', 'a/23_t.jpg', 1080, 1080, now(), 'video', 'a/23.mp4', 5501)$$)),
  (24,'사진인데 영상 경로 있음은 거부', false,
      pg_temp.writes_as((select id from t_ids where label='A'),
        $$insert into posts (id, project_id, owner_id, photo_path, thumb_path, width, height, taken_at, video_path)
          values ('c0000000-0000-4000-8000-000000000024', 'a0000000-0000-4000-8000-000000000001',
                  '11111111-1111-1111-1111-111111111111', 'a/24.jpg', 'a/24_t.jpg', 1440, 1440, now(), 'a/24.mp4')$$));

-- 파일 읽기: A의 공개 영상(21)과 비공개 영상(25)
insert into posts (id, project_id, owner_id, photo_path, thumb_path, width, height, taken_at, visibility, media_type, video_path, duration_ms)
values ('c0000000-0000-4000-8000-000000000025', 'a0000000-0000-4000-8000-000000000001',
        (select id from t_ids where label='A'), 'a/25.jpg', 'a/25_t.jpg', 1080, 1080, now(), 'private', 'video', 'a/25.mp4', 3000);
insert into storage.objects (bucket_id, name, owner) values
  ('photos', 'a/21.mp4', (select id from t_ids where label='A')),
  ('photos', 'a/25.mp4', (select id from t_ids where label='A'));
insert into t_result values
  (25,'타인(C)이 공개 영상 파일을 읽는다', true,
      pg_temp.object_visible_as((select id from t_ids where label='C'), 'a/21.mp4')),
  (26,'타인(C)은 비공개 영상 파일을 못 읽는다', false,
      pg_temp.object_visible_as((select id from t_ids where label='C'), 'a/25.mp4'));

```

- [ ] **Step 2: 테스트를 돌려 실패 확인**

Run: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/rls_matrix.sql 2>&1 | grep -E "ERROR|실패건수" -A1`
Expected: `ERROR: column "media_type" of relation "posts" does not exist` (컬럼이 아직 없음)

- [ ] **Step 3: 마이그레이션 작성**

`supabase/migrations/0005_video_records.sql`:

```sql
-- 영상 기록: 매일 기록에 최대 5초 영상도 올린다.
-- 영상 기록도 photo_path·thumb_path에 첫 장면(대표 사진)을 넣는다 → 목록·피드·고스트는 변경 없이 동작.

alter table posts
  add column media_type text not null default 'photo' check (media_type in ('photo', 'video')),
  add column video_path text,
  add column duration_ms int;

-- 영상이면 경로·길이 필수(5.5초 이하, 인코딩 여유), 사진이면 둘 다 비어 있어야 한다
alter table posts add constraint posts_video_fields check (
  (media_type = 'photo' and video_path is null and duration_ms is null)
  or (media_type = 'video' and video_path is not null and duration_ms between 1 and 5500)
);

-- 버킷: MP4 허용, 용량 제한 5MB → 10MB
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'video/mp4'], file_size_limit = 10485760
where id = 'photos';

-- 읽기: 본인 폴더이거나, 그 파일(사진·썸네일·영상)을 쓰는 게시물이 보일 때 (posts 정책 상속)
drop policy if exists photos_select on storage.objects;
create policy photos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.posts p
        where p.photo_path = name or p.thumb_path = name or p.video_path = name
      )
    )
  );
```

- [ ] **Step 4: 로컬에 적용하고 테스트 통과 확인**

Run:
```bash
DB=postgresql://postgres:postgres@127.0.0.1:54322/postgres
psql $DB -v ON_ERROR_STOP=1 -q -f supabase/migrations/0005_video_records.sql
psql $DB -f supabase/tests/rls_matrix.sql 2>&1 | grep -E "^ *2[1-6] \||실패건수" -A1
```
Expected: 21~26 모두 pass `t`, 마지막 `0 | ALL PASS`

- [ ] **Step 5: 문서 갱신 후 커밋**

`supabase/README.md`의 `0004` 줄 아래에 추가:
```markdown
- `migrations/0005_video_records.sql` — 영상 기록(media_type·video_path·duration_ms, MP4 허용, 10MB). **0004 다음에 실행할 것**
```
`supabase/README.md`의 `(가시성 10건 + 쓰기 4건 + 서버 함수 5건)` → `(가시성 10건 + 쓰기 4건 + 서버 함수 5건 + 영상 6건)`
`supabase/tests/rls_matrix.sql` 첫 주석의 `-- 전제: migrations 0001~0004 적용.` → `-- 전제: migrations 0001~0005 적용.`

```bash
git add supabase/migrations/0005_video_records.sql supabase/tests/rls_matrix.sql supabase/README.md
git commit -m "feat: 영상 기록 DB·저장소 (0005) + RLS 케이스 6건"
```

---

### Task 2: 영상 필드를 타입과 사진 저장소 읽기에 연결

**Files:**
- Modify: `src/shared/types/remote.ts` (`RemotePost`)
- Modify: `src/shared/types/models.ts` (`Post`)
- Modify: `src/features/capture/repository.ts` (`withUrls`, `savePost`의 row)

**Interfaces:**
- Consumes: Task 1 컬럼
- Produces:
  - `export type MediaType = 'photo' | 'video'` (models.ts)
  - `Post.media_type: MediaType`, `Post.video_path: string | null` (읽어 온 값은 **서명 URL**), `Post.duration_ms: number | null`
  - `RemotePost.media_type: MediaType`, `RemotePost.video_path: string | null`, `RemotePost.duration_ms: number | null`

- [ ] **Step 1: 타입 추가**

`src/shared/types/models.ts` — `Visibility` 줄 아래:
```ts
export type MediaType = 'photo' | 'video';
```
`Post` 타입의 `photo_path` 줄 위에:
```ts
  media_type: MediaType;
  video_path: string | null; // 영상 기록만. 읽어 온 값은 서명 URL
  duration_ms: number | null; // 영상 기록만. 최대 5000(+인코딩 여유)
```
`src/shared/types/remote.ts` — import를 `import type { MediaType, Visibility } from '@/shared/types/models';`로 바꾸고, `RemotePost`의 `photo_path` 줄 위에:
```ts
  media_type: MediaType;
  video_path: string | null; // 'photos' 버킷 내 .mp4 경로. 사진이면 null
  duration_ms: number | null;
```

- [ ] **Step 2: 타입 검사로 빠진 곳 확인 (실패해야 함)**

Run: `npx tsc --noEmit`
Expected: `src/features/capture/repository.ts`에서 `media_type`·`video_path`·`duration_ms`가 없다는 오류 (withUrls 반환, savePost row)

- [ ] **Step 3: 저장소 읽기·쓰기 수정**

`src/features/capture/repository.ts`의 `withUrls`를 통째로 교체:
```ts
async function withUrls(rows: RemotePost[]): Promise<Post[]> {
  const keys = rows.flatMap((r) => (r.video_path ? [r.photo_path, r.thumb_path, r.video_path] : [r.photo_path, r.thumb_path]));
  const urls = await signPaths(keys);
  return rows.map((r) => ({
    id: r.id,
    project_id: r.project_id,
    media_type: r.media_type,
    photo_path: urls.get(r.photo_path) ?? '',
    thumb_path: urls.get(r.thumb_path) ?? '',
    video_path: r.video_path ? (urls.get(r.video_path) ?? null) : null,
    duration_ms: r.duration_ms,
    width: r.width,
    height: r.height,
    taken_at: r.taken_at,
    visibility: r.visibility,
    created_at: r.created_at,
    updated_at: r.updated_at,
    deleted_at: r.deleted_at,
  }));
}
```
`savePost` 안의 `const row: Omit<RemotePost, ...> = {` 블록에서 `project_id: input.projectId,` 다음 줄에 추가:
```ts
    media_type: 'photo',
    video_path: null,
    duration_ms: null,
```

- [ ] **Step 4: 타입 검사·단위 테스트 통과, 사진 흐름 회귀 확인**

Run: `npx tsc --noEmit && npx jest 2>&1 | grep "^Tests:"`
Expected: 오류 없음, `Tests: 33 passed`

로컬 웹 서버(8098, `--clear`)를 켠 뒤 사진 흐름 E2E를 돌린다. 스크래치의 `e2e_8098.mjs`(촬영 3장 → 목록 → 영상)를 사용:
Run: `node /private/tmp/claude-501/-Users-yuha-Desktop-playwright-260917/d654ea50-4041-441d-9dfb-c6a280e92a3a/scratchpad/e2e_8098.mjs 2>&1 | grep RESULT`
Expected: `RESULT: PASS`
DB 확인: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -Atc "select media_type, video_path is null from posts order by created_at desc limit 1"` → `photo|t`

- [ ] **Step 5: 커밋**

```bash
git add src/shared/types/models.ts src/shared/types/remote.ts src/features/capture/repository.ts
git commit -m "feat: 사진 저장소가 영상 필드(media_type·video_path·duration_ms)를 읽고 쓴다"
```

---

### Task 3: 영상 순수 계산 `clip.ts`

**Files:**
- Create: `src/features/capture/clip.ts`
- Test: `src/features/capture/__tests__/clip.test.ts`

**Interfaces:**
- Produces (모두 `@/features/capture/clip`에서 export):
  - `CLIP_MAX_MS = 5000`, `CLIP_MIN_MS = 1000`, `CLIP_SIDE = 1080`, `CLIP_FPS = 30`, `CLIP_BITRATE = 4_000_000`
  - `RECORDER_MIME_CANDIDATES: readonly string[]`
  - `pickRecorderMime(isSupported: (mime: string) => boolean): string | null`
  - `squareCrop(displayWidth: number, displayHeight: number): { left: number; top: number; width: number; height: number }`
  - `trimEndSec(durationSec: number): number`
  - `isTrimmed(durationSec: number): boolean`
  - `shouldAutoStop(elapsedMs: number): boolean`
  - `isLongEnough(elapsedMs: number): boolean`
  - `formatClipTime(ms: number): string` — `'0:03'`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/features/capture/__tests__/clip.test.ts`:
```ts
import {
  CLIP_MAX_MS,
  formatClipTime,
  isLongEnough,
  isTrimmed,
  pickRecorderMime,
  RECORDER_MIME_CANDIDATES,
  shouldAutoStop,
  squareCrop,
  trimEndSec,
} from '@/features/capture/clip';

describe('pickRecorderMime', () => {
  it('코덱을 명시한 H.264 MP4를 가장 먼저 고른다', () => {
    expect(pickRecorderMime(() => true)).toBe('video/mp4;codecs=avc1.640028');
  });
  it('H.264가 안 되면 WebM(VP8)으로 내려간다', () => {
    expect(pickRecorderMime((m) => m.startsWith('video/webm'))).toBe('video/webm;codecs=vp8');
  });
  it('코덱 없는 video/mp4만 되는 경우는 고르지 않는다 (브라우저마다 안에 넣는 코덱이 다름)', () => {
    expect(RECORDER_MIME_CANDIDATES).not.toContain('video/mp4');
    expect(pickRecorderMime((m) => m === 'video/mp4')).toBeNull();
  });
});

describe('squareCrop', () => {
  it('세로 화면은 위아래를 잘라 가운데 정사각', () => {
    expect(squareCrop(1080, 1920)).toEqual({ left: 0, top: 420, width: 1080, height: 1080 });
  });
  it('가로 화면은 좌우를 잘라 가운데 정사각', () => {
    expect(squareCrop(1920, 1080)).toEqual({ left: 420, top: 0, width: 1080, height: 1080 });
  });
  it('홀수 차이는 내림', () => {
    expect(squareCrop(1081, 1080)).toEqual({ left: 0, top: 0, width: 1080, height: 1080 });
  });
});

describe('trim', () => {
  it('5초보다 길면 5초에서 자르고 잘렸다고 알린다', () => {
    expect(trimEndSec(9.47)).toBe(5);
    expect(isTrimmed(9.47)).toBe(true);
  });
  it('5초 이하는 그대로', () => {
    expect(trimEndSec(4.98)).toBe(4.98);
    expect(isTrimmed(4.98)).toBe(false);
  });
});

describe('녹화 시간', () => {
  it('5초에 자동 정지', () => {
    expect(shouldAutoStop(CLIP_MAX_MS - 1)).toBe(false);
    expect(shouldAutoStop(CLIP_MAX_MS)).toBe(true);
  });
  it('1초 미만은 저장하지 않는다', () => {
    expect(isLongEnough(999)).toBe(false);
    expect(isLongEnough(1000)).toBe(true);
  });
  it('표시는 m:ss', () => {
    expect(formatClipTime(0)).toBe('0:00');
    expect(formatClipTime(3400)).toBe('0:03');
    expect(formatClipTime(5000)).toBe('0:05');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest src/features/capture/__tests__/clip.test.ts 2>&1 | tail -5`
Expected: FAIL `Cannot find module '@/features/capture/clip'`

- [ ] **Step 3: 구현**

`src/features/capture/clip.ts`:
```ts
/**
 * 영상 기록 순수 계산. 브라우저 의존 없음 → 테스트 가능.
 * 설계: docs/superpowers/specs/2026-09-17-video-records-design.md
 */

export const CLIP_MAX_MS = 5000;
export const CLIP_MIN_MS = 1000;
export const CLIP_SIDE = 1080;
export const CLIP_FPS = 30;
export const CLIP_BITRATE = 4_000_000;

/** 코덱까지 명시한다. 'video/mp4'만 주면 브라우저마다 안에 넣는 코덱이 달라 다시 못 읽는 경우가 있다 */
export const RECORDER_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.640028',
  'video/mp4;codecs=avc1',
  'video/webm;codecs=vp8',
  'video/webm;codecs=vp9',
] as const;

export function pickRecorderMime(isSupported: (mime: string) => boolean): string | null {
  return RECORDER_MIME_CANDIDATES.find((m) => isSupported(m)) ?? null;
}

/** 회전·픽셀비율을 반영한 화면 크기 기준 가운데 정사각 */
export function squareCrop(displayWidth: number, displayHeight: number) {
  const side = Math.min(displayWidth, displayHeight);
  return {
    left: Math.floor((displayWidth - side) / 2),
    top: Math.floor((displayHeight - side) / 2),
    width: side,
    height: side,
  };
}

export function trimEndSec(durationSec: number): number {
  return Math.min(durationSec, CLIP_MAX_MS / 1000);
}

export function isTrimmed(durationSec: number): boolean {
  return durationSec > CLIP_MAX_MS / 1000;
}

export function shouldAutoStop(elapsedMs: number): boolean {
  return elapsedMs >= CLIP_MAX_MS;
}

export function isLongEnough(elapsedMs: number): boolean {
  return elapsedMs >= CLIP_MIN_MS;
}

export function formatClipTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx jest src/features/capture/__tests__/clip.test.ts 2>&1 | grep -E "Tests:"`
Expected: `Tests: 11 passed, 11 total`

- [ ] **Step 5: 커밋**

```bash
git add src/features/capture/clip.ts src/features/capture/__tests__/clip.test.ts
git commit -m "feat: 영상 기록 순수 계산 (녹화 형식·정사각 크롭·5초 트림·녹화 시간)"
```

---

### Task 4: 변환 파이프라인 `videoPipeline.ts` (Mediabunny)

**Files:**
- Modify: `package.json`, `package-lock.json` (`npm install mediabunny@1.57.0`)
- Create: `src/features/capture/videoPipeline.ts`

**Interfaces:**
- Consumes: Task 3 `CLIP_SIDE`, `CLIP_FPS`, `CLIP_BITRATE`, `squareCrop`, `trimEndSec`, `isTrimmed`
- Produces:
  - `export type ProcessedClip = { mp4: Blob; durationMs: number; trimmed: boolean; posterUri: string }` — `posterUri`는 첫 장면 JPEG의 blob URL (1080×1080). 호출자가 다 쓰면 `URL.revokeObjectURL`
  - `export async function processClip(source: Blob, onProgress?: (ratio: number) => void): Promise<ProcessedClip>`
  - `export function canRecordVideo(): boolean` — MediaRecorder·VideoEncoder·VideoDecoder가 모두 있을 때 true

- [ ] **Step 1: 의존성 설치**

Run: `npm install mediabunny@1.57.0 && grep '"mediabunny"' package.json`
Expected: `"mediabunny": "^1.57.0"`

- [ ] **Step 2: 구현**

`src/features/capture/videoPipeline.ts`:
```ts
import {
  ALL_FORMATS,
  BlobSource,
  BufferSource,
  BufferTarget,
  CanvasSink,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
} from 'mediabunny';

import { CLIP_BITRATE, CLIP_FPS, CLIP_SIDE, isTrimmed, squareCrop, trimEndSec } from '@/features/capture/clip';

/**
 * 녹화·앨범 영상 → 저장 형식(1080×1080 H.264 MP4, 무음, 30fps, 5초 이하) + 첫 장면 JPEG.
 * 크롭은 회전·픽셀비율 반영 크기(getDisplayWidth/Height) 기준 가운데 정사각.
 * 회전은 메타데이터로 남기지 않고 프레임에 굽는다 (합성·재생 쪽이 회전을 신경 쓰지 않게).
 */

export type ProcessedClip = { mp4: Blob; durationMs: number; trimmed: boolean; posterUri: string };

export function canRecordVideo(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined';
}

export async function processClip(source: Blob, onProgress?: (ratio: number) => void): Promise<ProcessedClip> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(source) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('영상을 읽지 못했어요');
    if (!(await track.canDecode())) throw new Error('이 영상 형식은 읽을 수 없어요');
    const durationSec = await input.computeDuration();
    const crop = squareCrop(await track.getDisplayWidth(), await track.getDisplayHeight());

    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    const conversion = await Conversion.init({
      input,
      output,
      showWarnings: false,
      video: {
        crop,
        width: CLIP_SIDE,
        height: CLIP_SIDE,
        fit: 'cover',
        codec: 'avc',
        bitrate: CLIP_BITRATE,
        frameRate: CLIP_FPS,
        forceTranscode: true,
        allowTransformationMetadata: false,
      },
      audio: { discard: true },
      trim: { start: 0, end: trimEndSec(durationSec) },
    });
    if (!conversion.isValid) throw new Error('이 영상은 변환할 수 없어요');
    if (onProgress) conversion.onProgress = (p) => onProgress(p);
    await conversion.execute();
    if (!target.buffer) throw new Error('변환 결과가 비어 있어요');

    const mp4 = new Blob([target.buffer], { type: 'video/mp4' });
    const { durationMs, posterUri } = await readBack(target.buffer);
    return { mp4, durationMs, trimmed: isTrimmed(durationSec), posterUri };
  } finally {
    input.dispose();
  }
}

/** 변환 결과를 다시 열어 실제 길이와 첫 장면을 얻는다 */
async function readBack(buffer: ArrayBuffer): Promise<{ durationMs: number; posterUri: string }> {
  const back = new Input({ formats: ALL_FORMATS, source: new BufferSource(buffer) });
  try {
    const track = await back.getPrimaryVideoTrack();
    if (!track) throw new Error('변환 결과를 읽지 못했어요');
    const durationMs = Math.round((await back.computeDuration()) * 1000);
    const sink = new CanvasSink(track, { width: CLIP_SIDE, height: CLIP_SIDE, fit: 'cover', poolSize: 1 });
    const first = await sink.getCanvas(await track.getFirstTimestamp());
    if (!first) throw new Error('첫 장면을 읽지 못했어요');
    const jpeg = await canvasToJpeg(first.canvas);
    return { durationMs, posterUri: URL.createObjectURL(jpeg) };
  } finally {
    back.dispose();
  }
}

async function canvasToJpeg(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
  if (!blob) throw new Error('첫 장면을 저장하지 못했어요');
  return blob;
}
```

- [ ] **Step 3: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 오류 없음. (`getFirstTimestamp`가 트랙에 없다는 오류가 나면 `node_modules/mediabunny/dist/mediabunny.d.ts`에서 `InputVideoTrack`의 첫 타임스탬프 메서드 이름을 확인해 맞춘다)

- [ ] **Step 4: 커밋** (동작 검증은 Task 7 E2E)

```bash
git add package.json package-lock.json src/features/capture/videoPipeline.ts
git commit -m "feat: 영상 변환 파이프라인 (Mediabunny, 1080 정사각 H.264 무음 5초 + 첫 장면)"
```

---

### Task 5: 영상 기록 저장 `saveVideoPost`

**Files:**
- Modify: `src/shared/lib/supabase.ts` (경로 함수 추가)
- Modify: `src/features/capture/repository.ts` (`saveVideoPost`, `upload`에 contentType 인자)
- Modify: `src/features/capture/queries.ts` (`useSaveVideoPost`)

**Interfaces:**
- Consumes: Task 2 타입, Task 4 `processClip`, 기존 `processCapture(uri, width, height)` (`@/features/capture/image`)
- Produces:
  - `remoteVideoPath(ownerId: string, projectId: string, postId: string): string` → `${ownerId}/${projectId}/${postId}.mp4`
  - `saveVideoPost(input: { projectId: string; source: Blob; takenAt?: Date; onProgress?: (stage: 'converting' | 'uploading', ratio: number) => void }): Promise<{ post: Post; trimmed: boolean }>`
  - `useSaveVideoPost(projectId: string)` — mutation 변수 `{ source: Blob; onProgress?: ... }`, 결과 `{ post, trimmed }`

- [ ] **Step 1: 경로 함수**

`src/shared/lib/supabase.ts` 맨 아래:
```ts
export function remoteVideoPath(ownerId: string, projectId: string, postId: string): string {
  return `${ownerId}/${projectId}/${postId}.mp4`;
}
```

- [ ] **Step 2: 업로드 함수가 형식을 받게 수정**

`src/features/capture/repository.ts` 맨 아래 `upload`를 교체:
```ts
async function upload(key: string, body: Blob | string, contentType: 'image/jpeg' | 'video/mp4' = 'image/jpeg'): Promise<void> {
  const blob = typeof body === 'string' ? await (await fetch(body)).blob() : body;
  const { error } = await getSupabase().storage.from(PHOTOS_BUCKET).upload(key, blob, { contentType, upsert: false });
  if (error) throw new Error(`파일을 올리지 못했어요 (${key}): ${error.message}`);
}
```
(기존 호출 `upload(photoKey, photo.uri)`는 그대로 동작한다)

- [ ] **Step 3: `saveVideoPost` 추가**

`src/features/capture/repository.ts` import에 추가:
```ts
import { processClip } from '@/features/capture/videoPipeline';
```
그리고 `remoteVideoPath`를 supabase import 목록에 추가. `deletePost` 위에 넣는다:
```ts
/**
 * 영상 기록 저장 — 순서 고정 (설계 2절):
 * 변환 → 첫 장면 → 대표 사진·썸네일 → 업로드(영상 → 대표 사진 → 썸네일) → posts INSERT
 * 중간 실패 시 올린 파일을 지운다. source(녹화 원본)는 호출자가 성공할 때까지 들고 있는다.
 */
export async function saveVideoPost(input: {
  projectId: string;
  source: Blob;
  takenAt?: Date;
  onProgress?: (stage: 'converting' | 'uploading', ratio: number) => void;
}): Promise<{ post: Post; trimmed: boolean }> {
  const sb = getSupabase();
  const owner = requireUserId();
  const clip = await processClip(input.source, (r) => input.onProgress?.('converting', r));
  try {
    const { photo, thumb } = await processCapture(clip.posterUri, 1080, 1080);

    const { data: project, error: pe } = await sb
      .from('projects').select('default_visibility').eq('id', input.projectId).maybeSingle();
    if (pe) throw new Error(pe.message);

    const id = newId();
    const videoKey = remoteVideoPath(owner, input.projectId, id);
    const photoKey = remotePhotoPath(owner, input.projectId, id);
    const thumbKey = remoteThumbPath(owner, input.projectId, id);
    const uploaded: string[] = [];
    const bucket = sb.storage.from(PHOTOS_BUCKET);
    const cleanup = async () => {
      if (uploaded.length) await bucket.remove(uploaded);
    };

    try {
      input.onProgress?.('uploading', 0);
      await upload(videoKey, clip.mp4, 'video/mp4');
      uploaded.push(videoKey);
      input.onProgress?.('uploading', 0.8);
      await upload(photoKey, photo.uri);
      uploaded.push(photoKey);
      await upload(thumbKey, thumb.uri);
      uploaded.push(thumbKey);
    } catch (e) {
      await cleanup();
      throw e;
    }

    const now = new Date().toISOString();
    const row: Omit<RemotePost, 'like_count' | 'comment_count' | 'hidden_at' | 'caption'> = {
      id,
      project_id: input.projectId,
      owner_id: owner,
      media_type: 'video',
      photo_path: photoKey,
      thumb_path: thumbKey,
      video_path: videoKey,
      duration_ms: clip.durationMs,
      width: photo.width,
      height: photo.height,
      taken_at: (input.takenAt ?? new Date()).toISOString(),
      visibility: (project as { default_visibility: Post['visibility'] } | null)?.default_visibility ?? 'private',
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    const { error } = await sb.from('posts').insert(row);
    if (error) {
      await cleanup();
      throw new Error(`영상을 저장하지 못했어요: ${error.message}`);
    }
    input.onProgress?.('uploading', 1);
    return { post: row, trimmed: clip.trimmed };
  } finally {
    URL.revokeObjectURL(clip.posterUri);
  }
}
```

- [ ] **Step 4: 쿼리 훅**

`src/features/capture/queries.ts` import를 `import { latestPost, listPosts, savePost, saveVideoPost } from '@/features/capture/repository';`로 바꾸고 맨 아래 추가:
```ts
export function useSaveVideoPost(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { source: Blob; onProgress?: (stage: 'converting' | 'uploading', ratio: number) => void }) =>
      saveVideoPost({ projectId, ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.posts(projectId) });
      qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}
```

- [ ] **Step 5: 타입 검사·테스트 후 커밋**

Run: `npx tsc --noEmit && npx jest 2>&1 | grep "^Tests:"`
Expected: 오류 없음, `Tests: 44 passed`

```bash
git add src/shared/lib/supabase.ts src/features/capture/repository.ts src/features/capture/queries.ts
git commit -m "feat: 영상 기록 저장 (변환 → 대표 사진 → 영상·사진 업로드 → INSERT, 실패 시 정리)"
```

---

### Task 6: 촬영 화면 영상 모드

**Files:**
- Modify: `src/features/capture/Camera.tsx`
- Modify: `src/features/capture/store.ts`
- Create: `src/features/capture/MediaModeToggle.tsx`
- Modify: `src/app/capture/[projectId].tsx`
- Modify: `src/shared/ui/tokens.ts` (녹화 색)

**Interfaces:**
- Consumes: Task 3 `pickRecorderMime`, `shouldAutoStop`, `isLongEnough`, `formatClipTime`, `CLIP_MAX_MS`; Task 4 `canRecordVideo`; Task 5 `useSaveVideoPost`
- Produces:
  - `WebCameraHandle.startRecording(): void`, `WebCameraHandle.stopRecording(): Promise<Blob>`
  - `CameraView` prop `mode?: 'photo' | 'video'`
  - `useCaptureSettings` 에 `mode: CaptureMode`, `setMode(m)` (`export type CaptureMode = 'photo' | 'video'`)
  - `MediaModeToggle({ value, onChange, videoDisabled })`

- [ ] **Step 1: 토큰**

`src/shared/ui/tokens.ts`의 `color`에 `gridLine` 줄 아래 추가:
```ts
  recording: '#D6453D', // 녹화 중 셔터 테두리·REC 배지
```

- [ ] **Step 2: 모드 기억**

`src/features/capture/store.ts`를 교체:
```ts
import { create } from 'zustand';

import type { GhostLevel } from '@/shared/ui/tokens';

export type CaptureMode = 'photo' | 'video';

/** 촬영 화면 로컬 설정. 세션 동안 유지. (서버 상태 아님 → Zustand) */
type CaptureSettings = {
  ghost: GhostLevel;
  grid: boolean;
  mode: CaptureMode;
  setGhost: (g: GhostLevel) => void;
  toggleGrid: () => void;
  setMode: (m: CaptureMode) => void;
};

export const useCaptureSettings = create<CaptureSettings>((set) => ({
  ghost: 'low',
  grid: true,
  mode: 'photo',
  setGhost: (ghost) => set({ ghost }),
  toggleGrid: () => set((s) => ({ grid: !s.grid })),
  setMode: (mode) => set({ mode }),
}));
```

- [ ] **Step 3: 카메라 녹화 기능**

`src/features/capture/Camera.tsx`에서:

(a) import에 추가: `import { pickRecorderMime } from '@/features/capture/clip';`

(b) 타입 교체:
```ts
export type WebCameraHandle = {
  takePictureAsync: (options?: object) => Promise<Shot>;
  /** 녹화 시작. 이미 녹화 중이면 무시 */
  startRecording: () => void;
  /** 녹화 끝. 녹화 원본 Blob */
  stopRecording: () => Promise<Blob>;
};

type Props = {
  ref?: Ref<WebCameraHandle>;
  facing?: 'back' | 'front';
  /** 영상 모드는 정사각 크기를 요청하지 않는다 (녹화 파일이 눌려 기록되는 것을 피함) */
  mode?: 'photo' | 'video';
  onCameraReady?: () => void;
  style?: { width?: number; height?: number; marginTop?: number };
  animateShutter?: boolean;
};
```

(c) 상수 아래 추가:
```ts
/** 영상 모드: 가로만 요청. 정사각 요청 시 iPhone 녹화본이 눌려 기록되는 문제를 피한다 (설계 0절) */
const VIDEO_IDEAL_WIDTH = 1920;
```

(d) 함수 시그니처를 `export function CameraView({ ref, facing = 'back', mode = 'photo', onCameraReady, style }: Props) {`로, 그 아래에 녹화 상태 추가:
```ts
  const streamRef = useRef<MediaStream | null>(null);
  const recorder = useRef<{ rec: MediaRecorder; chunks: Blob[]; done: Promise<void> } | null>(null);
```

(e) `getUserMedia` 호출의 `video` 객체를 교체:
```ts
        video:
          mode === 'video'
            ? { facingMode: { ideal: facing === 'back' ? 'environment' : 'user' }, width: { ideal: VIDEO_IDEAL_WIDTH } }
            : {
                facingMode: { ideal: facing === 'back' ? 'environment' : 'user' },
                width: { ideal: IDEAL_SIDE },
                height: { ideal: IDEAL_SIDE },
              },
```
`stream = s;` 다음 줄에 `streamRef.current = s;` 추가, 정리 함수(`return () => { ... }`)에 `streamRef.current = null;` 추가, 효과 의존성을 `[facing, mode]`로 바꾼다.

(f) `useImperativeHandle` 반환 객체에 `takePictureAsync` 다음으로 추가:
```ts
    startRecording: () => {
      const s = streamRef.current;
      if (!s || recorder.current) return;
      const mime = pickRecorderMime((m) => MediaRecorder.isTypeSupported(m));
      if (!mime) throw new Error('이 브라우저에서는 영상을 녹화할 수 없어요');
      const rec = new MediaRecorder(s, { mimeType: mime });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      const done = new Promise<void>((resolve) => {
        rec.onstop = () => resolve();
      });
      rec.start(250);
      recorder.current = { rec, chunks, done };
    },
    stopRecording: async () => {
      const r = recorder.current;
      if (!r) throw new Error('녹화 중이 아니에요');
      if (r.rec.state !== 'inactive') r.rec.stop();
      await r.done;
      recorder.current = null;
      return new Blob(r.chunks, { type: r.rec.mimeType });
    },
```

- [ ] **Step 4: 모드 토글 컴포넌트**

`src/features/capture/MediaModeToggle.tsx`:
```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CaptureMode } from '@/features/capture/store';
import { color, fontSize, fontWeight, radius, size } from '@/shared/ui/tokens';

type Props = { value: CaptureMode; onChange: (m: CaptureMode) => void; videoDisabled?: boolean };

const OPTIONS: { key: CaptureMode; label: string }[] = [
  { key: 'photo', label: '사진' },
  { key: 'video', label: '영상' },
];

/** 촬영 화면(어두운 배경)용 [사진 | 영상]. 선택 상태는 aria-checked (react-native-web이 accessibilityState를 옮기지 않음) */
export function MediaModeToggle({ value, onChange, videoDisabled }: Props) {
  return (
    <View style={styles.group} accessibilityRole="radiogroup">
      {OPTIONS.map((o, i) => {
        const on = o.key === value;
        const disabled = o.key === 'video' && videoDisabled;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            aria-checked={on}
            aria-disabled={disabled}
            disabled={disabled}
            onPress={() => onChange(o.key)}
            style={[styles.seg, i > 0 && styles.divider, on && styles.segOn, disabled && styles.segDisabled]}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignSelf: 'center',
    height: size.tap,
    borderWidth: size.hairline,
    borderColor: color.onDarkBorder,
    borderRadius: radius.button,
    overflow: 'hidden',
  },
  seg: { width: size.albumButton + size.tap, alignItems: 'center', justifyContent: 'center' },
  divider: { borderLeftWidth: size.hairline, borderLeftColor: color.onDarkBorder },
  segOn: { backgroundColor: color.onDark },
  segDisabled: { opacity: 0.4 },
  label: { fontSize: fontSize.label, fontWeight: fontWeight.semibold, color: color.onDarkSecondary },
  labelOn: { color: color.cameraBg },
});
```

- [ ] **Step 5: 촬영 화면 연결**

`src/app/capture/[projectId].tsx`에서:

(a) import 추가·수정:
```tsx
import { useEffect, useRef, useState } from 'react';
import { formatClipTime, isLongEnough, shouldAutoStop } from '@/features/capture/clip';
import { MediaModeToggle } from '@/features/capture/MediaModeToggle';
import { useLatestPost, useSavePost, useSaveVideoPost } from '@/features/capture/queries';
import { canRecordVideo } from '@/features/capture/videoPipeline';
```
(기존 `useRef, useState` import 줄과 `useLatestPost, useSavePost` import 줄은 위 내용으로 교체)

(b) `const save = useSavePost(projectId);` 아래 추가:
```tsx
  const saveVideo = useSaveVideoPost(projectId);
  const { ghost, grid, mode, setGhost, toggleGrid, setMode } = useCaptureSettings();
  const videoSupported = canRecordVideo();
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState<string | null>(null);
```
그리고 기존 `const { ghost, grid, setGhost, toggleGrid } = useCaptureSettings();` 줄은 지운다.

(c) `persist` 함수 아래에 영상 저장·녹화 함수 추가:
```tsx
  /** 녹화 원본(source)은 성공할 때까지 이 클로저가 들고 있어 "다시 시도"가 재촬영 없이 동작한다 */
  const persistVideo = (source: Blob) => {
    setProgress('변환 중 0%');
    saveVideo.mutate(
      {
        source,
        onProgress: (stage, r) => setProgress(stage === 'converting' ? `변환 중 ${Math.round(r * 100)}%` : '올리는 중'),
      },
      {
        onSuccess: ({ trimmed }) => {
          setProgress(null);
          if (trimmed) showAlert('앞 5초만 저장했어요', '영상 기록은 5초까지예요.');
          router.back();
        },
        onError: (e) => {
          setProgress(null);
          showAlert('영상을 저장하지 못했어요', e instanceof Error ? e.message : String(e), [
            { text: '다시 시도', onPress: () => persistVideo(source) },
            { text: '닫기', style: 'cancel' },
          ]);
        },
      },
    );
  };

  const stopAndSave = async () => {
    if (!camera.current || recordingSince === null) return;
    const took = Date.now() - recordingSince;
    setRecordingSince(null);
    const blob = await camera.current.stopRecording();
    if (!isLongEnough(took)) {
      showAlert('1초 이상 찍어 주세요');
      return;
    }
    persistVideo(blob);
  };

  const toggleRecording = () => {
    if (!camera.current || !ready) return;
    if (recordingSince !== null) {
      void stopAndSave();
      return;
    }
    try {
      camera.current.startRecording();
      setElapsed(0);
      setRecordingSince(Date.now());
    } catch (e) {
      showAlert('녹화하지 못했어요', e instanceof Error ? e.message : String(e));
    }
  };

  // 녹화 시간 표시와 5초 자동 정지
  useEffect(() => {
    if (recordingSince === null) return;
    const t = setInterval(() => {
      const ms = Date.now() - recordingSince;
      setElapsed(ms);
      if (shouldAutoStop(ms)) void stopAndSave();
    }, 100);
    return () => clearInterval(t);
  });
```

(d) `pickFromAlbum`을 교체:
```tsx
  const pickFromAlbum = async () => {
    if (busy || recordingSince !== null) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [mode === 'video' ? 'videos' : 'images'],
      quality: 1,
      exif: false,
    });
    const a = res.assets?.[0];
    if (res.canceled || !a) return;
    if (mode === 'video') {
      persistVideo(await (await fetch(a.uri)).blob());
      return;
    }
    persist({ uri: a.uri, width: a.width, height: a.height });
  };
```

(e) `const saving = save.isPending;`를 `const saving = save.isPending || saveVideo.isPending;`로.

(f) `<CameraView` 에 `mode={mode}` prop 추가.

(g) 저장 오버레이 문구: `<Text style={styles.savingText}>저장 중</Text>` → `<Text style={styles.savingText}>{progress ?? '저장 중'}</Text>`

(h) 정사각 영역 안 `{grid ? <GridOverlay /> : null}` 다음 줄에 녹화 배지:
```tsx
        {recordingSince !== null ? (
          <View pointerEvents="none" style={styles.recBadge}>
            <Text style={styles.recBadgeText}>● {formatClipTime(elapsed)} / 0:05</Text>
          </View>
        ) : null}
```

(i) `<View style={styles.bottom}>` 바로 다음 줄에 모드 토글:
```tsx
        <MediaModeToggle
          value={mode}
          onChange={(m) => recordingSince === null && setMode(m)}
          videoDisabled={!videoSupported}
        />
```

(j) 셔터 `Pressable`의 `accessibilityLabel`·`onPress`·`style`을 교체:
```tsx
            accessibilityLabel={mode === 'video' ? (recordingSince !== null ? '녹화 끝' : '녹화') : '촬영'}
            onPress={mode === 'video' ? toggleRecording : shoot}
            disabled={!ready || busy || saving}
            style={({ pressed }) => [
              styles.shutter,
              recordingSince !== null && styles.shutterRecording,
              (pressed || busy) && styles.shutterPressed,
              !ready && styles.shutterDisabled,
            ]}
```

(k) `styles`에 추가:
```tsx
  recBadge: {
    position: 'absolute', right: space.md, top: space.md,
    paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.button, backgroundColor: color.recording,
  },
  recBadgeText: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold, color: color.onDark, fontVariant: ['tabular-nums'] },
  shutterRecording: { borderColor: color.recording },
```

(l) `bottom` 스타일에 `gap: space.md`를 더한다: `bottom: { flex: 1, justifyContent: 'space-between', gap: space.md, paddingHorizontal: space.xl, paddingTop: space.xl },`

(m) 토글이 들어가 세로 공간이 늘었으므로 `tokens.ts`의 `webCaptureChrome: 260`을 `webCaptureChrome: 316`으로 (`size.tap` 44 + gap 12).

- [ ] **Step 6: 타입 검사·테스트**

Run: `npx tsc --noEmit && npx jest 2>&1 | grep "^Tests:"`
Expected: 오류 없음, `Tests: 44 passed`

- [ ] **Step 7: 커밋**

```bash
git add src/features/capture/Camera.tsx src/features/capture/store.ts src/features/capture/MediaModeToggle.tsx "src/app/capture/[projectId].tsx" src/shared/ui/tokens.ts
git commit -m "feat: 촬영 화면 영상 모드 (녹화·5초 자동 정지·진행 표시·앨범 영상·다시 시도)"
```

---

### Task 7: 영상 촬영·저장 E2E (원 비율 검사 포함)

**Files:**
- Modify: `package.json` (`npm install -D playwright@1.63.0`)
- Create: `scripts/e2e/video-capture.mjs`

**Interfaces:**
- Consumes: Task 1~6 전부. 로컬 웹 서버 `http://localhost:8098`(로컬 Supabase), 로컬 DB
- Produces: `node scripts/e2e/video-capture.mjs` → 마지막 줄 `RESULT: PASS`

- [ ] **Step 1: Playwright 설치**

Run: `npm install -D playwright@1.63.0 && npx playwright install chromium`
Expected: 설치 완료 (이미 받은 브라우저면 바로 끝남)

- [ ] **Step 2: E2E 스크립트 작성**

`scripts/e2e/video-capture.mjs`:
```js
// 영상 기록 E2E: 로컬 웹(8098) + 로컬 Supabase + Chromium 가짜 카메라(원 그림 y4m).
// 실행 전: 로컬 Supabase에 0005 적용, 웹 서버 --clear로 실행.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = 'http://localhost:8098';
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const API = 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // npx supabase status -o env 의 SERVICE_ROLE_KEY
if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_KEY 환경변수가 필요해요');

const dir = mkdtempSync(join(tmpdir(), 'knit-video-'));
const run = (cmd, args) => execFileSync(cmd, args, { maxBuffer: 64 * 1024 * 1024 });
const sql = (q) => run('psql', [DB, '-Atc', q]).toString().trim();
let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
  if (!ok) failed += 1;
};

// 가짜 카메라: 흰 바탕 가운데 파란 원 (가로 1920×1080). 원이 원으로 남는지로 찌그러짐을 잡는다
const circle = "geq=r='if(lt(hypot(X-960,Y-540),300),0,255)':g='if(lt(hypot(X-960,Y-540),300),0,255)':b=255";
run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=1920x1080:r=30:d=6', '-vf', circle, '-pix_fmt', 'yuv420p', join(dir, 'cam.y4m')]);
// 앨범용: 8초, 세로(회전 90°) 영상
run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=1920x1080:r=30:d=8', '-vf', circle, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(dir, 'src8.mp4')]);
run('ffmpeg', ['-v', 'error', '-y', '-display_rotation', '90', '-i', join(dir, 'src8.mp4'), '-c', 'copy', join(dir, 'album8.mp4')]);

/** 저장된 mp4를 받아 ffprobe 정보와 원의 가로/세로 비율(가운데 프레임)을 잰다 */
async function inspect(key) {
  const res = await fetch(`${API}/storage/v1/object/photos/${key}`, { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } });
  const file = join(dir, key.replaceAll('/', '_'));
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', file]).toString());
  const raw = run('ffmpeg', ['-v', 'error', '-ss', '1', '-i', file, '-frames:v', '1', '-vf', 'scale=270:270', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  let minX = 270, maxX = -1, minY = 270, maxY = -1;
  for (let y = 0; y < 270; y += 1) for (let x = 0; x < 270; x += 1) {
    const i = (y * 270 + x) * 3;
    if (raw[i] < 100 && raw[i + 1] < 100 && raw[i + 2] > 150) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  const ratio = (maxX - minX + 1) / (maxY - minY + 1);
  return { probe, ratio };
}

const browser = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${join(dir, 'cam.y4m')}`],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('dialog', async (d) => { console.log('[dialog]', d.message()); await d.accept(); });
const stamp = Date.now().toString(36);
const email = `vid_${stamp}@example.com`;

try {
  await page.goto(BASE, { timeout: 180000 });
  await page.getByText('계정이 없어요, 가입할게요').click({ timeout: 120000 });
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('6자 이상').fill('password123');
  await page.getByRole('button', { name: '가입하기' }).click();
  await page.getByPlaceholder('knitter_haeun').fill(`vid_${stamp}`);
  await page.getByPlaceholder('하은').fill('영상');
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.goto(`${BASE}/projects`);
  await page.getByRole('button', { name: '편물 만들기' }).click({ timeout: 30000 });
  await page.getByPlaceholder('예: 회색 라글란 스웨터').fill('영상 스웨터');
  await page.getByRole('button', { name: '만들기', exact: true }).click();

  console.log('\n== 3초 녹화');
  await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 30000 });
  await page.getByRole('radio', { name: '영상' }).click();
  await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
  await page.getByRole('button', { name: '녹화', exact: true }).click();
  await page.waitForTimeout(3200);
  await page.getByRole('button', { name: '녹화 끝' }).click();
  await page.getByText('1 / 1').waitFor({ timeout: 120000 });

  const owner = sql(`select id from auth.users where email = '${email}'`);
  const rec = sql(`select media_type || '|' || duration_ms || '|' || video_path || '|' || photo_path from posts where owner_id = '${owner}' order by created_at desc limit 1`).split('|');
  check('DB 영상 기록', rec[0] === 'video' && Number(rec[1]) >= 2500 && Number(rec[1]) <= 5000, rec.slice(0, 2).join(' '));
  const recInfo = await inspect(rec[2]);
  const v = recInfo.probe.streams.find((s) => s.codec_type === 'video');
  check('녹화 파일 1080×1080 H.264', v?.width === 1080 && v?.height === 1080 && v?.codec_name === 'h264', `${v?.width}×${v?.height} ${v?.codec_name}`);
  check('녹화 파일 오디오 없음', !recInfo.probe.streams.some((s) => s.codec_type === 'audio'));
  check('녹화 원이 원으로 남음 (0.95~1.05)', recInfo.ratio > 0.95 && recInfo.ratio < 1.05, recInfo.ratio.toFixed(3));
  check('대표 사진 존재', sql(`select count(*) from storage.objects where name = '${rec[3]}'`) === '1');

  console.log('\n== 앨범 8초 세로 영상');
  await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 30000 });
  await page.getByRole('radio', { name: '영상' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 30000 }),
    page.getByRole('button', { name: '앨범에서 가져오기' }).click(),
  ]);
  await chooser.setFiles(join(dir, 'album8.mp4'));
  await page.getByText('2 / 2').waitFor({ timeout: 120000 });
  const alb = sql(`select duration_ms || '|' || video_path from posts where owner_id = '${owner}' order by created_at desc limit 1`).split('|');
  check('앨범 영상 5초로 잘림', Number(alb[0]) >= 4900 && Number(alb[0]) <= 5000, alb[0]);
  const albInfo = await inspect(alb[1]);
  check('앨범 회전 영상 원이 원으로 남음', albInfo.ratio > 0.95 && albInfo.ratio < 1.05, albInfo.ratio.toFixed(3));

  console.log('\n== 사진 모드 회귀');
  await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 30000 });
  await page.getByRole('radio', { name: '사진' }).click();
  await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
  await page.getByRole('button', { name: '촬영' }).click();
  await page.getByText('3 / 3').waitFor({ timeout: 60000 });
  check('사진 기록은 photo', sql(`select media_type from posts where owner_id = '${owner}' order by created_at desc limit 1`) === 'photo');
} catch (e) {
  failed += 1;
  console.log('ERROR', e.message);
  await page.screenshot({ path: join(dir, 'failure.png') });
  console.log('스크린샷:', join(dir, 'failure.png'));
} finally {
  await browser.close();
  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed})`);
  process.exitCode = failed === 0 ? 0 : 1;
}
```

- [ ] **Step 3: 실행**

Run:
```bash
cd /private/tmp/claude-501/-Users-yuha-Desktop-playwright-260917/d654ea50-4041-441d-9dfb-c6a280e92a3a/scratchpad/sb && export SUPABASE_SERVICE_KEY=$(npx supabase status -o env | grep '^SERVICE_ROLE_KEY=' | cut -d'"' -f2) && cd ~/Projects/Knitting && node scripts/e2e/video-capture.mjs
```
Expected: PASS 10줄, 마지막 `RESULT: PASS`

실패하면: 먼저 웹 서버를 `--clear`로 다시 켰는지 확인. `원이 원으로 남음`만 실패하면 비율 값(가로/세로)을 기록하고 **Task 4의 크롭·`allowTransformationMetadata`부터** 의심한다 (설계 0절 미해결 항목).

- [ ] **Step 4: 기존 E2E 회귀**

Run: 스크래치의 `e2e_8098.mjs`, `e2e2_8098.mjs`, `e2e3_8098.mjs`, `e2e_result.mjs <outdir>`, `e2e_share.mjs`
Expected: 모두 `RESULT: PASS`

- [ ] **Step 5: 커밋**

```bash
git add package.json package-lock.json scripts/e2e/video-capture.mjs
git commit -m "test: 영상 기록 E2E (녹화·앨범 5초 트림·1080 H.264 무음·원 비율·사진 회귀)"
```

---

### Task 8: 실서버 반영과 iPhone 확인 (하은 승인 필요)

**Files:**
- Modify: `docs/MVP_상태.md`, `CLAUDE.md` (마이그레이션 순서 `0001 → 0005`)

- [ ] **Step 1: 하은에게 실서버 SQL 적용 요청** — `supabase/migrations/0005_video_records.sql`을 클립보드(`pbcopy <`)에 넣고 SQL Editor 실행을 한 단계씩 안내. "Success. No rows returned" 확인
- [ ] **Step 2: 운영 배포 (승인 후)** — `npx vercel deploy --prod` → `https://knitting-pied.vercel.app` 200, 번들에 Supabase 주소 포함 확인
- [ ] **Step 3: iPhone 확인 목록 전달** — (1) 세로로 들고 동그란 물건 3초 녹화 → 타임라인에서 동그랗게 보이는지 (2) 저장까지 걸린 시간 (3) 카메라 앱으로 세로 영상 → 앨범 가져오기 → 똑바로·동그랗게 (4) **사진 모드로 동그란 물건 촬영 → 동그랗게 저장되는지** (사진도 같은 카메라 요청을 써 왔다)
- [ ] **Step 4: 결과를 `docs/MVP_상태.md` "확인한 것/못 한 것"에 기록, `CLAUDE.md` 서버 줄을 `0001 → 0005`로, 커밋**

```bash
git add docs/MVP_상태.md CLAUDE.md
git commit -m "docs: 영상 기록 실기기 확인 결과"
```

---

## 3~5단계 개요 (다음 계획에서 상세화)

- **3단계 타임라인·피드 재생:** `shared/ui/VideoPlayer.tsx`(`<video muted loop playsInline autoplay poster>`), 타임라인 현재 기록이 영상이면 재생 + `▶ 0:04` 배지, 피드·격자는 대표 사진 + `▶`, 게시물 상세 자동 재생. `social/api.ts` 피드 조회에 `video_path` 서명 추가
- **4단계 결과 사진 MP4:** `resultPlan.ts`에 `outputKindOf(panels) → 'jpeg' | 'mp4'`, 칸별 시각→프레임 매핑 순수 함수. `composeResult.ts`에 MP4 경로(Mediabunny `CanvasSource` + 칸마다 `CanvasSink`), 미리보기 `<video>`, 안내 "비디오 저장"
- **5단계 성장 영상:** `plan.ts`를 `{ kind: 'photo' | 'video'; uri: string; durationMs: number }[]` 구간 목록으로, 30fps, 영상 클립 재생·마지막 +1초. `makeVideo.ts`를 Mediabunny로 교체하고 `mp4-muxer` 제거
