import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, fontSize, fontWeight, radius, size, space } from '@/shared/ui/tokens';

type Props = {
  onCapture: () => void;
  onSettings?: () => void;
};

/** 시안 1a 하단 탭: 편물(현재) · 촬영(가운데 강조) · 설정. 1주차엔 편물 화면에서만 쓴다. */
export function TabBar({ onCapture, onSettings }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
      <View style={styles.item}>
        <View style={styles.iconList} />
        <Text style={styles.labelActive}>편물</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="촬영" onPress={onCapture} style={styles.item}>
        <View style={styles.shutter}>
          <View style={styles.shutterRing} />
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onSettings} disabled={!onSettings} style={styles.item}>
        <View style={styles.iconDot} />
        <Text style={styles.label}>설정</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: size.hairline,
    borderColor: color.border,
    backgroundColor: color.bg,
    paddingTop: space.sm,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  item: { width: 88, height: size.tabBarHeight, alignItems: 'center', justifyContent: 'center', gap: space.xs },
  iconList: { width: 18, height: 14, borderWidth: 1.5, borderColor: color.text, borderRadius: 2 },
  iconDot: { width: 16, height: 16, borderWidth: 1.5, borderColor: color.textMuted, borderRadius: radius.pill },
  label: { fontSize: fontSize.caption, color: color.textMuted },
  labelActive: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold, color: color.text },
  shutter: {
    width: size.tap,
    height: size.tap,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterRing: { width: 16, height: 16, borderRadius: radius.pill, borderWidth: 2, borderColor: color.onDark },
});
