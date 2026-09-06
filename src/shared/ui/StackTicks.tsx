import { StyleSheet, View } from 'react-native';

import { color, size } from '@/shared/ui/tokens';

type Props = {
  count: number;
  /** 한 줄에 다 안 들어가면 잘라낸다. 목표가 아니라 쌓임이므로 진행률 바처럼 보이면 안 된다. */
  max?: number;
};

/** 편물 카드의 "사진 몇 장" 눈금. 개수만큼 옆으로 늘어난다. */
export function StackTicks({ count, max = 60 }: Props) {
  const n = Math.min(count, max);
  return (
    <View style={styles.row} accessibilityLabel={`사진 ${count}장`}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={styles.tick} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: size.tick.gap,
    height: size.tick.height,
    overflow: 'hidden',
  },
  tick: {
    width: size.tick.width,
    height: size.tick.height,
    backgroundColor: color.text,
  },
});
