import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { color, fontSize, fontWeight, radius, size, space } from '@/shared/ui/tokens';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  /** 되돌릴 수 없는 삭제 버튼 */
  danger?: boolean;
  disabled?: boolean;
  /** 시트·화면 하단의 큰 버튼은 52, 인라인은 48 */
  large?: boolean;
  style?: ViewStyle;
};

export function Button({ label, onPress, variant = 'primary', danger, disabled, large, style }: Props) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        large ? styles.large : styles.regular,
        primary ? styles.primary : styles.secondary,
        danger && styles.danger,
        pressed && (primary ? styles.primaryPressed : styles.secondaryPressed),
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, primary || danger ? styles.labelPrimary : styles.labelSecondary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
  },
  regular: { height: size.buttonHeight },
  large: { height: size.primaryButtonHeight },
  primary: { backgroundColor: color.accent },
  danger: { backgroundColor: color.danger, borderWidth: 0 },
  primaryPressed: { backgroundColor: color.accentPressed },
  secondary: {
    backgroundColor: color.surface,
    borderWidth: size.hairline,
    borderColor: color.border,
  },
  secondaryPressed: { borderColor: color.accent },
  disabled: { opacity: 0.4 },
  label: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  labelPrimary: { color: color.onDark },
  labelSecondary: { color: color.text },
});
