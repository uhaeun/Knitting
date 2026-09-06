import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/shared/ui/Button';
import { color, fontSize, fontWeight, space } from '@/shared/ui/tokens';

type Props = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

// 시안 1b: 눈금 4개가 점점 자라는 장식 + 제목 + 설명 + 버튼 하나
const GROWING = [10, 16, 24, 34] as const;

export function EmptyState({ title, description, actionLabel, onAction }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.growing}>
        {GROWING.map((h, i) => (
          <View key={i} style={[styles.bar, { height: h }]} />
        ))}
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    paddingHorizontal: space.xxl + space.xl,
  },
  growing: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs, opacity: 0.35 },
  bar: { width: 3, backgroundColor: color.text },
  title: {
    fontSize: fontSize.heading,
    fontWeight: fontWeight.semibold,
    color: color.text,
    textAlign: 'center',
  },
  description: {
    fontSize: fontSize.label,
    color: color.textMuted,
    textAlign: 'center',
    lineHeight: fontSize.label * 1.6,
  },
  action: { marginTop: space.sm },
});
