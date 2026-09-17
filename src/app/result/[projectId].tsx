import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RESULT_KINDS } from '@/features/media/resultPlan';
import { useResultPhoto } from '@/features/media/useResultPhoto';
import { showAlert } from '@/shared/lib/dialog';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useSquareSide } from '@/shared/ui/layout';
import { Segmented } from '@/shared/ui/Segmented';
import { color, fontSize, fontWeight, size, space } from '@/shared/ui/tokens';

// 웹은 앨범 대신 파일로 내려받는다 (composeResult.web.ts)
const SAVE = Platform.OS === 'web' ? '파일로 저장' : '앨범에 저장';
const SAVED = Platform.OS === 'web' ? '저장함' : '앨범에 저장됨';

const guard = (title: string, fn: () => Promise<void>) => () =>
  fn().catch((e: unknown) => showAlert(title, e instanceof Error ? e.message : String(e)));

/** 결과 사진: 전체 1장 · 전후 2분할 · 3분할 (설계도 6장). 기기 안에서 합성한다. */
export default function ResultScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const side = useSquareSide(size.webResultChrome);
  const r = useResultPhoto(projectId);

  const header = (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.tap}>
        <View style={styles.chevron} />
      </Pressable>
      <View style={styles.headerText}>
        <Text style={styles.title}>결과 사진</Text>
        <Text style={styles.meta} numberOfLines={1}>{r.projectName}</Text>
      </View>
      <View style={styles.tap} />
    </View>
  );

  if (!r.loadingPhotos && r.photoCount === 0) {
    return (
      <SafeAreaView style={styles.root}>
        {header}
        <EmptyState title="아직 사진이 없어요" description="한 장 이상 찍으면 결과 사진을 만들 수 있어요." actionLabel="뒤로" onAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  const options = RESULT_KINDS.map((k) => ({
    key: k.kind,
    label: k.label,
    disabled: r.photoCount < k.minPhotos,
  }));
  const ready = !!r.uri && !r.composing;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {header}

      <View style={[styles.preview, { width: side, height: side }]}>
        {r.uri ? <Image source={{ uri: r.uri }} contentFit="cover" style={StyleSheet.absoluteFill} accessibilityLabel="결과 사진 미리보기" /> : null}
        {r.composing || r.loadingPhotos ? (
          <View style={styles.busy}>
            <ActivityIndicator color={color.onDark} />
            <Text style={styles.busyText}>만드는 중</Text>
          </View>
        ) : null}
        {r.error ? (
          <View style={styles.busy}>
            <Text style={styles.busyText}>만들지 못했어요{'\n'}{r.error}</Text>
            <Button label="다시 시도" variant="secondary" onPress={r.retry} />
          </View>
        ) : null}
      </View>

      <View style={styles.controls}>
        <Segmented options={options} value={r.kind} onChange={r.choose} />
        <Text style={styles.hint}>
          {r.kind === 'single'
            ? '가장 최근 사진에 편물 이름과 며칠째인지 적어요.'
            : r.kind === 'beforeAfter'
              ? '첫 사진과 가장 최근 사진을 나란히 놓아요.'
              : '첫 사진, 기간의 한가운데 사진, 가장 최근 사진을 나란히 놓아요.'}
        </Text>
      </View>

      <View style={styles.spacer} />
      <View style={styles.actions}>
        <Button label={r.saved ? SAVED : SAVE} large disabled={!ready || r.saved} onPress={guard('저장하지 못했어요', r.save)} />
        <Button label="공유" variant="secondary" large disabled={!ready} onPress={guard('공유하지 못했어요', r.share)} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.md, gap: space.sm },
  tap: { width: size.tap, height: size.tap, alignItems: 'center', justifyContent: 'center' },
  chevron: { width: 12, height: 12, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: color.text, transform: [{ rotate: '45deg' }], marginLeft: 4 },
  headerText: { flex: 1, gap: space.xs, paddingTop: space.sm },
  title: { fontSize: fontSize.heading, fontWeight: fontWeight.semibold, color: color.text },
  meta: { fontSize: fontSize.caption, color: color.textMuted },
  preview: { alignSelf: 'center', backgroundColor: color.border, overflow: 'hidden' },
  busy: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl, backgroundColor: color.overlay },
  busyText: { fontSize: fontSize.caption, color: color.onDark, textAlign: 'center', lineHeight: fontSize.caption * 1.5 },
  controls: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.sm },
  hint: { fontSize: fontSize.caption, color: color.textMuted },
  spacer: { flex: 1 },
  actions: { paddingHorizontal: space.xl, paddingBottom: space.md, gap: space.sm },
});
