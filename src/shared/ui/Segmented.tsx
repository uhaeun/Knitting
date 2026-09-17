import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, fontSize, fontWeight, radius, size } from '@/shared/ui/tokens';

type Option<K extends string> = { key: K; label: string; disabled?: boolean };
type Props<K extends string> = { options: readonly Option<K>[]; value: K; onChange: (key: K) => void };

/** 밝은 화면용 세그먼트. 선택된 칸은 강조색 바탕 (촬영 화면의 GhostToggle은 어두운 화면용) */
export function Segmented<K extends string>({ options, value, onChange }: Props<K>) {
  return (
    <View style={styles.group} accessibilityRole="radiogroup">
      {options.map((o, i) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="radio"
            aria-checked={on} // accessibilityState는 웹(react-native-web)에서 ARIA로 옮겨지지 않는다
            aria-disabled={o.disabled}
            accessibilityLabel={o.label}
            disabled={o.disabled}
            onPress={() => onChange(o.key)}
            style={[styles.seg, i > 0 && styles.divider, on && styles.segOn, o.disabled && styles.segDisabled]}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{o.label}</Text>
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
    borderColor: color.border,
    borderRadius: radius.button,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  seg: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  divider: { borderLeftWidth: size.hairline, borderLeftColor: color.border },
  segOn: { backgroundColor: color.accent },
  segDisabled: { opacity: 0.4 },
  label: { fontSize: fontSize.label, fontWeight: fontWeight.semibold, color: color.text },
  labelOn: { color: color.onDark },
});
