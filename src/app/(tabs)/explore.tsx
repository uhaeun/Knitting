import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { flattenFeed, useExploreFeed, useSearchAll } from '@/features/social/queries';
import { Avatar } from '@/shared/ui/Avatar';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Field } from '@/shared/ui/Field';
import { color, fontSize, fontWeight, radius, size, space } from '@/shared/ui/tokens';

const SORTS = [
  { key: 'recent', label: '최신' },
  { key: 'popular', label: '인기' },
] as const;

/** 탐색: 전체 공개 게시물 그리드 + 사용자 검색 */
export default function ExploreScreen() {
  const router = useRouter();
  const [sort, setSort] = useState<'recent' | 'popular'>('recent');
  const [query, setQuery] = useState('');
  const feed = useExploreFeed(sort);
  const { posts, urls } = useMemo(() => flattenFeed(feed.data), [feed.data]);
  const found = useSearchAll(query);
  const searching = query.trim().length >= 2;
  // 사람 · 편물 · 기록을 한 목록에 섞어 보여 준다 (칸 수가 같아야 FlatList가 안전하다)
  const results = useMemo(() => {
    const r = found.data;
    if (!r) return [];
    return [
      ...(r.people.length ? [{ type: 'head' as const, key: 'h-people', label: '사람' }] : []),
      ...r.people.map((p) => ({ type: 'person' as const, key: `u-${p.id}`, person: p })),
      ...(r.projects.length ? [{ type: 'head' as const, key: 'h-projects', label: '편물' }] : []),
      ...r.projects.map((p) => ({ type: 'project' as const, key: `p-${p.id}`, project: p })),
      ...(r.posts.length ? [{ type: 'head' as const, key: 'h-posts', label: '메모' }] : []),
      ...r.posts.map((p) => ({ type: 'post' as const, key: `s-${p.id}`, post: p })),
    ];
  }, [found.data]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>탐색</Text>
        <Field
          label=""
          value={query}
          onChangeText={setQuery}
          placeholder="사람 · 편물 이름 · 메모(#태그) 검색"
          autoCapitalize="none"
          aria-label="검색"
        />
        {!searching ? (
          <View style={styles.sorts}>
            {SORTS.map((s) => {
              const on = s.key === sort;
              return (
                <Pressable key={s.key} accessibilityRole="button" onPress={() => setSort(s.key)} style={[styles.sort, on && styles.sortOn]}>
                  <Text style={[styles.sortText, on && styles.sortTextOn]}>{s.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {searching ? (
        <FlatList
          // key: 격자(3칸)와 목록(1칸)이 같은 자리라 key가 없으면 FlatList가 재사용돼 numColumns가 바뀌며 터진다
          key="people"
          data={results}
          keyExtractor={(r) => r.key}
          ListEmptyComponent={found.isPending ? null : <Text style={styles.noResult}>검색 결과가 없어요</Text>}
          renderItem={({ item }) => {
            if (item.type === 'head') return <Text style={styles.sectionHead}>{item.label}</Text>;
            if (item.type === 'person') {
              const p = item.person;
              return (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/user/[username]', params: { username: p.username } })}
                  style={styles.person}
                >
                  <Avatar path={p.avatar_path} name={p.display_name} size={40} />
                  <View style={styles.personText}>
                    <Text style={styles.personName}>{p.display_name}</Text>
                    <Text style={styles.personHandle}>@{p.username}{p.is_private ? ' · 비공개' : ''}</Text>
                  </View>
                </Pressable>
              );
            }
            if (item.type === 'project') {
              const p = item.project;
              return (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/project/[id]', params: { id: p.id } })}
                  style={styles.person}
                >
                  {p.thumbUrl ? (
                    <Image source={{ uri: p.thumbUrl }} style={styles.hitThumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.hitThumb, styles.hitThumbEmpty]} />
                  )}
                  <View style={styles.personText}>
                    <Text style={styles.personName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.personHandle} numberOfLines={1}>{p.ownerName} · 공개된 기록 {p.postCount}개</Text>
                  </View>
                </Pressable>
              );
            }
            const p = item.post;
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/post/[id]', params: { id: p.id } })}
                style={styles.person}
              >
                {p.thumbUrl ? (
                  <Image source={{ uri: p.thumbUrl }} style={styles.hitThumb} contentFit="cover" />
                ) : (
                  <View style={[styles.hitThumb, styles.hitThumbEmpty]} />
                )}
                <View style={styles.personText}>
                  <Text style={styles.personName} numberOfLines={2}>{p.caption}</Text>
                  <Text style={styles.personHandle} numberOfLines={1}>{p.projectName}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      ) : feed.isError ? (
        <EmptyState title="불러오지 못했어요" description={String(feed.error)} />
      ) : posts.length === 0 && !feed.isPending ? (
        <EmptyState title="아직 공개된 편물이 없어요" description="첫 번째로 편물을 전체 공개해 보세요." />
      ) : (
        <FlatList
          key="grid"
          data={posts}
          keyExtractor={(p) => p.id}
          numColumns={3}
          refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={feed.refetch} tintColor={color.accent} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
          ListFooterComponent={feed.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={color.accent} /> : null}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/post/[id]', params: { id: item.id } })}
              style={styles.cell}
            >
              {urls.get(item.photo_path) ? (
                <Image source={{ uri: urls.get(item.photo_path) }} contentFit="cover" style={StyleSheet.absoluteFill} />
              ) : null}
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.md, gap: space.md },
  title: { fontSize: fontSize.title, fontWeight: fontWeight.semibold, color: color.text, letterSpacing: -0.5 },
  sorts: { flexDirection: 'row', gap: space.sm },
  sort: {
    minHeight: 36, justifyContent: 'center', paddingHorizontal: space.md,
    borderRadius: radius.button, borderWidth: size.hairline, borderColor: color.border,
  },
  sortOn: { borderColor: color.accent, backgroundColor: color.surface },
  sortText: { fontSize: fontSize.caption, color: color.textMuted },
  sortTextOn: { color: color.accent, fontWeight: fontWeight.semibold },
  cell: { flex: 1 / 3, aspectRatio: 1, backgroundColor: color.border, margin: 1 },
  footer: { paddingVertical: space.xl },
  sectionHead: {
    paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.xs,
    fontSize: fontSize.caption, color: color.textMuted, fontWeight: fontWeight.semibold,
  },
  hitThumb: { width: 40, height: 40, borderRadius: radius.photo, backgroundColor: color.surface },
  hitThumbEmpty: { borderWidth: size.hairline, borderColor: color.border },
  noResult: { padding: space.xl, fontSize: fontSize.caption, color: color.textMuted, textAlign: 'center' },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, paddingVertical: space.md },
  avatar: {
    width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.surface,
    borderWidth: size.hairline, borderColor: color.border, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: color.textMuted },
  personText: { flex: 1, gap: 2 },
  personName: { fontSize: fontSize.body, color: color.text, fontWeight: fontWeight.semibold },
  personHandle: { fontSize: fontSize.caption, color: color.textMuted },
});
