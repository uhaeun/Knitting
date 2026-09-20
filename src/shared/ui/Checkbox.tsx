import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, fontSize, radius, size, space } from '@/shared/ui/tokens';

type Props = {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  children?: ReactNode; // 라벨 아래 줄 (문서 링크 등)
};

/** 네모 칸 + 라벨. 라벨 전체가 누르는 영역이다. */
export function Checkbox({ checked, onChange, label, children }: Props) {
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={label}
        aria-checked={checked} // react-native-web은 accessibilityState를 ARIA로 옮기지 않는다
        onPress={() => onChange(!checked)}
        style={styles.row}
      >
        <View style={[styles.box, checked && styles.boxOn]}>
          {checked ? <View style={styles.tick} /> : null}
        </View>
        <Text style={styles.label}>{label}</Text>
      </Pressable>
      {children ? <View style={styles.extra}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  box: {
    width: 22, height: 22, borderRadius: radius.photo, borderWidth: size.hairline * 2,
    borderColor: color.border, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface,
  },
  boxOn: { backgroundColor: color.accent, borderColor: color.accent },
  tick: { width: 10, height: 5, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: color.onDark, transform: [{ rotate: '-45deg' }], marginTop: -2 },
  label: { flex: 1, fontSize: fontSize.label, color: color.text },
  extra: { paddingLeft: 22 + space.sm },
});
