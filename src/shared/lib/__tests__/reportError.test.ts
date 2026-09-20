import { shouldReport, trimForReport } from '@/shared/lib/reportError';

describe('같은 오류 쏟아짐 막기', () => {
  it('같은 문구는 1분에 한 번만', () => {
    const t = 1_000_000;
    expect(shouldReport('같은 오류', t)).toBe(true);
    expect(shouldReport('같은 오류', t + 1_000)).toBe(false);
    expect(shouldReport('같은 오류', t + 61_000)).toBe(true);
  });
  it('다른 문구는 따로 센다', () => {
    const t = 2_000_000;
    expect(shouldReport('A 오류', t)).toBe(true);
    expect(shouldReport('B 오류', t)).toBe(true);
  });
});

describe('서버에 넣기 전 자르기', () => {
  it('길면 자르고, 없으면 null', () => {
    const r = trimForReport({ message: 'x'.repeat(600), stack: null, where: '/projects' });
    expect(r.message).toHaveLength(500);
    expect(r.stack).toBeNull();
    expect(r.where_at).toBe('/projects');
    expect(r.agent).toBeNull();
  });
  it('문구가 비면 기본 글', () => {
    expect(trimForReport({ message: '' }).message).toBe('알 수 없는 오류');
  });
});
