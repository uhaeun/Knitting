import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { color, fontSize, size, space } from '@/shared/ui/tokens';

type Props = {
  total: number;
  index: number;
  onChange: (index: number) => void;
};

/** 시안 1e. 눈금 total개, 현재까지는 강조색. 드래그로 이동, 양끝 "처음/마지막". 50장 넘어도 동작. */
export function Scrubber({ total, index, onChange }: Props) {
  const [trackW, setTrackW] = useState(0);

  const pick = (e: GestureResponderEvent) => {
    if (trackW <= 0 || total <= 1) return;
    const p = Math.min(1, Math.max(0, e.nativeEvent.locationX / trackW));
    onChange(Math.round(p * (total - 1)));
  };

  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" onPress={() => onChange(0)} style={styles.edge}>
        <Text style={styles.edgeText}>처음</Text>
      </Pressable>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel="타임라인"
        accessibilityValue={{ min: 1, max: total, now: index + 1 }}
        onLayout={(e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        style={styles.track}
      >
        <View style={styles.ticks}>
          {Array.from({ length: total }, (_, i) => {
            const reached = i <= index;
            const h = i === index ? 20 : reached ? 14 : 8;
            return (
              <View
                key={i}
                style={[styles.tick, { height: h, backgroundColor: reached ? color.accent : color.tickInactive }]}
              />
            );
          })}
        </View>
        {total > 1 ? (
          <View pointerEvents="none" style={[styles.thumb, { left: `${(index / (total - 1)) * 100}%` }]} />
        ) : null}
      </View>
      <Pressable accessibilityRole="button" onPress={() => onChange(total - 1)} style={[styles.edge, styles.edgeRight]}>
        <Text style={styles.edgeText}>마지막</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  edge: { width: size.tap, height: size.tap, justifyContent: 'center' },
  edgeRight: { alignItems: 'flex-end' },
  edgeText: { fontSize: fontSize.caption, color: color.textMuted },
  track: { flex: 1, height: size.tap, justifyContent: 'center' },
  ticks: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 20 },
  tick: { flex: 1, minWidth: 1 },
  thumb: { position: 'absolute', top: 2, bottom: 2, width: 3, marginLeft: -1.5, backgroundColor: color.accent },
});
