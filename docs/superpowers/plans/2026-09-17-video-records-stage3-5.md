# 영상 기록 3~5단계 (재생 · 섞인 결과물 · 성장 영상) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 영상 기록을 타임라인·게시물에서 재생하고, 결과 사진 화면과 성장 영상이 사진·영상 섞인 기록으로도 만들어지게 한다.

**Architecture:** 재생은 공통 `VideoPlayer`(DOM `<video>`) 하나. 결과물·성장 영상은 기록을 `MediaItem`(사진 | 영상)으로 바꾼 뒤, 순수 함수가 장면·시간 구간을 정하고, 공통 인코딩 부품(`mediaWriter.ts`: Mediabunny `CanvasSource` → MP4, 영상 클립 프레임을 시간순으로 꺼내는 `ClipCursor`)이 프레임을 그린다. `mp4-muxer`는 제거한다.

**Tech Stack:** Expo SDK 57 웹 (react-native-web), React 19 + React Compiler, TypeScript strict, Mediabunny 1.57.0, Jest, Playwright E2E, ffprobe.

**Spec:** `docs/superpowers/specs/2026-09-17-video-records-design.md` 3·4·5절 — 반드시 함께 읽는다. 1~2단계 계획: `docs/superpowers/plans/2026-09-17-video-records.md` (완료, main 병합).

## Global Constraints

- 타임라인: 현재 기록이 영상이면 `<video muted loop playsInline autoplay>` + 대표 사진 포스터 + `▶ 0:04` 배지. **보고 있는 한 개만** 로드
- 피드·프로필 격자: 대표 사진 + `▶` 표시, **자동 재생 없음**. 게시물 상세에서 자동 반복 재생
- 재생 실패: 대표 사진 + "영상을 불러오지 못했어요"
- 결과 사진 화면: 칸 고르기 규칙 그대로. 고른 기록이 모두 사진 → JPEG(현행), **하나라도 영상 → MP4**
  - 길이 = 칸 중 가장 긴 영상(≤ 5초), **30fps**, 1080×1080 H.264
  - 사진 칸 정지, 영상 칸 재생, 짧은 영상은 마지막 장면 정지, 라벨·편물 이름은 매 프레임
  - 미리보기는 영상 반복, 안내 문구 "비디오 저장"
- 성장 영상: **30fps**, 사진 머무는 시간은 현행과 같음 (기록 수 ≤8: 500ms, ≤24: 250ms, 그 이상: 125ms), 영상은 클립 끝까지 재생, **마지막 기록 +1000ms** (영상이면 마지막 장면 정지)
- 성장 영상은 클립을 **한 번에 하나씩** 디코드 (메모리). `mp4-muxer` 제거
- 출력 MP4 비트레이트 6,000,000bps
- 네이티브 코드·`Platform.OS`·`.web.ts` 금지. 스타일 색·픽셀은 `tokens.ts`만(DOM `style`도 tokens 값 사용). 대화상자 `showAlert`. 선택 상태 `aria-checked`. 화면 문구 한국어
- 서명 URL은 배치(`signPaths`/`signPhotoUrls`)로만
- 커밋 `feat:`/`fix:`/`test:`/`refactor:` 접두사, 끝에 빈 줄 + `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

## 로컬 환경 (실행자 필독)

- 저장소 `~/Projects/Knitting`, 브랜치 `feat/video-playback-results` (main에서 분기)
- 로컬 Supabase: `/private/tmp/claude-501/-Users-yuha-Desktop-playwright-260917/d654ea50-4041-441d-9dfb-c6a280e92a3a/scratchpad/sb`에서 Docker 실행 중 (0001~0005 적용). DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. 키는 그 폴더에서 `npx supabase status -o env` (`ANON_KEY`, `SERVICE_ROLE_KEY`)
- 로컬 웹(8098): 저장소에서 `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY> CI=1 npx expo start --web --port 8098 --clear` (백그라운드). **소스를 바꾸면 `--clear`로 다시 켠다.** 끝나면 `lsof -ti:8098 | xargs kill`. 8099는 건드리지 않는다
- 기존 E2E: `SUPABASE_SERVICE_KEY=<SERVICE_ROLE_KEY> node scripts/e2e/video-capture.mjs`; 회귀 스크립트(8098)는 스크래치 폴더의 `e2e_8098.mjs`, `e2e2_8098.mjs`, `e2e3_8098.mjs`, `e2e_result.mjs <outdir>`, `e2e_share.mjs` (그 폴더에서 `node`)
- 운영 배포·실서버·푸시 금지

## File Structure

| 파일 | 책임 |
|---|---|
| `src/shared/ui/VideoPlayer.tsx` (생성) | DOM `<video>` 재생 + 실패 시 포스터·문구 |
| `src/shared/ui/VideoBadge.tsx` (생성) | `▶ 0:04` / `▶` 배지 |
| `src/app/project/[id].tsx` (수정) | 타임라인 현재 영상 재생 + 배지, 성장 영상 예상 길이 |
| `src/features/social/PostCard.tsx`, `src/app/(tabs)/me.tsx`, `src/app/user/[username].tsx` (수정) | 격자·카드 `▶` 배지 |
| `src/features/social/api.ts`, `src/app/post/[id].tsx` (수정) | 상세에서 영상 서명·재생 |
| `src/features/media/mediaItem.ts` (생성) + 테스트 | `MediaItem`, `mediaOf(post)` |
| `src/features/media/clipCursor.ts` (생성) + 테스트 | 시간 → 영상 프레임 (앞으로만, 끝이면 마지막 유지) |
| `src/features/media/resultPlan.ts` (수정) + 테스트 | 칸 media, `outputKindOf`, `sceneDurationMs`, 파일 이름 확장자 |
| `src/features/media/plan.ts` (재작성) + 테스트 | 성장 영상 시간 구간 |
| `src/features/media/mediaWriter.ts` (생성) | Mediabunny MP4 쓰기 + 클립 열기 |
| `src/features/media/composeResult.ts` (수정) | JPEG/MP4 두 경로, 공통 그리기 |
| `src/features/media/useResultPhoto.ts`, `src/app/result/[projectId].tsx` (수정) | 결과 종류·진행률·영상 미리보기 |
| `src/features/media/makeVideo.ts` (재작성), `MakeVideoSheet.tsx` (수정) | 구간 기반 30fps, 기록 수 표기 |
| `scripts/e2e/video-results.mjs` (생성) | 재생·섞인 결과 MP4·성장 영상 E2E |

---

### Task 1: 재생 (타임라인·게시물 상세·격자 배지)

**Files:**
- Create: `src/shared/ui/VideoPlayer.tsx`, `src/shared/ui/VideoBadge.tsx`
- Modify: `src/app/project/[id].tsx`, `src/features/social/PostCard.tsx`, `src/app/(tabs)/me.tsx`, `src/app/user/[username].tsx`, `src/features/social/api.ts` (`fetchPost`), `src/app/post/[id].tsx`, `src/features/social/queries.ts` (fetchPost 결과 타입을 쓰는 곳이 있으면)

**Interfaces:**
- Consumes: `Post.media_type`/`video_path`(서명 URL)/`duration_ms` (capture repository), `FeedPost`(= `RemotePost` + …, `media_type`·`video_path`·`duration_ms` 포함, `video_path`는 Storage 키), `formatClipTime(ms)` (`@/features/capture/clip`)
- Produces:
  - `VideoPlayer({ uri, poster, label }: { uri: string; poster?: string; label?: string })` — 부모 영역을 꽉 채운다 (`position: absolute; inset 0`)
  - `VideoBadge({ durationMs }: { durationMs?: number | null })` — `durationMs`가 있으면 `▶ 0:04`, 없으면 `▶`
  - `fetchPost(postId)` → `{ post: FeedPost; url: string | null; videoUrl: string | null }`

- [ ] **Step 1: VideoPlayer**

`src/shared/ui/VideoPlayer.tsx`:
```tsx
import { useState } from 'react';

import { color, fontSize, space } from '@/shared/ui/tokens';

type Props = { uri: string; poster?: string; label?: string };

/**
 * 영상 기록 재생. 소리 없이 자동 반복. 실패하면 대표 사진과 안내 문구.
 * 부모 영역을 꽉 채운다. uri가 바뀌면 부모가 key로 새로 만든다 (실패 상태 초기화).
 */
export function VideoPlayer({ uri, poster, label }: Props) {
  const [failed, setFailed] = useState(false);
  const fill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' } as const;

  if (failed) {
    return (
      <div style={fill}>
        {poster ? <img src={poster} alt="" style={{ ...fill, objectFit: 'cover' }} /> : null}
        <div
          role="status"
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.md,
            background: color.photoLabelBg, color: color.onDark, fontSize: fontSize.caption, textAlign: 'center',
          }}
        >
          영상을 불러오지 못했어요
        </div>
      </div>
    );
  }

  return (
    <video
      src={uri}
      poster={poster}
      aria-label={label}
      muted
      loop
      playsInline
      autoPlay
      preload="metadata"
      onError={() => setFailed(true)}
      style={{ ...fill, objectFit: 'cover', display: 'block' }}
    />
  );
}
```

- [ ] **Step 2: VideoBadge**

`src/shared/ui/VideoBadge.tsx`:
```tsx
import { StyleSheet, Text, View } from 'react-native';

import { formatClipTime } from '@/features/capture/clip';
import { color, fontSize, fontWeight, radius, space } from '@/shared/ui/tokens';

type Props = { durationMs?: number | null };

/** 영상 기록 표시. 길이가 있으면 "▶ 0:04", 없으면 "▶" (격자용) */
export function VideoBadge({ durationMs }: Props) {
  return (
    <View pointerEvents="none" style={styles.badge} accessibilityLabel="영상 기록">
      <Text style={styles.text}>{durationMs ? `▶ ${formatClipTime(durationMs)}` : '▶'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute', left: space.sm, bottom: space.sm,
    paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.button, backgroundColor: color.photoLabelBg,
  },
  text: { fontSize: fontSize.micro, fontWeight: fontWeight.semibold, color: color.onDark, fontVariant: ['tabular-nums'] },
});
```

- [ ] **Step 3: 타임라인**

`src/app/project/[id].tsx`: import 추가 `import { VideoPlayer } from '@/shared/ui/VideoPlayer';`, `import { VideoBadge } from '@/shared/ui/VideoBadge';`. 사진 영역을 교체:
```tsx
          <View style={[styles.photo, { width: photoSide, height: photoSide }]}>
            {current?.media_type === 'video' && current.video_path ? (
              <VideoPlayer key={current.id} uri={current.video_path} poster={postPhotoUri(current)} label="영상 기록" />
            ) : current ? (
              <Image source={{ uri: postPhotoUri(current) }} contentFit="cover" style={StyleSheet.absoluteFill} />
            ) : null}
            {current?.media_type === 'video' ? <VideoBadge durationMs={current.duration_ms} /> : null}
          </View>
```

- [ ] **Step 4: 카드·격자 배지**

- `src/features/social/PostCard.tsx`: `<View style={styles.photo}>` 안의 `Image` 다음 줄에 `{post.media_type === 'video' ? <VideoBadge /> : null}` 와 import.
- `src/app/(tabs)/me.tsx`, `src/app/user/[username].tsx`: 격자 셀 `Pressable` 안 `Image` 조건 블록 다음에 `{item.media_type === 'video' ? <VideoBadge /> : null}` 와 import.

- [ ] **Step 5: 게시물 상세**

`src/features/social/api.ts`의 `fetchPost`를 교체:
```ts
export async function fetchPost(postId: string): Promise<{ post: FeedPost; url: string | null; videoUrl: string | null }> {
  const { data, error } = await getSupabase().from('posts').select(FEED_SELECT).eq('id', postId).is('deleted_at', null).is('hidden_at', null).single();
  if (error) throw new Error(error.message);
  const post = data as unknown as FeedPost;
  const urls = await signPhotoUrls(post.video_path ? [post.photo_path, post.video_path] : [post.photo_path]);
  return {
    post,
    url: urls.get(post.photo_path) ?? null,
    videoUrl: post.video_path ? (urls.get(post.video_path) ?? null) : null,
  };
}
```
`src/app/post/[id].tsx`: import `VideoPlayer`, `VideoBadge`. 사진 영역을 교체:
```tsx
              <View style={[styles.photo, { width, height: width }]}>
                {post.data?.videoUrl ? (
                  <VideoPlayer key={post.data.videoUrl} uri={post.data.videoUrl} poster={post.data.url ?? undefined} label="영상 기록" />
                ) : post.data?.url ? (
                  <Image source={{ uri: post.data.url }} contentFit="cover" style={StyleSheet.absoluteFill} />
                ) : null}
                {p?.media_type === 'video' ? <VideoBadge durationMs={p.duration_ms} /> : null}
              </View>
```
(`fetchPost` 결과를 다른 곳에서 구조 분해해 쓰면 타입 검사가 알려 준다 — 그대로 맞춘다)

- [ ] **Step 6: 검사·커밋**

Run: `npx tsc --noEmit && npx jest 2>&1 | grep "^Tests:"` → 오류 없음, `Tests: 46 passed`
Run: 로컬 웹(8098, `--clear`) + `SUPABASE_SERVICE_KEY=… node scripts/e2e/video-capture.mjs` → `RESULT: PASS` (촬영 흐름 회귀)

```bash
git add src/shared/ui/VideoPlayer.tsx src/shared/ui/VideoBadge.tsx "src/app/project/[id].tsx" src/features/social/PostCard.tsx "src/app/(tabs)/me.tsx" "src/app/user/[username].tsx" src/features/social/api.ts "src/app/post/[id].tsx"
git commit -m "feat: 영상 기록 재생 (타임라인·게시물 상세 자동 반복, 격자·카드 ▶ 배지, 실패 시 대표 사진)"
```

---

### Task 2: 순수 계산 — MediaItem · ClipCursor · 결과 장면 · 성장 영상 구간

**Files:**
- Create: `src/features/media/mediaItem.ts`, `src/features/media/clipCursor.ts`
- Rewrite: `src/features/media/plan.ts`
- Modify: `src/features/media/resultPlan.ts`
- Test: `src/features/media/__tests__/mediaItem.test.ts`, `clipCursor.test.ts` (생성), `plan.test.ts` (재작성), `resultPlan.test.ts` (수정)

**Interfaces:**
- Produces:
  - `mediaItem.ts`: `export type MediaItem = { kind: 'photo'; uri: string } | { kind: 'video'; uri: string; durationMs: number }`; `export type MediaPost = { media_type: 'photo' | 'video'; photo_path: string; video_path: string | null; duration_ms: number | null }`; `export function mediaOf(post: MediaPost): MediaItem`
  - `clipCursor.ts`: `export type ClipFrame<T> = { timestamp: number; image: T }` (초, 0부터); `export class ClipCursor<T> { constructor(frames: AsyncIterator<ClipFrame<T>>); frameAt(t: number): Promise<T | null> }`
  - `resultPlan.ts`: `ScenePanel = { media: MediaItem; dst: Rect; label: string | null }` (**`uri` 필드 제거**); `buildScene({ kind, project, posts, side? })` — `uriOf` 인자 제거, posts는 `TimedPost & MediaPost`; `outputKindOf(scene): 'jpeg' | 'mp4'`; `sceneDurationMs(scene): number`; `RESULT_VIDEO_FPS = 30`; `resultFileName(projectId, kind, ext: 'jpg' | 'mp4')`
  - `plan.ts`: `VIDEO_SIDE = 1080`, `GROWTH_FPS = 30`, `MIN_RECORDS = 2`, `LAST_HOLD_MS = 1000`, `photoHoldMs(recordCount)`, `type Segment = { item: MediaItem; startMs: number; durationMs: number }`, `buildSegments(items: readonly MediaItem[]): Segment[]`, `totalDurationMs(segments)`, `segmentAt(segments, tMs): Segment`, `estimateDurationMs(items)`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/features/media/__tests__/mediaItem.test.ts`:
```ts
import { mediaOf } from '@/features/media/mediaItem';

describe('mediaOf', () => {
  it('사진 기록은 사진 URL', () => {
    expect(mediaOf({ media_type: 'photo', photo_path: 'p.jpg', video_path: null, duration_ms: null })).toEqual({ kind: 'photo', uri: 'p.jpg' });
  });
  it('영상 기록은 영상 URL과 길이', () => {
    expect(mediaOf({ media_type: 'video', photo_path: 'p.jpg', video_path: 'v.mp4', duration_ms: 3200 })).toEqual({ kind: 'video', uri: 'v.mp4', durationMs: 3200 });
  });
  it('영상인데 주소나 길이가 비면 대표 사진으로 대신한다 (서명 실패 등)', () => {
    expect(mediaOf({ media_type: 'video', photo_path: 'p.jpg', video_path: null, duration_ms: 3200 })).toEqual({ kind: 'photo', uri: 'p.jpg' });
    expect(mediaOf({ media_type: 'video', photo_path: 'p.jpg', video_path: '', duration_ms: 3200 })).toEqual({ kind: 'photo', uri: 'p.jpg' });
  });
});
```

`src/features/media/__tests__/clipCursor.test.ts`:
```ts
import { ClipCursor, type ClipFrame } from '@/features/media/clipCursor';

async function* frames(ts: number[]): AsyncGenerator<ClipFrame<string>> {
  for (const t of ts) yield { timestamp: t, image: `f${t}` };
}

describe('ClipCursor', () => {
  it('각 시각에 그 시각 이전의 가장 최근 프레임', async () => {
    const c = new ClipCursor(frames([0, 0.5, 1, 1.5]));
    expect(await c.frameAt(0)).toBe('f0');
    expect(await c.frameAt(0.49)).toBe('f0');
    expect(await c.frameAt(0.5)).toBe('f0.5');
    expect(await c.frameAt(1.2)).toBe('f1');
  });
  it('끝을 넘으면 마지막 프레임에 머문다', async () => {
    const c = new ClipCursor(frames([0, 0.5]));
    expect(await c.frameAt(3)).toBe('f0.5');
    expect(await c.frameAt(4)).toBe('f0.5');
  });
  it('프레임이 하나도 없으면 null', async () => {
    const c = new ClipCursor(frames([]));
    expect(await c.frameAt(0)).toBeNull();
  });
});
```

`src/features/media/__tests__/plan.test.ts` (통째로 교체):
```ts
import { buildSegments, estimateDurationMs, LAST_HOLD_MS, photoHoldMs, segmentAt, totalDurationMs } from '@/features/media/plan';
import type { MediaItem } from '@/features/media/mediaItem';

const photo = (uri: string): MediaItem => ({ kind: 'photo', uri });
const video = (uri: string, durationMs: number): MediaItem => ({ kind: 'video', uri, durationMs });

describe('photoHoldMs', () => {
  it('기록이 적으면 오래, 많으면 짧게 (현행과 같은 시간)', () => {
    expect(photoHoldMs(2)).toBe(500);
    expect(photoHoldMs(8)).toBe(500);
    expect(photoHoldMs(9)).toBe(250);
    expect(photoHoldMs(24)).toBe(250);
    expect(photoHoldMs(25)).toBe(125);
  });
});

describe('buildSegments', () => {
  it('사진은 머무는 시간, 영상은 클립 길이, 마지막 기록 +1초', () => {
    const s = buildSegments([photo('a'), video('b', 3200), photo('c')]);
    expect(s.map((x) => [x.startMs, x.durationMs])).toEqual([[0, 500], [500, 3200], [3700, 500 + LAST_HOLD_MS]]);
    expect(totalDurationMs(s)).toBe(5200);
  });
  it('마지막이 영상이면 클립 길이 + 1초', () => {
    const s = buildSegments([photo('a'), video('b', 2000)]);
    expect(s[1]?.durationMs).toBe(3000);
  });
  it('기록이 없으면 빈 목록, 길이 0', () => {
    expect(buildSegments([])).toEqual([]);
    expect(totalDurationMs([])).toBe(0);
  });
});

describe('segmentAt', () => {
  const s = buildSegments([photo('a'), video('b', 3200), photo('c')]);
  it('구간 시작 시각은 그 구간', () => {
    expect(segmentAt(s, 0).item.uri).toBe('a');
    expect(segmentAt(s, 499).item.uri).toBe('a');
    expect(segmentAt(s, 500).item.uri).toBe('b');
    expect(segmentAt(s, 3700).item.uri).toBe('c');
  });
  it('끝을 넘으면 마지막 구간', () => {
    expect(segmentAt(s, 99999).item.uri).toBe('c');
  });
});

describe('estimateDurationMs', () => {
  it('구간 합과 같다', () => {
    expect(estimateDurationMs([photo('a'), photo('b'), photo('c')])).toBe(2500);
    expect(estimateDurationMs([])).toBe(0);
  });
});
```

`src/features/media/__tests__/resultPlan.test.ts` 수정:
- 파일 위 `post` 헬퍼를 영상 필드까지 가지게 교체:
```ts
const post = (id: string, day: number, hour = 12) => ({
  id, taken_at: at(day, hour), created_at: at(day, hour),
  media_type: 'photo' as const, photo_path: `p:${id}`, video_path: null, duration_ms: null,
});
const vpost = (id: string, day: number, durationMs: number) => ({
  ...post(id, day), media_type: 'video' as const, video_path: `v:${id}`, duration_ms: durationMs,
});
```
- import에 `outputKindOf, sceneDurationMs, resultFileName` 추가
- `describe('buildScene'…)` 블록을 교체:
```ts
describe('buildScene', () => {
  const project = { name: '회색 라글란', started_at: '2026-09-01' };
  const posts = [post('a', 1), post('b', 6), post('c', 12)];

  it('전체 1장: 칸 하나, 라벨 없음, 편물명과 경과일 캡션', () => {
    const s = buildScene({ kind: 'single', project, posts });
    expect(s.panels).toHaveLength(1);
    expect(s.panels[0]).toMatchObject({ media: { kind: 'photo', uri: 'p:c' }, label: null, dst: { x: 0, y: 0, width: 1080, height: 1080 } });
    expect(s.caption).toEqual({ title: '회색 라글란', subtitle: '12일째 · 9월 12일' });
  });
  it('3분할: 칸마다 며칠째 라벨, 캡션 없음', () => {
    const s = buildScene({ kind: 'triple', project, posts });
    expect(s.panels.map((p) => p.label)).toEqual(['1일째', '6일째', '12일째']);
    expect(s.caption).toBeNull();
  });
  it('모두 사진이면 JPEG, 길이 0', () => {
    const s = buildScene({ kind: 'triple', project, posts });
    expect(outputKindOf(s)).toBe('jpeg');
    expect(sceneDurationMs(s)).toBe(0);
  });
  it('영상이 하나라도 있으면 MP4, 길이는 가장 긴 영상', () => {
    const mixed = [vpost('a', 1, 4200), post('b', 6), vpost('c', 12, 2500)];
    const s = buildScene({ kind: 'triple', project, posts: mixed });
    expect(s.panels.map((p) => p.media.kind)).toEqual(['video', 'photo', 'video']);
    expect(outputKindOf(s)).toBe('mp4');
    expect(sceneDurationMs(s)).toBe(4200);
  });
});

describe('resultFileName', () => {
  it('확장자는 결과 종류를 따른다', () => {
    expect(resultFileName('12345678-aaaa', 'triple', 'jpg')).toBe('knitting-12345678-triple.jpg');
    expect(resultFileName('12345678-aaaa', 'triple', 'mp4')).toBe('knitting-12345678-triple.mp4');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest src/features/media 2>&1 | tail -15`
Expected: FAIL — `Cannot find module '@/features/media/mediaItem'`, `clipCursor`, plan exports, `outputKindOf` 없음

- [ ] **Step 3: 구현**

`src/features/media/mediaItem.ts`:
```ts
/** 결과물·성장 영상이 다루는 기록 한 개. 순수 — 브라우저 의존 없음 */
export type MediaItem = { kind: 'photo'; uri: string } | { kind: 'video'; uri: string; durationMs: number };

export type MediaPost = {
  media_type: 'photo' | 'video';
  photo_path: string; // 읽어 온 값은 서명 URL
  video_path: string | null;
  duration_ms: number | null;
};

/** 영상인데 주소나 길이가 없으면(서명 실패 등) 대표 사진으로 대신한다 */
export function mediaOf(post: MediaPost): MediaItem {
  if (post.media_type === 'video' && post.video_path && post.duration_ms) {
    return { kind: 'video', uri: post.video_path, durationMs: post.duration_ms };
  }
  return { kind: 'photo', uri: post.photo_path };
}
```

`src/features/media/clipCursor.ts`:
```ts
/** 영상 클립의 프레임을 시간순으로 꺼낸다. 시각은 초, 클립 시작 = 0 */
export type ClipFrame<T> = { timestamp: number; image: T };

/**
 * frameAt(t): t초에 보여야 할 프레임 (t 이전의 가장 최근 프레임). 끝을 넘으면 마지막 프레임에 머문다.
 * 시간은 앞으로만 간다 (디코더를 순서대로 한 번만 읽는다).
 * 현재·다음 두 프레임을 동시에 들고 있으므로, 프레임 이미지를 재사용하는 공급자는 풀을 3 이상으로 둔다.
 */
export class ClipCursor<T> {
  private current: ClipFrame<T> | null = null;
  private next: ClipFrame<T> | null = null;
  private started = false;
  private ended = false;

  constructor(private readonly frames: AsyncIterator<ClipFrame<T>>) {}

  async frameAt(t: number): Promise<T | null> {
    if (!this.started) {
      this.started = true;
      this.current = await this.pull();
      this.next = await this.pull();
    }
    while (this.next && this.next.timestamp <= t) {
      this.current = this.next;
      this.next = await this.pull();
    }
    return this.current?.image ?? null;
  }

  private async pull(): Promise<ClipFrame<T> | null> {
    if (this.ended) return null;
    const r = await this.frames.next();
    if (r.done) {
      this.ended = true;
      return null;
    }
    return r.value;
  }
}
```

`src/features/media/plan.ts` (통째로 교체):
```ts
/** 성장 영상 시간 구간. 순수 함수 — 브라우저 의존 없음 → 테스트 가능. */
import type { MediaItem } from '@/features/media/mediaItem';

export const VIDEO_SIDE = 1080;
export const GROWTH_FPS = 30;
export const MIN_RECORDS = 2;
export const LAST_HOLD_MS = 1000;

/** 사진 한 장이 머무는 시간. 기록이 적으면 오래, 많으면 짧게 (8fps 시절 4·2·1프레임과 같은 시간) */
export function photoHoldMs(recordCount: number): number {
  if (recordCount <= 8) return 500;
  if (recordCount <= 24) return 250;
  return 125;
}

export type Segment = { item: MediaItem; startMs: number; durationMs: number };

/** 사진은 머무는 시간, 영상은 클립 길이. 마지막 기록은 1초 더 (영상이면 마지막 장면 정지) */
export function buildSegments(items: readonly MediaItem[]): Segment[] {
  const hold = photoHoldMs(items.length);
  let startMs = 0;
  return items.map((item, i) => {
    const base = item.kind === 'video' ? item.durationMs : hold;
    const durationMs = i === items.length - 1 ? base + LAST_HOLD_MS : base;
    const seg = { item, startMs, durationMs };
    startMs += durationMs;
    return seg;
  });
}

export function totalDurationMs(segments: readonly Segment[]): number {
  const last = segments[segments.length - 1];
  return last ? last.startMs + last.durationMs : 0;
}

/** tMs가 속한 구간. 끝을 넘으면 마지막 구간. segments는 비어 있지 않아야 한다 */
export function segmentAt(segments: readonly Segment[], tMs: number): Segment {
  let found = segments[0] as Segment;
  for (const s of segments) {
    if (s.startMs <= tMs) found = s;
    else break;
  }
  return found;
}

export function estimateDurationMs(items: readonly MediaItem[]): number {
  return totalDurationMs(buildSegments(items));
}
```

`src/features/media/resultPlan.ts` 수정:
- import 추가: `import { mediaOf, type MediaItem, type MediaPost } from '@/features/media/mediaItem';`
- `RESULT_JPEG_QUALITY` 줄 아래: `export const RESULT_VIDEO_FPS = 30;`
- `export type ScenePanel = { uri: string; dst: Rect; label: string | null };` → `export type ScenePanel = { media: MediaItem; dst: Rect; label: string | null };`
- `buildScene`의 입력 타입과 본문:
```ts
export function buildScene<T extends TimedPost & MediaPost>(input: {
  kind: ResultKind;
  project: { name: string; started_at: string };
  posts: readonly T[];
  side?: number;
}): Scene {
```
 그리고 `uri: input.uriOf(p),` → `media: mediaOf(p),`
- 파일 끝 `resultFileName`을 교체하고 두 함수 추가:
```ts
/** 칸 중 영상이 하나라도 있으면 MP4 */
export function outputKindOf(scene: Scene): 'jpeg' | 'mp4' {
  return scene.panels.some((p) => p.media.kind === 'video') ? 'mp4' : 'jpeg';
}

/** MP4 길이 = 칸 중 가장 긴 영상. 사진뿐이면 0 */
export function sceneDurationMs(scene: Scene): number {
  return Math.max(0, ...scene.panels.map((p) => (p.media.kind === 'video' ? p.media.durationMs : 0)));
}

export function resultFileName(projectId: string, kind: ResultKind, ext: 'jpg' | 'mp4'): string {
  return `knitting-${projectId.slice(0, 8)}-${kind}.${ext}`;
}
```

- [ ] **Step 4: 통과 확인 (이 시점 앱 코드는 타입 오류가 남는다 — Task 3·4에서 해소)**

Run: `npx jest src/features/media 2>&1 | grep -E "Tests:|✕"`
Expected: 새·수정 테스트 모두 통과
Run: `npx tsc --noEmit 2>&1 | grep -c "error"` — `composeResult.ts`(panel.uri), `useResultPhoto.ts`(uriOf·resultFileName), `makeVideo.ts`(buildFrames·MIN_PHOTOS), `project/[id].tsx`(MIN_PHOTOS·estimateDurationMs) 오류만 남아야 한다. 그 목록을 보고서에 적는다

- [ ] **Step 5: 커밋**

```bash
git add src/features/media/mediaItem.ts src/features/media/clipCursor.ts src/features/media/plan.ts src/features/media/resultPlan.ts src/features/media/__tests__/
git commit -m "feat: 섞인 결과물·성장 영상 순수 계산 (MediaItem, ClipCursor, 결과 종류·길이, 30fps 시간 구간)"
```

---

### Task 3: MP4 쓰기 부품 + 결과 사진 화면 MP4

**Files:**
- Create: `src/features/media/mediaWriter.ts`
- Modify: `src/features/media/composeResult.ts`, `src/features/media/useResultPhoto.ts`, `src/app/result/[projectId].tsx`

**Interfaces:**
- Consumes: Task 2 `ClipCursor`, `ScenePanel.media`, `outputKindOf`, `sceneDurationMs`, `RESULT_VIDEO_FPS`, `resultFileName(…, ext)`, `MediaItem`
- Produces:
  - `mediaWriter.ts`: `export const MP4_BITRATE = 6_000_000`; `export type Mp4Writer = { ctx: CanvasRenderingContext2D; add(timestampSec: number, durationSec: number): Promise<void>; finish(): Promise<Blob>; cancel(): Promise<void> }`; `export async function createMp4Writer(side: number, fps: number): Promise<Mp4Writer>`; `export type OpenClip = { cursor: ClipCursor<HTMLCanvasElement | OffscreenCanvas>; close(): void }`; `export async function openClip(url: string, side: number): Promise<OpenClip>`; `export async function loadBitmap(url: string): Promise<ImageBitmap>`
  - `composeResult(scene, projectId, kind, onProgress?)` → `{ output: 'jpeg' | 'mp4'; uri: string; file: File }`
  - `useResultPhoto` 반환에 `output: 'jpeg' | 'mp4' | null`, `progress: number | null` 추가

- [ ] **Step 1: mediaWriter**

`src/features/media/mediaWriter.ts`:
```ts
import { ALL_FORMATS, BlobSource, BufferTarget, CanvasSink, CanvasSource, Input, Mp4OutputFormat, Output } from 'mediabunny';

import { ClipCursor, type ClipFrame } from '@/features/media/clipCursor';

/** 결과 사진 MP4·성장 영상이 함께 쓰는 MP4 쓰기와 영상 클립 읽기 (Mediabunny) */

export const MP4_BITRATE = 6_000_000;

export type Mp4Writer = {
  ctx: CanvasRenderingContext2D;
  add(timestampSec: number, durationSec: number): Promise<void>;
  finish(): Promise<Blob>;
  cancel(): Promise<void>;
};

/** side×side 캔버스에 그린 뒤 add()로 한 프레임씩 H.264 MP4에 쓴다 */
export async function createMp4Writer(side: number, fps: number): Promise<Mp4Writer> {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('이 브라우저는 영상 만들기를 지원하지 않아요. 최신 Chrome이나 Safari(16.4 이상)에서 열어 주세요.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('영상 캔버스를 만들지 못했어요');

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const source = new CanvasSource(canvas, { codec: 'avc', bitrate: MP4_BITRATE, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  return {
    ctx,
    add: (t, d) => source.add(t, d),
    finish: async () => {
      await output.finalize();
      if (!target.buffer) throw new Error('영상을 만들지 못했어요');
      return new Blob([target.buffer], { type: 'video/mp4' });
    },
    cancel: () => output.cancel(),
  };
}

export type OpenClip = { cursor: ClipCursor<HTMLCanvasElement | OffscreenCanvas>; close(): void };

/** 저장된 영상 클립(1080 정사각)을 열어 시간순 프레임 커서로. 다 쓰면 close() */
export async function openClip(url: string, side: number): Promise<OpenClip> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`영상을 내려받지 못했어요 (${res.status})`);
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(await res.blob()) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('영상을 읽지 못했어요');
    const first = await track.getFirstTimestamp();
    // ClipCursor가 현재·다음 두 캔버스를 들고 있으므로 풀은 3
    const sink = new CanvasSink(track, { width: side, height: side, fit: 'cover', poolSize: 3 });
    async function* frames(): AsyncGenerator<ClipFrame<HTMLCanvasElement | OffscreenCanvas>> {
      for await (const w of sink.canvases()) yield { timestamp: w.timestamp - first, image: w.canvas };
    }
    return { cursor: new ClipCursor(frames()), close: () => input.dispose() };
  } catch (e) {
    input.dispose();
    throw e;
  }
}

export async function loadBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`사진을 내려받지 못했어요 (${res.status})`);
  return createImageBitmap(await res.blob());
}
```

- [ ] **Step 2: composeResult 두 경로**

`src/features/media/composeResult.ts`를 교체 (그리기 도우미 `fit`·`drawBox`·`drawLabel`은 그대로 두고 위쪽만 바꾼다):
```ts
import { createMp4Writer, loadBitmap, openClip, type OpenClip } from '@/features/media/mediaWriter';
import {
  centerCropFor,
  outputKindOf,
  RESULT_JPEG_QUALITY,
  RESULT_METRICS as M,
  RESULT_VIDEO_FPS,
  resultFileName,
  sceneDurationMs,
  type ResultKind,
  type Scene,
} from '@/features/media/resultPlan';
import { color } from '@/shared/ui/tokens';

/**
 * 결과 사진 합성. 칸이 모두 사진이면 JPEG, 하나라도 영상이면 MP4(30fps, 길이 = 가장 긴 영상).
 * 결과는 미리보기용 blob URL과 저장용 File.
 */

export type ComposedResult = { output: 'jpeg' | 'mp4'; uri: string; file: File };
type Drawable = ImageBitmap | HTMLCanvasElement | OffscreenCanvas;

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
const font = (size: number, bold: boolean) => `${bold ? 600 : 400} ${size}px ${FONT_FAMILY}`;

export async function composeResult(
  scene: Scene,
  projectId: string,
  kind: ResultKind,
  onProgress?: (ratio: number) => void,
): Promise<ComposedResult> {
  return outputKindOf(scene) === 'mp4' ? composeVideo(scene, projectId, kind, onProgress) : composeJpeg(scene, projectId, kind);
}

async function composeJpeg(scene: Scene, projectId: string, kind: ResultKind): Promise<ComposedResult> {
  const canvas = document.createElement('canvas');
  canvas.width = scene.side;
  canvas.height = scene.side;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('합성 화면을 만들지 못했어요');
  const images = await Promise.all(scene.panels.map((p) => loadBitmap(p.media.uri)));
  try {
    drawFrame(ctx, scene, images);
  } finally {
    for (const b of images) b.close();
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', RESULT_JPEG_QUALITY));
  if (!blob) throw new Error('결과 사진을 만들지 못했어요');
  return { output: 'jpeg', uri: URL.createObjectURL(blob), file: new File([blob], resultFileName(projectId, kind, 'jpg'), { type: 'image/jpeg' }) };
}

async function composeVideo(scene: Scene, projectId: string, kind: ResultKind, onProgress?: (ratio: number) => void): Promise<ComposedResult> {
  const writer = await createMp4Writer(scene.side, RESULT_VIDEO_FPS);
  const bitmaps = new Map<number, ImageBitmap>();
  const clips = new Map<number, OpenClip>();
  try {
    for (const [i, p] of scene.panels.entries()) {
      if (p.media.kind === 'video') clips.set(i, await openClip(p.media.uri, scene.side));
      else bitmaps.set(i, await loadBitmap(p.media.uri));
    }
    const frameCount = Math.max(1, Math.ceil((sceneDurationMs(scene) * RESULT_VIDEO_FPS) / 1000));
    const dt = 1 / RESULT_VIDEO_FPS;
    for (let f = 0; f < frameCount; f += 1) {
      const t = f * dt;
      const images: (Drawable | null)[] = [];
      for (const i of scene.panels.keys()) {
        const clip = clips.get(i);
        images.push(clip ? await clip.cursor.frameAt(t) : (bitmaps.get(i) ?? null));
      }
      drawFrame(writer.ctx, scene, images);
      await writer.add(t, dt);
      onProgress?.((f + 1) / frameCount);
    }
    const blob = await writer.finish();
    return { output: 'mp4', uri: URL.createObjectURL(blob), file: new File([blob], resultFileName(projectId, kind, 'mp4'), { type: 'video/mp4' }) };
  } catch (e) {
    await writer.cancel().catch(() => {});
    throw e;
  } finally {
    for (const b of bitmaps.values()) b.close();
    for (const c of clips.values()) c.close();
  }
}

/** 칸 이미지 + 라벨 + 캡션을 한 프레임으로. 이미지가 없는 칸(아직 프레임 없음)은 바탕색 */
function drawFrame(ctx: CanvasRenderingContext2D, scene: Scene, images: readonly (Drawable | null)[]) {
  ctx.fillStyle = color.surface;
  ctx.fillRect(0, 0, scene.side, scene.side);
  ctx.textBaseline = 'top';
  scene.panels.forEach((panel, i) => {
    const image = images[i];
    if (image) {
      const src = centerCropFor(panel.dst, image.width, image.height);
      ctx.drawImage(image, src.x, src.y, src.width, src.height, panel.dst.x, panel.dst.y, panel.dst.width, panel.dst.height);
    }
    if (panel.label) drawLabel(ctx, panel.label, panel.dst.x + M.margin, panel.dst.y + panel.dst.height - M.margin);
  });

  if (scene.caption) {
    const maxW = scene.side - M.margin * 2 - M.labelPadX * 2;
    const title = fit(ctx, scene.caption.title, font(M.titleFont, true), maxW);
    const subtitle = fit(ctx, scene.caption.subtitle, font(M.subtitleFont, false), maxW);
    const boxW = Math.max(title.width, subtitle.width) + M.labelPadX * 2;
    const boxH = M.titleFont + M.captionGap + M.subtitleFont + M.labelPadY * 2;
    const top = scene.side - M.margin - boxH;
    drawBox(ctx, M.margin, top, boxW, boxH);
    ctx.fillStyle = color.onDark;
    ctx.font = font(M.titleFont, true);
    ctx.fillText(title.text, M.margin + M.labelPadX, top + M.labelPadY);
    ctx.font = font(M.subtitleFont, false);
    ctx.fillText(subtitle.text, M.margin + M.labelPadX, top + M.labelPadY + M.titleFont + M.captionGap);
  }
}
```
기존 파일에 있던 `loadBitmap`은 지운다 (mediaWriter의 것을 쓴다). `fit`, `drawBox`, `drawLabel`은 남긴다.

- [ ] **Step 3: useResultPhoto**

`src/features/media/useResultPhoto.ts`:
- import에서 `postPhotoUri`, `resultFileName` 제거
- `const [progress, setProgress] = useState<number | null>(null);` 추가
- `queryFn`을:
```ts
    queryFn: async () => {
      if (!project.data || !posts.data) throw new Error('편물을 불러오는 중이에요');
      const scene = buildScene({ kind, project: project.data, posts: posts.data });
      setProgress(0);
      try {
        return await composeResult(scene, projectId, kind, (r) => setProgress(r));
      } finally {
        setProgress(null);
      }
    },
```
- 반환 객체에 `output: result.data?.output ?? null,` 와 `progress,` 추가

- [ ] **Step 4: 결과 화면**

`src/app/result/[projectId].tsx`:
- import `VideoPlayer`
- 미리보기: `{r.uri ? <Image … /> : null}` →
```tsx
        {r.uri && r.output === 'mp4' ? (
          <VideoPlayer key={r.uri} uri={r.uri} label="결과 영상 미리보기" />
        ) : r.uri ? (
          <Image source={{ uri: r.uri }} contentFit="cover" style={StyleSheet.absoluteFill} accessibilityLabel="결과 사진 미리보기" />
        ) : null}
```
- 만드는 중 문구: `<Text style={styles.busyText}>만드는 중</Text>` → `<Text style={styles.busyText}>{r.progress !== null ? `만드는 중 ${Math.round(r.progress * 100)}%` : '만드는 중'}</Text>`
- 저장 안내: `열리는 공유 창에서 "이미지 저장"을 누르세요.` 문구를 `r.output === 'mp4' ? '"비디오 저장"' : '"이미지 저장"'`으로 바꿔 끼운다
- 종류 설명(hint)에 한 줄 추가하지 않는다 (YAGNI)

- [ ] **Step 5: 검사·커밋**

Run: `npx tsc --noEmit 2>&1 | grep error` → `makeVideo.ts`와 `project/[id].tsx`(Task 4 몫) 오류만 남는다
Run: `npx jest 2>&1 | grep "^Tests:"` → 모두 통과

```bash
git add src/features/media/mediaWriter.ts src/features/media/composeResult.ts src/features/media/useResultPhoto.ts "src/app/result/[projectId].tsx"
git commit -m "feat: 결과 사진 화면 — 영상이 섞이면 MP4 (30fps, 가장 긴 영상 길이, 진행률·영상 미리보기)"
```

---

### Task 4: 성장 영상 30fps · 영상 클립 재생 · mp4-muxer 제거

**Files:**
- Rewrite: `src/features/media/makeVideo.ts`
- Modify: `src/features/media/MakeVideoSheet.tsx`, `src/app/project/[id].tsx`, `package.json`/`package-lock.json` (`npm uninstall mp4-muxer`)

**Interfaces:**
- Consumes: Task 2 `buildSegments`, `segmentAt`, `totalDurationMs`, `estimateDurationMs`, `GROWTH_FPS`, `VIDEO_SIDE`, `MIN_RECORDS`, `mediaOf`; Task 3 `createMp4Writer`, `openClip`, `loadBitmap`
- Produces: `makeVideo(projectId, onProgress)` → `EncodeResult` (타입 그대로); `MakeVideoSheet` prop `photoCount` → `recordCount`

- [ ] **Step 1: makeVideo 재작성**

`src/features/media/makeVideo.ts`:
```ts
import { listPosts } from '@/features/capture/repository';
import { mediaOf } from '@/features/media/mediaItem';
import { createMp4Writer, loadBitmap, openClip, type OpenClip } from '@/features/media/mediaWriter';
import { buildSegments, GROWTH_FPS, MIN_RECORDS, segmentAt, totalDurationMs, VIDEO_SIDE, type Segment } from '@/features/media/plan';

/**
 * 편물 하나의 기록 전부 → 30fps H.264 MP4. 사진은 머무는 시간만큼, 영상은 클립을 끝까지, 마지막 기록 +1초.
 * 한 번에 한 기록만 메모리에 둔다 (사진 비트맵 하나 또는 열린 클립 하나).
 */

export type EncodeProgress = { progress: number; frame: number; total: number }; // progress 0..1
export type EncodeResult = { uri: string; file: File; frameCount: number; durationMs: number; bytes: number };

type Current = { segment: Segment; bitmap: ImageBitmap | null; clip: OpenClip | null };

export async function makeVideo(projectId: string, onProgress?: (p: EncodeProgress) => void): Promise<EncodeResult> {
  const posts = await listPosts(projectId);
  if (posts.length < MIN_RECORDS) throw new Error(`기록이 ${MIN_RECORDS}개 이상 있어야 영상을 만들 수 있어요`);

  const segments = buildSegments(posts.map(mediaOf));
  const durationMs = totalDurationMs(segments);
  const frameCount = Math.ceil((durationMs * GROWTH_FPS) / 1000);
  const dt = 1 / GROWTH_FPS;
  const writer = await createMp4Writer(VIDEO_SIDE, GROWTH_FPS);

  let current: Current | null = null;
  const release = (c: Current | null) => {
    c?.bitmap?.close();
    c?.clip?.close();
  };

  try {
    for (let f = 0; f < frameCount; f += 1) {
      const tMs = (f * 1000) / GROWTH_FPS;
      const segment = segmentAt(segments, tMs);
      if (current?.segment !== segment) {
        release(current);
        current = segment.item.kind === 'video'
          ? { segment, bitmap: null, clip: await openClip(segment.item.uri, VIDEO_SIDE) }
          : { segment, bitmap: await loadBitmap(segment.item.uri), clip: null };
      }
      const image = current.clip ? await current.clip.cursor.frameAt((tMs - segment.startMs) / 1000) : current.bitmap;
      if (image) writer.ctx.drawImage(image, 0, 0, VIDEO_SIDE, VIDEO_SIDE);
      await writer.add(f * dt, dt);
      onProgress?.({ progress: (f + 1) / frameCount, frame: f + 1, total: frameCount });
    }
    const blob = await writer.finish();
    return {
      uri: URL.createObjectURL(blob),
      file: new File([blob], `knitting-${projectId.slice(0, 8)}.mp4`, { type: 'video/mp4' }),
      frameCount,
      durationMs,
      bytes: blob.size,
    };
  } catch (e) {
    await writer.cancel().catch(() => {});
    throw e;
  } finally {
    release(current);
  }
}
```

- [ ] **Step 2: 시트·타임라인**

`src/features/media/MakeVideoSheet.tsx`: prop `photoCount: number` → `recordCount: number`, 구조 분해도 바꾸고, 진행 문구 `사진 {photoCount}장 → 약` → `기록 {recordCount}개 → 약`.

`src/app/project/[id].tsx`:
- import `import { estimateDurationMs, MIN_PHOTOS } from '@/features/media/plan';` → `import { estimateDurationMs, MIN_RECORDS } from '@/features/media/plan';` 그리고 `import { mediaOf } from '@/features/media/mediaItem';`
- `MIN_PHOTOS` 사용처 두 곳 → `MIN_RECORDS`, 버튼 문구 `영상 (${MIN_PHOTOS}장부터)` → `영상 (${MIN_RECORDS}개부터)`
- `<MakeVideoSheet … photoCount={total} estimateSec={estimateDurationMs(total) / 1000}` → `recordCount={total} estimateSec={estimateDurationMs(items.map(mediaOf)) / 1000}` (`items`는 이 화면의 `posts.data ?? []` 변수)

- [ ] **Step 3: mp4-muxer 제거**

Run: `npm uninstall mp4-muxer && grep -rn "mp4-muxer" src package.json`
Expected: 결과 없음

- [ ] **Step 4: 검사**

Run: `npx tsc --noEmit && npx jest 2>&1 | grep "^Tests:"` → 오류 없음, 모두 통과
Run: 로컬 웹(8098, `--clear`) + 스크래치 `node e2e_8098.mjs` → `RESULT: PASS` (사진만인 성장 영상 회귀)

- [ ] **Step 5: 커밋**

```bash
git add src/features/media/makeVideo.ts src/features/media/MakeVideoSheet.tsx "src/app/project/[id].tsx" package.json package-lock.json
git commit -m "feat: 성장 영상 30fps · 영상 기록은 클립 재생 · mp4-muxer를 Mediabunny로 교체"
```

---

### Task 5: 재생·섞인 결과물·성장 영상 E2E

**Files:**
- Create: `scripts/e2e/video-results.mjs`

**Interfaces:**
- Consumes: Task 1~4 전부. 화면 문구·라벨: 촬영 `사진 찍기`, 라디오 `사진`/`영상`, 셔터 `촬영`/`녹화`/`녹화 끝`, 결과 화면 버튼 `결과 사진`, 라디오 `전체`/`전후`/`3분할`, 저장 `파일로 저장`(공유 창 없는 브라우저), 타임라인 `영상 만들기`, 시트 `영상이 준비됐어요`, 배지 접근성 이름 `영상 기록`
- Produces: `node scripts/e2e/video-results.mjs` → `RESULT: PASS`

- [ ] **Step 1: 스크립트 작성**

`scripts/e2e/video-results.mjs`:
```js
// 영상 기록 3~5단계 E2E: 타임라인·상세 재생, 섞인 결과 MP4, 영상 섞인 성장 영상.
// 실행 전: 로컬 Supabase(0001~0005), 웹 서버 8098 --clear. SUPABASE_SERVICE_KEY 필요 없음 (파일은 브라우저가 내려받는다)
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = 'http://localhost:8098';
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const dir = mkdtempSync(join(tmpdir(), 'knit-results-'));
const run = (cmd, args) => execFileSync(cmd, args, { maxBuffer: 64 * 1024 * 1024 });
const sql = (q) => run('psql', [DB, '-Atc', q]).toString().trim();
let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
  if (!ok) failed += 1;
};
const probe = (file) => {
  const j = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate:format=duration', '-of', 'json', file]).toString());
  const v = j.streams.find((s) => s.codec_type === 'video');
  return { v, duration: Number(j.format.duration) };
};

const circle = "geq=r='if(lt(hypot(X-960,Y-540),300),0,255)':g='if(lt(hypot(X-960,Y-540),300),0,255)':b=255";
run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=1920x1080:r=30:d=6', '-vf', circle, '-pix_fmt', 'yuv420p', join(dir, 'cam.y4m')]);

const browser = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${join(dir, 'cam.y4m')}`],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'], acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('dialog', async (d) => { console.log('[dialog]', d.message()); await d.accept(); });
const stamp = Date.now().toString(36);
const email = `res_${stamp}@example.com`;

const waitCamera = () => page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0, null, { timeout: 30000 });
const shootPhoto = async (n) => {
  await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 30000 });
  await page.getByRole('radio', { name: '사진' }).click();
  await waitCamera();
  await page.getByRole('button', { name: '촬영' }).click();
  await page.getByText(`${n} / ${n}`).waitFor({ timeout: 60000 });
};
const download = async (buttonName, name) => {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.getByRole('button', { name: buttonName }).click()]);
  const file = join(dir, name);
  await dl.saveAs(file);
  return file;
};

try {
  await page.goto(BASE, { timeout: 180000 });
  await page.getByText('계정이 없어요, 가입할게요').click({ timeout: 120000 });
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('6자 이상').fill('password123');
  await page.getByRole('button', { name: '가입하기' }).click();
  await page.getByPlaceholder('knitter_haeun').fill(`res_${stamp}`);
  await page.getByPlaceholder('하은').fill('결과');
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.goto(`${BASE}/projects`);
  await page.getByRole('button', { name: '편물 만들기' }).click({ timeout: 30000 });
  await page.getByPlaceholder('예: 회색 라글란 스웨터').fill('섞인 스웨터');
  await page.getByRole('button', { name: '만들기', exact: true }).click();

  console.log('\n== 사진 2장 + 영상 1개');
  await shootPhoto(1);
  await shootPhoto(2);
  await page.getByRole('button', { name: '사진 찍기' }).click({ timeout: 30000 });
  await page.getByRole('radio', { name: '영상' }).click();
  await waitCamera();
  await page.getByRole('button', { name: '녹화', exact: true }).click();
  await page.waitForTimeout(3200);
  await page.getByRole('button', { name: '녹화 끝' }).click();
  await page.getByText('3 / 3').waitFor({ timeout: 120000 });
  const owner = sql(`select id from auth.users where email = '${email}'`);
  const [videoPostId, clipMs] = sql(`select id || '|' || duration_ms from posts where owner_id = '${owner}' and media_type = 'video'`).split('|');

  console.log('\n== 타임라인 재생');
  await page.waitForTimeout(2000);
  const tl = await page.evaluate(() => {
    const v = [...document.querySelectorAll('video')].find((x) => x.getAttribute('aria-label') === '영상 기록');
    return v ? { playing: v.currentTime > 0.3, muted: v.muted, loop: v.loop, poster: !!v.getAttribute('poster') } : null;
  });
  check('타임라인 영상 자동 재생 (소리 없음·반복·포스터)', !!tl && tl.playing && tl.muted && tl.loop && tl.poster, JSON.stringify(tl));
  check('타임라인 ▶ 길이 배지', await page.getByText(/^▶ 0:0\d$/).isVisible());

  console.log('\n== 게시물 상세 재생');
  await page.goto(`${BASE}/post/${videoPostId}`);
  await page.waitForTimeout(3000);
  const detail = await page.evaluate(() => {
    const v = [...document.querySelectorAll('video')].find((x) => x.getAttribute('aria-label') === '영상 기록');
    return v ? v.currentTime > 0.3 : false;
  });
  check('게시물 상세 영상 재생', detail);
  await page.goBack();

  console.log('\n== 결과: 3분할 (사진·사진·영상) → MP4');
  await page.goto(`${BASE}/projects`);
  await page.getByText('섞인 스웨터').click();
  await page.getByRole('button', { name: '결과 사진' }).click();
  await page.getByRole('radio', { name: '3분할' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[role="button"]')].some((b) => b.textContent === '파일로 저장' && b.getAttribute('aria-disabled') !== 'true'), null, { timeout: 180000 });
  const triple = await download('파일로 저장', 'triple.mp4');
  const t = probe(triple);
  check('3분할 MP4 1080×1080 h264 30fps', t.v?.width === 1080 && t.v?.height === 1080 && t.v?.codec_name === 'h264' && t.v?.r_frame_rate === '30/1', JSON.stringify(t.v));
  check('3분할 길이 = 영상 길이', Math.abs(t.duration * 1000 - Number(clipMs)) < 150, `${t.duration}s vs ${clipMs}ms`);
  check('미리보기가 영상', await page.evaluate(() => [...document.querySelectorAll('video')].some((x) => x.getAttribute('aria-label') === '결과 영상 미리보기')));

  console.log('\n== 결과: 전체 1장이 영상이면 MP4, 전후도 MP4');
  await page.getByRole('radio', { name: '전후' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[role="button"]')].some((b) => b.textContent === '파일로 저장' && b.getAttribute('aria-disabled') !== 'true'), null, { timeout: 180000 });
  const ba = probe(await download('파일로 저장', 'beforeAfter.mp4'));
  check('전후 MP4', ba.v?.codec_name === 'h264' && ba.v?.width === 1080, JSON.stringify(ba.v));

  console.log('\n== 성장 영상 (사진 500ms × 2 + 영상 + 마지막 1초)');
  await page.getByRole('button', { name: '뒤로' }).click();
  await page.getByRole('button', { name: '영상 만들기' }).click();
  await page.getByText('영상이 준비됐어요').waitFor({ timeout: 180000 });
  const growth = probe(await download('파일로 저장', 'growth.mp4'));
  const expected = 500 + 500 + Number(clipMs) + 1000;
  check('성장 영상 1080 h264 30fps', growth.v?.width === 1080 && growth.v?.codec_name === 'h264' && growth.v?.r_frame_rate === '30/1', JSON.stringify(growth.v));
  check('성장 영상 길이 = 구간 계산', Math.abs(growth.duration * 1000 - expected) < 150, `${growth.duration}s vs ${expected}ms`);
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

- [ ] **Step 2: 실행**

Run: 로컬 웹(8098, `--clear`) 켠 뒤 `node scripts/e2e/video-results.mjs`
Expected: PASS 9줄, `RESULT: PASS`

- [ ] **Step 3: 회귀**

Run: `SUPABASE_SERVICE_KEY=… node scripts/e2e/video-capture.mjs` 와 스크래치의 `e2e_8098.mjs`, `e2e2_8098.mjs`, `e2e3_8098.mjs`, `e2e_result.mjs <outdir>`, `e2e_share.mjs`
Expected: 모두 `RESULT: PASS` (사진만인 결과는 여전히 JPEG)

- [ ] **Step 4: 커밋**

```bash
git add scripts/e2e/video-results.mjs
git commit -m "test: 영상 재생·섞인 결과 MP4·영상 섞인 성장 영상 E2E"
```
