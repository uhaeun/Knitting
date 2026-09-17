import { buildScene, centerCropFor, dayOf, layoutPanels, pickPanels } from '@/features/media/resultPlan';

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour).toISOString();
const post = (id: string, day: number, hour = 12) => ({ id, taken_at: at(day, hour), created_at: at(day, hour) });

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
  it('칸 너비와 사이 간격의 합이 정확히 한 변', () => {
    for (const n of [1, 2, 3]) {
      const rects = layoutPanels(n, 1080, 6);
      const last = rects[rects.length - 1];
      expect(last && last.x + last.width).toBe(1080);
      expect(rects.every((r) => r.height === 1080 && r.y === 0)).toBe(true);
    }
  });
  it('칸 사이에는 간격만큼 빈 줄', () => {
    const [a, b] = layoutPanels(2, 1080, 6);
    expect(a && b && b.x - (a.x + a.width)).toBe(6);
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
  const uriOf = (p: { id: string }) => `uri:${p.id}`;

  it('전체 1장: 칸 하나, 라벨 없음, 편물명과 경과일 캡션', () => {
    const s = buildScene({ kind: 'single', project, posts, uriOf });
    expect(s.panels).toHaveLength(1);
    expect(s.panels[0]).toMatchObject({ uri: 'uri:c', label: null, dst: { x: 0, y: 0, width: 1080, height: 1080 } });
    expect(s.caption).toEqual({ title: '회색 라글란', subtitle: '12일째 · 9월 12일' });
  });
  it('3분할: 칸마다 며칠째 라벨, 캡션 없음', () => {
    const s = buildScene({ kind: 'triple', project, posts, uriOf });
    expect(s.panels.map((p) => p.label)).toEqual(['1일째', '6일째', '12일째']);
    expect(s.caption).toBeNull();
  });
});

describe('dayOf', () => {
  it('시작 당일은 1일째', () => {
    expect(dayOf('2026-09-01', at(1, 23))).toBe(1);
    expect(dayOf('2026-09-01', at(2, 0))).toBe(2);
  });
});
