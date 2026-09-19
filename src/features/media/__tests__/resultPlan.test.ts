import { buildScene, centerCropFor, layoutPanels, outputKindOf, pickPanels, RESULT_RATIOS, ratiosFor, resolveRatio, resultFileName, sceneDurationMs } from '@/features/media/resultPlan';

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour).toISOString();
const post = (id: string, day: number, hour = 12) => ({
  id, taken_at: at(day, hour), created_at: at(day, hour),
  media_type: 'photo' as const, photo_path: `p:${id}`, video_path: null, duration_ms: null,
});
const vpost = (id: string, day: number, durationMs: number) => ({
  ...post(id, day), media_type: 'video' as const, video_path: `v:${id}`, duration_ms: durationMs,
});

describe('pickPanels', () => {
  const posts = [post('a', 1), post('b', 2), post('c', 9), post('d', 10), post('e', 11)];

  it('전체 1장은 가장 최근 사진', () => {
    expect(pickPanels('single', posts).map((p) => p.id)).toEqual(['e']);
  });
  it('전후는 첫 사진과 최근 사진', () => {
    expect(pickPanels('beforeAfter', posts).map((p) => p.id)).toEqual(['a', 'e']);
  });
  it('3분할 가운데는 장수 기준이 아니라 시간 기준 한가운데에 가까운 사진', () => {
    // 1일~20일의 한가운데는 10.5일. 장수 기준 가운데는 c(3일)지만 시간으로는 d(4일)가 가장 가깝다
    const skewed = [post('a', 1), post('b', 2), post('c', 3), post('d', 4), post('e', 20)];
    expect(pickPanels('triple', skewed).map((p) => p.id)).toEqual(['a', 'd', 'e']);
  });
  it('3분할 가운데 거리가 같으면 앞의 사진', () => {
    const tie = [post('a', 1), post('b', 3), post('c', 5), post('d', 7)];
    expect(pickPanels('triple', tie)[1]?.id).toBe('b');
  });
  it('사진이 모자라면 이유와 함께 거절', () => {
    expect(() => pickPanels('triple', posts.slice(0, 2))).toThrow('3장');
    expect(() => pickPanels('beforeAfter', posts.slice(0, 1))).toThrow('2장');
    expect(() => pickPanels('single', [])).toThrow('1장');
  });
});

describe('layoutPanels', () => {
  it('정사각·가로는 옆으로 나눈다. 칸 너비와 간격의 합이 정확히 가로', () => {
    for (const [w, h] of [[1080, 1080], [1920, 1080]] as const) {
      for (const n of [1, 2, 3]) {
        const rects = layoutPanels(n, w, h, 6);
        const last = rects[rects.length - 1];
        expect(last && last.x + last.width).toBe(w);
        expect(rects.every((r) => r.height === h && r.y === 0)).toBe(true);
      }
    }
  });
  it('세로가 긴 비율은 위아래로 쌓는다. 높이 합이 정확히 세로', () => {
    for (const [w, h] of [[1080, 1350], [1080, 1920]] as const) {
      for (const n of [2, 3]) {
        const rects = layoutPanels(n, w, h, 6);
        const last = rects[rects.length - 1];
        expect(last && last.y + last.height).toBe(h);
        expect(rects.every((r) => r.width === w && r.x === 0)).toBe(true);
      }
    }
  });
  it('칸 사이에는 간격만큼 빈 줄', () => {
    const [a, b] = layoutPanels(2, 1080, 1080, 6);
    expect(a && b && b.x - (a.x + a.width)).toBe(6);
    const [c, d] = layoutPanels(2, 1080, 1920, 6);
    expect(c && d && d.y - (c.y + c.height)).toBe(6);
  });
  it('인스타그램 규격 크기', () => {
    expect(RESULT_RATIOS.map((r) => `${r.ratio}=${r.width}x${r.height}`))
      .toEqual(['1:1=1080x1080', '4:5=1080x1350', '9:16=1080x1920', '16:9=1920x1080']);
    // H.264는 짝수 크기만 받는다
    expect(RESULT_RATIOS.every((r) => r.width % 2 === 0 && r.height % 2 === 0)).toBe(true);
  });
});

describe('centerCropFor', () => {
  it('정사각 사진을 세로로 긴 칸에 맞추면 좌우를 잘라 가운데만', () => {
    expect(centerCropFor({ width: 537, height: 1080 }, 1440, 1440)).toEqual({ x: (1440 - 716) / 2, y: 0, width: 716, height: 1440 });
  });
  it('가로로 긴 원본을 정사각 칸에 맞추면 좌우를 자른다', () => {
    expect(centerCropFor({ width: 100, height: 100 }, 1600, 1200)).toEqual({ x: 200, y: 0, width: 1200, height: 1200 });
  });
  it('세로로 긴 원본을 정사각 칸에 맞추면 위아래를 자른다', () => {
    expect(centerCropFor({ width: 100, height: 100 }, 1200, 1600)).toEqual({ x: 0, y: 200, width: 1200, height: 1200 });
  });
});

describe('buildScene', () => {
  const project = { name: '회색 라글란', started_at: '2026-09-01' };
  const posts = [post('a', 1), post('b', 6), post('c', 12)];

  it('전체 1장: 칸 하나, 라벨 없음, 편물명과 촬영 날짜 캡션', () => {
    const s = buildScene({ kind: 'single', project, posts });
    expect(s.panels).toHaveLength(1);
    expect(s.panels[0]).toMatchObject({ media: { kind: 'photo', uri: 'p:c' }, label: null, dst: { x: 0, y: 0, width: 1080, height: 1080 } });
    expect([s.width, s.height]).toEqual([1080, 1080]);
    expect(s.caption).toEqual({ title: '회색 라글란', subtitle: '9월 12일 · 3번째 기록' });
  });
  it('3분할은 어떤 비율을 넘겨도 가로 띠 셋을 위아래로 쌓는다', () => {
    for (const ratio of RESULT_RATIOS.map((r) => r.ratio)) {
      const s = buildScene({ kind: 'triple', project, posts, ratio });
      expect(s.panels.every((p) => p.dst.x === 0 && p.dst.width === s.width)).toBe(true);
      const last = s.panels[2]?.dst;
      expect(last && last.y + last.height).toBe(s.height);
    }
  });
  it('3분할: 칸마다 촬영 날짜 라벨, 캡션 없음', () => {
    const s = buildScene({ kind: 'triple', project, posts });
    expect(s.panels.map((p) => p.label)).toEqual(['9월 1일', '9월 6일', '9월 12일']);
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

describe('buildScene 비율', () => {
  const project = { name: '회색 라글란', started_at: '2026-09-01' };
  const posts = [
    { id: 'a', taken_at: '2026-09-01T10:00:00Z', created_at: '2026-09-01T10:00:00Z', media_type: 'photo' as const, photo_path: 'p:a', video_path: null, duration_ms: null },
    { id: 'b', taken_at: '2026-09-06T10:00:00Z', created_at: '2026-09-06T10:00:00Z', media_type: 'photo' as const, photo_path: 'p:b', video_path: null, duration_ms: null },
    { id: 'c', taken_at: '2026-09-12T10:00:00Z', created_at: '2026-09-12T10:00:00Z', media_type: 'photo' as const, photo_path: 'p:c', video_path: null, duration_ms: null },
  ];
  it('9:16 3분할은 위아래 세 칸', () => {
    const s = buildScene({ kind: 'triple', project, posts, ratio: '9:16' });
    expect([s.width, s.height]).toEqual([1080, 1920]);
    expect(s.panels.every((p) => p.dst.width === 1080)).toBe(true);
  });
  it('16:9 전후는 옆으로 두 칸', () => {
    const s = buildScene({ kind: 'beforeAfter', project, posts, ratio: '16:9' });
    expect([s.width, s.height]).toEqual([1920, 1080]);
    expect(s.panels.every((p) => p.dst.height === 1080)).toBe(true);
  });
});

describe('resultFileName 비율', () => {
  it('정사각이 아니면 비율을 이름에 붙인다', () => {
    expect(resultFileName('12345678-aaaa', 'triple', 'jpg', '4:5')).toBe('knitting-12345678-triple-4x5.jpg');
    expect(resultFileName('12345678-aaaa', 'triple', 'jpg', '1:1')).toBe('knitting-12345678-triple.jpg');
  });
});

describe('비율 선택지', () => {
  it('3분할은 세로로 긴 4:5와 9:16만', () => {
    expect(ratiosFor('triple').map((r) => r.ratio)).toEqual(['4:5', '9:16']);
    expect(ratiosFor('single').map((r) => r.ratio)).toEqual(['1:1', '4:5', '9:16', '16:9']);
    expect(ratiosFor('beforeAfter')).toHaveLength(4);
  });
  it('고른 비율이 그 종류에 없으면 종류의 기본값', () => {
    expect(resolveRatio('triple', null)).toBe('9:16');
    expect(resolveRatio('triple', '1:1')).toBe('9:16');
    expect(resolveRatio('triple', '4:5')).toBe('4:5');
    expect(resolveRatio('single', null)).toBe('1:1');
    expect(resolveRatio('single', '16:9')).toBe('16:9');
  });
});
