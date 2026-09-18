/** 첫 사용 안내의 내용과 순서. 순수 데이터 — 화면과 분리해 테스트한다. */

export type TourStep = {
  key: 'angle' | 'stack' | 'result';
  title: string;
  body: string;
  /** 화면에 그릴 그림 종류 */
  art: 'ghost' | 'stitches' | 'result';
};

export const TOUR_STEPS: readonly TourStep[] = [
  {
    key: 'angle',
    title: '같은 각도로 찍어요',
    body: '첫 장이 기준이 됩니다. 다음부터는 직전 사진이 화면에 옅게 겹쳐 보여서, 같은 자리에 맞추기만 하면 돼요.',
    art: 'ghost',
  },
  {
    key: 'stack',
    title: '며칠 쉬어도 괜찮아요',
    body: '정해진 주기는 없어요. 찍을 때마다 기록이 순서대로 쌓이고, 겉뜨기 코가 하나씩 늘어납니다.',
    art: 'stitches',
  },
  {
    key: 'result',
    title: '쌓이면 결과가 나와요',
    body: '전후·3분할 사진과, 처음부터 지금까지 자라나는 영상을 만들어 사진첩에 저장할 수 있어요.',
    art: 'result',
  },
] as const;

export const TOUR_LAST = TOUR_STEPS.length - 1;

/** 다음 단계 번호. 마지막이면 그대로 둔다 */
export function nextStep(current: number): number {
  return Math.min(current + 1, TOUR_LAST);
}

/** 버튼 문구. 마지막 단계에서는 시작하기 */
export function buttonLabel(current: number): string {
  return current === TOUR_LAST ? '시작하기' : '다음';
}
