import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { color, fontSize, radius, size, space } from '@/shared/ui/tokens';

type Props = TextInputProps & { label: string };

/** 라벨 + 입력 하나. 시트의 "편물 이름" 등. */
export function Field({ label, style, ...input }: Props) {
  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={color.textMuted}
        // 라벨을 입력칸에 연결한다 (화면 낭독기와 자동 검사가 칸을 찾을 수 있게)
        aria-label={label}
        accessibilityLabel={label}
        style={[styles.input, style]}
        {...input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
  label: { fontSize: fontSize.caption, color: color.textMuted },
  input: {
    height: size.inputHeight,
    borderWidth: size.hairline,
    borderColor: color.border,
    borderRadius: radius.button,
    backgroundColor: color.bg,
    paddingHorizontal: space.md,
    fontSize: fontSize.body,
    color: color.text,
  },
});
