import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, fontSize, fontWeight, radius, size, type GhostLevel } from '@/shared/ui/tokens';

const LEVELS: { key: GhostLevel; label: string }[] = [
  { key: 'off', label: '끔' },
  { key: 'low', label: '30%' },
  { key: 'high', label: '60%' },
];

type Props = { value: GhostLevel; onChange: (g: GhostLevel) => void };

/** 시안 1c "겹치기" 세그먼트. 선택된 칸은 흰 배경 — 어두운 배경 위에서 명도로 읽힌다. */
export function GhostToggle({ value, onChange }: Props) {
  return (
    <View style={styles.group} accessibilityRole="radiogroup">
      {LEVELS.map((l, i) => {
        const on = l.key === value;
        return (
          <Pressable
            key={l.key}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(l.key)}
            style={[styles.seg, i > 0 && styles.segDivider, on && styles.segOn]}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{l.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    height: size.tap,
    borderWidth: size.hairline,
    borderColor: color.onDarkBorder,
    borderRadius: radius.button,
    overflow: 'hidden',
  },
  seg: { width: 64, alignItems: 'center', justifyContent: 'center' },
  segDivider: { borderLeftWidth: size.hairline, borderLeftColor: color.onDarkBorder },
  segOn: { backgroundColor: color.onDark },
  label: { fontSize: fontSize.label, fontWeight: fontWeight.semibold, color: color.onDarkSecondary },
  labelOn: { color: color.cameraBg },
});
