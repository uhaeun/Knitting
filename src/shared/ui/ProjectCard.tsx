import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StitchRow } from '@/shared/ui/StitchRow';
import { color, fontSize, fontWeight, radius, size, space } from '@/shared/ui/tokens';

type Props = {
  name: string;
  /** "9월 7일 시작" 형태로 호출부에서 만들어 넘긴다 */
  subtitle: string;
  photoCount: number;
  /** 대표 사진 썸네일 file:// URI. 없으면 빈 사각형 */
  thumbUri?: string;
  onPress: () => void;
  /** 카드에서 바로 촬영 화면으로. 없으면 버튼을 그리지 않는다 */
  onCapture?: () => void;
};

export function ProjectCard({ name, subtitle, photoCount, thumbUri, onPress, onCapture }: Props) {
  // 카드 본문과 '찍기'를 형제 버튼으로 둔다 (버튼 안에 버튼을 넣으면 웹·스크린리더에서 깨진다)
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
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
            <StitchRow total={photoCount} unit={9} perRow={16} />
          </View>
          <Text style={styles.subtitle}>기록 {photoCount}개</Text>
        </View>
      </Pressable>
      {onCapture ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${name} 찍기`}
          onPress={onCapture}
          hitSlop={8}
          style={({ pressed }) => [styles.capture, pressed && styles.capturePressed]}
        >
          <Text style={styles.captureText}>찍기</Text>
        </Pressable>
      ) : null}
    </View>
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
    alignItems: 'center',
  },
  main: { flex: 1, minWidth: 0, flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  pressed: { opacity: 0.7 },
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
  capture: {
    alignSelf: 'center', paddingHorizontal: space.md, paddingVertical: space.sm,
    borderRadius: radius.pill, backgroundColor: color.accent,
  },
  capturePressed: { backgroundColor: color.accentPressed },
  captureText: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold, color: color.onDark },
});
