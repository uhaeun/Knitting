import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePosts } from '@/features/capture/queries';
import { postPhotoUri } from '@/features/capture/repository';
import { Scrubber } from '@/features/project/Scrubber';
import { useDeleteProject, useProject } from '@/features/project/queries';
import { daysSince, formatMonthDay } from '@/shared/lib/dates';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { color, fontSize, fontWeight, size, space } from '@/shared/ui/tokens';

/** 시안 1e — 타임라인 (편물 상세) */
export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width: screenW } = useWindowDimensions();
  const project = useProject(id);
  const posts = usePosts(id);
  const del = useDeleteProject();

  const items = posts.data ?? [];
  const total = items.length;
  const [index, setIndex] = useState(0);

  // 새 사진이 추가되면 마지막 장으로
  useEffect(() => {
    if (total > 0) setIndex(total - 1);
  }, [total]);

  const current = items[Math.min(index, Math.max(0, total - 1))];
  const goCapture = () => router.push({ pathname: '/capture/[projectId]', params: { projectId: id } });

  const confirmDelete = () => {
    Alert.alert('편물을 삭제할까요?', '목록에서 사라집니다. 사진 파일은 남습니다.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => del.mutate(id, { onSuccess: () => router.back() }) },
    ]);
  };
  const openMenu = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['취소', '편물 삭제'], cancelButtonIndex: 0, destructiveButtonIndex: 1 },
        (i) => i === 1 && confirmDelete(),
      );
    } else {
      confirmDelete();
    }
  };

  if (project.isSuccess && project.data === null) {
    return (
      <SafeAreaView style={styles.root}>
        <EmptyState title="편물을 찾을 수 없어요" description="삭제되었거나 잘못된 링크입니다." actionLabel="목록으로" onAction={() => router.back()} />
      </SafeAreaView>
    );
  }
  const p = project.data;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.tap}>
          <View style={styles.chevron} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={1}>{p?.name ?? ''}</Text>
          {p ? <Text style={styles.meta}>{formatMonthDay(p.started_at)} 시작 · {daysSince(p.started_at)}일째</Text> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="더 보기" onPress={openMenu} style={styles.tap}>
          <Text style={styles.more}>⋯</Text>
        </Pressable>
      </View>

      {total === 0 ? (
        <EmptyState
          title="아직 사진이 없어요"
          description="첫 장을 찍으면 그게 앞으로의 기준 각도가 됩니다."
          actionLabel="사진 찍기"
          onAction={goCapture}
        />
      ) : (
        <>
          <View style={[styles.photo, { width: screenW, height: screenW }]}>
            {current ? <Image source={{ uri: postPhotoUri(current) }} contentFit="cover" style={StyleSheet.absoluteFill} /> : null}
          </View>
          <View style={styles.captionRow}>
            <Text style={styles.date}>{current ? formatMonthDay(current.taken_at) : ''}</Text>
            <Text style={styles.counter}>{index + 1} / {total}</Text>
          </View>
          <View style={styles.scrubber}>
            <Scrubber total={total} index={index} onChange={setIndex} />
          </View>
          <View style={styles.spacer} />
          <View style={styles.actions}>
            <Button label="사진 찍기" large onPress={goCapture} />
            <Button label="영상 만들기" variant="secondary" large disabled onPress={() => {}} />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.md, gap: space.sm },
  tap: { width: size.tap, height: size.tap, alignItems: 'center', justifyContent: 'center' },
  chevron: { width: 12, height: 12, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: color.text, transform: [{ rotate: '45deg' }], marginLeft: 4 },
  headerText: { flex: 1, gap: space.xs, paddingTop: space.sm },
  name: { fontSize: fontSize.heading, fontWeight: fontWeight.semibold, color: color.text },
  meta: { fontSize: fontSize.caption, color: color.textMuted },
  more: { fontSize: fontSize.heading, color: color.textMuted },
  photo: { backgroundColor: color.border },
  captionRow: { paddingHorizontal: space.xl, paddingTop: space.lg, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  date: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: color.text },
  counter: { fontSize: fontSize.caption, color: color.textMuted, fontVariant: ['tabular-nums'] },
  scrubber: { paddingHorizontal: space.xl, paddingTop: space.lg },
  spacer: { flex: 1 },
  actions: { paddingHorizontal: space.xl, paddingBottom: space.md, gap: space.sm },
});
