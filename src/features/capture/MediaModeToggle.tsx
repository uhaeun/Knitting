import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CaptureMode } from '@/features/capture/store';
import { color, fontSize, fontWeight, radius, size } from '@/shared/ui/tokens';

type Props = { value: CaptureMode; onChange: (m: CaptureMode) => void; videoDisabled?: boolean; disabled?: boolean };

const OPTIONS: { key: CaptureMode; label: string }[] = [
  { key: 'photo', label: '사진' },
  { key: 'video', label: '영상' },
];

/** 촬영 화면(어두운 배경)용 [사진 | 영상]. 선택 상태는 aria-checked (react-native-web이 accessibilityState를 옮기지 않음) */
export function MediaModeToggle({ value, onChange, videoDisabled, disabled: allDisabled }: Props) {
  return (
    <View style={styles.group} accessibilityRole="radiogroup">
      {OPTIONS.map((o, i) => {
        const on = o.key === value;
        const disabled = allDisabled || (o.key === 'video' && videoDisabled);
        return (
          <Pressable
            key={o.key}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            aria-checked={on}
            aria-disabled={disabled}
            disabled={disabled}
            onPress={() => onChange(o.key)}
            style={[styles.seg, i > 0 && styles.divider, on && styles.segOn, disabled && styles.segDisabled]}
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
    alignSelf: 'center',
    height: size.tap,
    borderWidth: size.hairline,
    borderColor: color.onDarkBorder,
    borderRadius: radius.button,
    overflow: 'hidden',
  },
  seg: { width: size.albumButton + size.tap, alignItems: 'center', justifyContent: 'center' },
  divider: { borderLeftWidth: size.hairline, borderLeftColor: color.onDarkBorder },
  segOn: { backgroundColor: color.onDark },
  segDisabled: { opacity: 0.4 },
  label: { fontSize: fontSize.label, fontWeight: fontWeight.semibold, color: color.onDarkSecondary },
  labelOn: { color: color.cameraBg },
});
