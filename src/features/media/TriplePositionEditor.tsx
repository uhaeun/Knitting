import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { layoutPanels, RESULT_METRICS, RESULT_SIDE } from '@/features/media/resultPlan';
import { color } from '@/shared/ui/tokens';

type Rect = { x: number; y: number; width: number; height: number };

type Props = {
  /** 시간순 3장의 원본 사진 URL (서명 URL). 없는 칸은 비워 둔다 */
  uris: (string | undefined)[];
  focusY: number[];
  /** 미리보기와 같은 크기 — 실제 합성(layoutPanels)과 똑같이 칸을 나눠 화면에 보이는 대로 저장되게 한다 */
  width: number;
  height: number;
  onCommit: (index: number, value: number) => void;
};

/**
 * 3분할 위치 조정. 버튼 대신 사진을 눌러 고르고, 눌린 채로 위아래로 끌어서 옮긴다.
 * 미리보기(합성된 결과 이미지) 위에 겹쳐서 그린다 — 끄는 동안은 그 칸의 원본 사진이 그대로 보이고,
 * 손을 떼면 실제 결과(날짜 라벨 포함)가 다시 합성되어 아래에 비친다.
 */
export function TriplePositionEditor({ uris, focusY, width, height, onCommit }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  if (width <= 0 || height <= 0) return null;
  const gutter = RESULT_METRICS.gutter * (width / RESULT_SIDE);
  const rects = layoutPanels(3, width, height, gutter, true);

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width, height }}>
      {rects.map((rect, i) => (
        <PanelBand
          key={i}
          uri={uris[i]}
          rect={rect}
          focusY={focusY[i] ?? 0.5}
          selected={selected === i}
          onSelect={() => setSelected(i)}
          onCommit={(v) => onCommit(i, v)}
        />
      ))}
    </div>
  );
}

function PanelBand({
  uri,
  rect,
  focusY,
  selected,
  onSelect,
  onCommit,
}: {
  uri: string | undefined;
  rect: Rect;
  focusY: number;
  selected: boolean;
  onSelect: () => void;
  onCommit: (value: number) => void;
}) {
  const [live, setLive] = useState(focusY);
  const drag = useRef<{ startY: number; startFocus: number } | null>(null);
  useEffect(() => setLive(focusY), [focusY]);

  // 원본은 늘 정사각(저장 규칙)이라 너비 기준으로 채우면 이미지 높이는 칸 너비와 같다.
  // 그 초과분(칸보다 큰 만큼)만큼만 위아래로 끌 수 있다
  const overflow = Math.max(0, rect.width - rect.height);
  const translateY = -live * overflow;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!selected) {
      onSelect();
      return;
    }
    if (overflow <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startFocus: live };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dy = e.clientY - drag.current.startY;
    setLive(Math.min(1, Math.max(0, drag.current.startFocus - dy / overflow)));
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    onCommit(live);
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        overflow: 'hidden',
        touchAction: 'none',
        cursor: selected && overflow > 0 ? 'ns-resize' : 'pointer',
        boxShadow: selected ? `inset 0 0 0 2px ${color.accent}` : 'none',
      }}
    >
      {uri ? (
        // eslint-disable-next-line jsx-a11y/alt-text -- 장식용, 실제 결과는 아래 합성 미리보기가 대신한다
        <img
          src={uri}
          draggable={false}
          style={{
            width: rect.width,
            height: rect.width,
            objectFit: 'cover',
            transform: `translateY(${translateY}px)`,
            display: 'block',
          }}
        />
      ) : null}
    </div>
  );
}
