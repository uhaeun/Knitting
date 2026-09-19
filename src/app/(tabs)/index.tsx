import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/store';
import { confirmDeletePost } from '@/features/capture/confirmDeletePost';
import { useDeletePost } from '@/features/capture/queries';
import { PostActionsSheet } from '@/features/social/PostActionsSheet';
import { PostCard } from '@/features/social/PostCard';
import { flattenFeed, useFollowingFeed, useMyLikes, usePendingRequests, useToggleLike } from '@/features/social/queries';
import { ReportSheet } from '@/features/social/ReportSheet';
import { showAlert } from '@/shared/lib/dialog';
import type { FeedPost } from '@/shared/types/remote';
import { EmptyState } from '@/shared/ui/EmptyState';
import { color, fontSize, fontWeight, radius, size, space } from '@/shared/ui/tokens';

/** 팔로잉 피드 */
export default function FeedScreen() {
  const router = useRouter();
  const session = useAuth((s) => s.session);
  const feed = useFollowingFeed();
  const { posts, urls } = useMemo(() => flattenFeed(feed.data), [feed.data]);
  const likes = useMyLikes('following', posts.map((p) => p.id));
  const toggleLike = useToggleLike();
  const delPost = useDeletePost();
  const requests = usePendingRequests();
  const [menuFor, setMenuFor] = useState<FeedPost | null>(null);
  const [reportFor, setReportFor] = useState<FeedPost | null>(null);

  const pending = requests.data?.length ?? 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>피드</Text>
        {pending > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/settings/requests')} style={styles.badge}>
            <Text style={styles.badgeText}>팔로우 요청 {pending}</Text>
          </Pressable>
        ) : null}
      </View>

      {feed.isError ? (
        <EmptyState title="피드를 불러오지 못했어요" description={String(feed.error)} />
      ) : posts.length === 0 && !feed.isPending ? (
        <EmptyState
          title="아직 볼 게 없어요"
          description="탐색 탭에서 다른 사람을 팔로우하면 여기에 그 사람의 편물이 쌓입니다."
          actionLabel="탐색 열기"
          onAction={() => router.push('/explore')}
        />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={feed.refetch} tintColor={color.accent} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
          ListFooterComponent={feed.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={color.accent} /> : null}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              photoUrl={urls.get(item.photo_path)}
              liked={likes.data?.has(item.id) ?? false}
              onToggleLike={() => toggleLike.mutate({ postId: item.id, liked: likes.data?.has(item.id) ?? false })}
              onMore={() => setMenuFor(item)}
            />
          )}
        />
      )}

      <PostActionsSheet
        post={menuFor}
        isMine={menuFor?.owner_id === session?.user.id}
        onClose={() => setMenuFor(null)}
        onReport={() => {
          setReportFor(menuFor);
          setMenuFor(null);
        }}
        onDelete={() => {
          const target = menuFor;
          if (!target) return;
          setMenuFor(null);
          confirmDeletePost(target.media_type === 'video' ? '영상' : '사진', () =>
            delPost.mutate(target.id, {
              onError: (e) => showAlert('지우지 못했어요', e instanceof Error ? e.message : String(e)),
            }),
          );
        }}
      />
      <ReportSheet
        visible={!!reportFor}
        target="post"
        targetId={reportFor?.id ?? ''}
        authorId={reportFor?.owner_id}
        onClose={() => setReportFor(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.md,
  },
  title: { fontSize: fontSize.title, fontWeight: fontWeight.semibold, color: color.text, letterSpacing: -0.5 },
  badge: {
    minHeight: size.tap, justifyContent: 'center', paddingHorizontal: space.md,
    borderRadius: radius.button, borderWidth: size.hairline, borderColor: color.accent,
  },
  badgeText: { fontSize: fontSize.caption, color: color.accent, fontWeight: fontWeight.semibold },
  footer: { paddingVertical: space.xl },
});
