import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePosts } from '@/features/capture/queries';
import { MakeVideoSheet } from '@/features/media/MakeVideoSheet';
import { estimateDurationMs, MIN_PHOTOS } from '@/features/media/plan';
import { useMakeVideo } from '@/features/media/useMakeVideo';
import { postPhotoUri } from '@/features/capture/repository';
import { Scrubber } from '@/features/project/Scrubber';
import { useDeleteProject, useProject, useSetVisibility } from '@/features/project/queries';
import { daysSince, formatMonthDay } from '@/shared/lib/dates';
import { showAlert } from '@/shared/lib/dialog';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useSquareSide } from '@/shared/ui/layout';
import { color, fontSize, fontWeight, size, space } from '@/shared/ui/tokens';

/** 시안 1e — 타임라인 (편물 상세) */
export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const photoSide = useSquareSide(size.webTimelineChrome);
  const project = useProject(id);
  const posts = usePosts(id);
  const del = useDeleteProject();
  const setVis = useSetVisibility();
  const video = useMakeVideo(id);

  const items = posts.data ?? [];
  const total = items.length;
  const [index, setIndex] = useState(0);

  // 새 사진이 추가되면 마지막 장으로
  useEffect(() => {
    if (total > 0) setIndex(total - 1);
  }, [total]);

  const current = items[Math.min(index, Math.max(0, total - 1))];
  const goCapture = () => router.push({ pathname: '/capture/[projectId]', params: { projectId: id } });
  const goResult = () => router.push({ pathname: '/result/[projectId]', params: { projectId: id } });

  const confirmDelete = () => {
    showAlert('편물을 삭제할까요?', '목록에서 사라집니다. 사진 파일은 남습니다.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => del.mutate(id, { onSuccess: () => router.back() }) },
    ]);
  };
  const chooseVisibility = () => {
    const labels = ['나만 보기', '팔로워에게', '전체 공개'] as const;
    const values = ['private', 'followers', 'public'] as const;
    const apply = (i: number) => {
      const v = values[i];
      if (v) setVis.mutate({ id, visibility: v });
    };
    showAlert('이 편물의 사진을 누가 볼까요?', undefined, [
      ...labels.map((l, i) => ({ text: l, onPress: () => apply(i) })),
      { text: '취소', style: 'cancel' as const },
    ]);
  };

  const openMenu = () => {
    showAlert(p?.name ?? '편물', undefined, [
      { text: '공개 범위 바꾸기', onPress: chooseVisibility },
      { text: '편물 삭제', style: 'destructive', onPress: confirmDelete },
      { text: '취소', style: 'cancel' },
    ]);
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
          {p ? (
            <Text style={styles.meta}>
              {formatMonthDay(p.started_at)} 시작 · {daysSince(p.started_at)}일째 ·{' '}
              {p.default_visibility === 'public' ? '전체 공개' : p.default_visibility === 'followers' ? '팔로워' : '나만'}
            </Text>
          ) : null}
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
          <View style={[styles.photo, { width: photoSide, height: photoSide }]}>
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
            <View style={styles.actionRow}>
              <Button label="결과 사진" variant="secondary" large onPress={goResult} style={styles.half} />
              <Button
                label={total < MIN_PHOTOS ? `영상 (${MIN_PHOTOS}장부터)` : '영상 만들기'}
                variant="secondary"
                large
                disabled={total < MIN_PHOTOS}
                onPress={video.start}
                style={styles.half}
              />
            </View>
          </View>
        </>
      )}

      <MakeVideoSheet
        state={video.state}
        photoCount={total}
        estimateSec={estimateDurationMs(total) / 1000}
        onClose={video.reset}
        onRetry={video.start}
        onSave={video.save}
      />
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
  photo: { alignSelf: 'center', backgroundColor: color.border },
  captionRow: { paddingHorizontal: space.xl, paddingTop: space.lg, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  date: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: color.text },
  counter: { fontSize: fontSize.caption, color: color.textMuted, fontVariant: ['tabular-nums'] },
  scrubber: { paddingHorizontal: space.xl, paddingTop: space.lg },
  spacer: { flex: 1 },
  actions: { paddingHorizontal: space.xl, paddingBottom: space.md, gap: space.sm },
  actionRow: { flexDirection: 'row', gap: space.sm },
  half: { flex: 1, paddingHorizontal: space.sm },
});
