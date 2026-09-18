import { StyleSheet, View } from 'react-native';

import { color } from '@/shared/ui/tokens';

type Props = {
  /** 전체 기록 수 */
  total: number;
  /** 지금 보고 있는 기록 (0부터). 없으면 전부 지나온 것으로 그린다 */
  index?: number;
  /** 한 코 높이. 카드에서는 작게, 타임라인에서는 크게 */
  unit?: number;
  /** 한 줄에 놓을 코 수. 넘치면 아래로 쌓인다 (편물처럼 위로 자란다) */
  perRow?: number;
};

/**
 * 겉뜨기 V 모양으로 기록을 센다. 기록 하나 = 코 하나.
 * 지나온 코는 진하게, 아직 안 온 코는 흐리게, 보고 있는 코는 강조색.
 * 진행률 막대가 아니라 '쌓임'이다 — 목표치가 없다.
 */
export function StitchRow({ total, index, unit = 10, perRow = 12 }: Props) {
  const rows: number[][] = [];
  for (let i = 0; i < total; i += perRow) {
    rows.push(Array.from({ length: Math.min(perRow, total - i) }, (_, k) => i + k));
  }
  // 아래에서 위로 자라는 편물처럼, 마지막 줄이 맨 위에 오게 뒤집는다
  rows.reverse();

  return (
    <View style={styles.wrap} accessibilityLabel={`기록 ${total}개`}>
      {rows.map((row) => (
        <View key={row[0]} style={[styles.row, { gap: unit * 0.22 }]}>
          {row.map((i) => {
            const current = index === i;
            const done = index === undefined || i <= index;
            const tint = current ? color.accent : done ? color.text : color.tickInactive;
            return <Stitch key={i} unit={unit} tint={tint} />;
          })}
        </View>
      ))}
    </View>
  );
}

/** 겉뜨기 한 코. 두 획이 아래에서 만나는 V */
function Stitch({ unit, tint }: { unit: number; tint: string }) {
  const stroke = Math.max(1.5, unit * 0.2);
  const leg = { width: stroke, height: unit, backgroundColor: tint, borderRadius: stroke / 2 };
  return (
    <View style={{ width: unit * 0.78, height: unit, position: 'relative' }}>
      <View style={[leg, styles.legLeft, { transform: [{ rotate: '18deg' }] }]} />
      <View style={[leg, styles.legRight, { transform: [{ rotate: '-18deg' }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 3 },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  legLeft: { position: 'absolute', left: 0, bottom: 0 },
  legRight: { position: 'absolute', right: 0, bottom: 0 },
});
