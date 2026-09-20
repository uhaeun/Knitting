import { StyleSheet, Text, View } from 'react-native';

import { color, fontSize, radius, size, space } from '@/shared/ui/tokens';

type Props = {
  label: string;
  /** 'YYYY-MM-DD' */
  value: string;
  onChange: (iso: string) => void;
  max?: string;
};

/** 날짜 고르기. 앱 안 웹뷰에서도 기기 기본 날짜 선택기가 뜬다 (알림 시각과 같은 방식). */
export function DateField({ label, value, onChange, max }: Props) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <input
        type="date"
        aria-label={label}
        value={value}
        max={max}
        onChange={(e) => {
          const next = e.currentTarget.value;
          if (next) onChange(next);
        }}
        style={{
          fontSize: fontSize.body,
          padding: `0 ${space.md}px`,
          height: size.inputHeight,
          borderRadius: radius.button,
          border: `${size.hairline}px solid ${color.border}`,
          background: color.bg,
          color: color.text,
          fontFamily: 'inherit',
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.sm },
  label: { fontSize: fontSize.caption, color: color.textMuted },
});
