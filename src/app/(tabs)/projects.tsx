import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CreateProjectSheet } from '@/features/project/CreateProjectSheet';
import { useProjects } from '@/features/project/queries';
import { daysSince, formatMonthDay } from '@/shared/lib/dates';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ProjectCard } from '@/shared/ui/ProjectCard';
import { color, fontSize, fontWeight, radius, size, space } from '@/shared/ui/tokens';

/** 시안 1a / 1b — 편물 목록 (홈) */
export default function HomeScreen() {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { create } = useLocalSearchParams<{ create?: string }>();

  // 편물이 없을 때 탭바 촬영 버튼이 ?create=1로 보낸다
  useEffect(() => {
    if (create !== '1') return;
    setSheetOpen(true);
    router.setParams({ create: undefined });
  }, [create, router]);
  const projects = useProjects();
  const items = projects.data ?? [];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>내 편물</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="편물 추가"
          onPress={() => setSheetOpen(true)}
          style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
        >
          <View style={styles.plusH} />
          <View style={styles.plusV} />
        </Pressable>
      </View>

      {projects.isError ? (
        <EmptyState title="목록을 불러오지 못했어요" description={String(projects.error)} />
      ) : items.length === 0 && !projects.isPending ? (
        <EmptyState
          title="첫 편물을 만들어 보세요"
          description="매일 같은 각도로 한 장씩. 사진이 쌓이면 편물이 자라나는 영상이 됩니다."
          actionLabel="편물 만들기"
          onAction={() => setSheetOpen(true)}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ProjectCard
              name={item.name}
              subtitle={`${daysSince(item.started_at)}일째 · ${formatMonthDay(item.started_at)} 시작`}
              photoCount={item.photo_count}
              thumbUri={item.cover_thumb_path ?? undefined}
              onPress={() => router.push({ pathname: '/project/[id]', params: { id: item.id } })}
            />
          )}
        />
      )}

      <CreateProjectSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreated={(id) => router.push({ pathname: '/project/[id]', params: { id } })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.md,
  },
  title: { fontSize: fontSize.title, fontWeight: fontWeight.semibold, color: color.text, letterSpacing: -0.5 },
  addButton: {
    width: size.tap,
    height: size.tap,
    borderWidth: size.hairline,
    borderColor: color.border,
    borderRadius: radius.button,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonPressed: { borderColor: color.accent },
  plusH: { position: 'absolute', width: 16, height: 2, backgroundColor: color.text },
  plusV: { position: 'absolute', width: 2, height: 16, backgroundColor: color.text },
  list: { paddingHorizontal: space.xl, paddingTop: space.xs, paddingBottom: space.xl, gap: space.md },
});
