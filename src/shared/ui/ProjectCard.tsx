import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StackTicks } from '@/shared/ui/StackTicks';
import { color, fontSize, fontWeight, radius, size, space } from '@/shared/ui/tokens';

type Props = {
  name: string;
  /** "27일째 · 8월 8일 시작" 형태로 호출부에서 만들어 넘긴다 */
  subtitle: string;
  photoCount: number;
  /** 대표 사진 썸네일 file:// URI. 없으면 빈 사각형 */
  thumbUri?: string;
  onPress: () => void;
};

export function ProjectCard({ name, subtitle, photoCount, thumbUri, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {thumbUri ? (
        <Image source={{ uri: thumbUri }} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]} />
      )}
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.ticks}>
          <StackTicks count={photoCount} />
        </View>
        <Text style={styles.subtitle}>사진 {photoCount}장</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderWidth: size.hairline,
    borderColor: color.border,
    borderRadius: radius.card,
    padding: space.md,
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
  },
  pressed: { borderColor: color.accent },
  thumb: {
    width: size.thumb,
    height: size.thumb,
    borderRadius: radius.photo,
  },
  thumbEmpty: { backgroundColor: color.border },
  body: { flex: 1, minWidth: 0, gap: space.xs },
  name: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: color.text },
  subtitle: { fontSize: fontSize.caption, color: color.textMuted },
  ticks: { marginTop: space.xs },
});
