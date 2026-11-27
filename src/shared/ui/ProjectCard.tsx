import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { JournalIcon } from '@/shared/ui/JournalIcon';
import { color, fontSize, fontWeight, journalType, radius, size, space } from '@/shared/ui/tokens';

type Props = {
  name: string;
  subtitle: string;
  photoCount: number;
  thumbUri?: string;
  onPress: () => void;
  onCapture: () => void;
  done: boolean;
  featured: boolean;
};

export function ProjectCard({ name, subtitle, photoCount, thumbUri, onPress, onCapture, done, featured }: Props) {
  const picture = (
    <View style={featured ? styles.cover : styles.thumb}>
      {thumbUri ? (
        <Image source={{ uri: thumbUri }} contentFit="cover" style={StyleSheet.absoluteFill} />
      ) : (
        <JournalIcon name="projects" tint={color.textMuted} dimension={size.journalMark} />
      )}
    </View>
  );
  const capture = (
    <Pressable accessibilityRole="button" accessibilityLabel={name + ' 찍기'} onPress={onCapture}
      style={({ pressed }) => [styles.capture, pressed && styles.pressed]}>
      <JournalIcon name="camera" dimension={size.journalSmallGlyph} tint={featured ? color.accent : color.textMuted} />
      {featured && <Text style={styles.actionText}>기록 추가</Text>}
    </Pressable>
  );
  const status = (done ? '완성' : '뜨는 중') + ' · 기록 ' + photoCount + '개';
  const details = (
    <View style={styles.details}>
      <Text style={styles.meta}>{status}</Text>
      <Text numberOfLines={2} style={featured ? styles.featureName : styles.name}>{name}</Text>
      <Text style={styles.meta}>{subtitle}</Text>
    </View>
  );

  if (featured) {
    return (
      <View style={styles.feature}>
        <Pressable accessibilityRole="button" accessibilityLabel={name} onPress={onPress}
          style={({ pressed }) => pressed && styles.pressed}>
          {picture}
        </Pressable>
        <View style={styles.caption}>
          <Pressable accessibilityRole="button" accessibilityLabel={name + ' 기록 보기'} onPress={onPress}
            style={({ pressed }) => [styles.captionLink, pressed && styles.pressed]}>{details}</Pressable>
          {capture}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={name} onPress={onPress}
        style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}>
        {picture}
        {details}
      </Pressable>
      {capture}
    </View>
  );
}

const styles = StyleSheet.create({
  feature: { borderBottomWidth: size.hairline, borderColor: color.border },
  cover: { width: '100%', aspectRatio: size.journalCoverRatio, alignItems: 'center', justifyContent: 'center',
    backgroundColor: color.journalLinen, borderRadius: space.xs, overflow: 'hidden' },
  caption: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  captionLink: { flex: 1, minWidth: 0 },
  details: { flex: 1, minWidth: 0, gap: space.xs },
  featureName: { color: color.journalInk, fontSize: fontSize.heading, fontFamily: journalType.korean, fontWeight: journalType.medium },
  meta: { color: color.textMuted, fontSize: fontSize.caption },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderBottomWidth: size.hairline,
    borderColor: color.border, paddingVertical: space.md },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minWidth: 0 },
  thumb: { width: size.journalCompactThumb, height: size.journalCompactThumb, alignItems: 'center', justifyContent: 'center',
    backgroundColor: color.journalLinen, borderRadius: radius.photo, overflow: 'hidden' },
  name: { color: color.text, fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  capture: { minWidth: size.tap, minHeight: size.tap, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  actionText: { color: color.accent, fontSize: fontSize.label, fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.75 },
});
