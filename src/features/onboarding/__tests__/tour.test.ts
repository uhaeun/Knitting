import { buttonLabel, nextStep, TOUR_LAST, TOUR_STEPS } from '@/features/onboarding/tour';

describe('tour', () => {
  it('세 단계이고 순서가 정해져 있다', () => {
    expect(TOUR_STEPS.map((s) => s.key)).toEqual(['angle', 'stack', 'result']);
    expect(TOUR_LAST).toBe(2);
  });
  it('마지막 단계를 넘어가지 않는다', () => {
    expect(nextStep(0)).toBe(1);
    expect(nextStep(2)).toBe(2);
  });
  it('마지막 버튼은 시작하기', () => {
    expect(buttonLabel(0)).toBe('다음');
    expect(buttonLabel(2)).toBe('시작하기');
  });
  it('안내 문구에 "매일"이 없다', () => {
    // 뜨개는 매일 하는 게 아니다 — 재촉하지 않는다
    expect(TOUR_STEPS.some((s) => `${s.title}${s.body}`.includes('매일'))).toBe(false);
  });
});
