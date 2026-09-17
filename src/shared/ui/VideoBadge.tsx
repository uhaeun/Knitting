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
