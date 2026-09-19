import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/store';
import { confirmDeletePost } from '@/features/capture/confirmDeletePost';
import { useDeletePost } from '@/features/capture/queries';
import {
  useAddComment,
  useComments,
  useDeleteComment,
  useMyLikes,
  usePost,
  useToggleLike,
} from '@/features/social/queries';
import { ReportSheet } from '@/features/social/ReportSheet';
import { showAlert } from '@/shared/lib/dialog';
import { relativeTime } from '@/shared/lib/relativeTime';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useContentWidth } from '@/shared/ui/layout';
import { color, fontSize, fontWeight, radius, size, space } from '@/shared/ui/tokens';
import { VideoBadge } from '@/shared/ui/VideoBadge';
import { VideoPlayer } from '@/shared/ui/VideoPlayer';

/** 게시물 상세 + 댓글 */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const width = useContentWidth();
  const me = useAuth((s) => s.session?.user.id);
  const post = usePost(id);
  const comments = useComments(id);
  const likes = useMyLikes(`post-${id}`, [id]);
  const toggleLike = useToggleLike();
  const addComment = useAddComment(id);
  const delComment = useDeleteComment(id);
  const delPost = useDeletePost();
  const [body, setBody] = useState('');
  const [reportTarget, setReportTarget] = useState<{ kind: 'post' | 'comment'; id: string; author: string } | null>(null);

  if (post.isError) {
    return (
      <SafeAreaView style={styles.root}>
        <EmptyState title="게시물을 볼 수 없어요" description="삭제되었거나 볼 권한이 없습니다." actionLabel="뒤로" onAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  const p = post.data?.post;
  const liked = likes.data?.has(id) ?? false;
  const isMine = p?.owner_id === me;

  const openMyMenu = () => {
    if (!p) return;
    const kind = p.media_type === 'video' ? '영상' : '사진';
    showAlert(p.projects.name, undefined, [
      {
        text: `이 ${kind} 지우기`,
        style: 'destructive',
        onPress: () =>
          confirmDeletePost(kind, () =>
            delPost.mutate(p.id, {
              onSuccess: () => router.back(),
              onError: (e) => showAlert('지우지 못했어요', e instanceof Error ? e.message : String(e)),
            }),
          ),
      },
      { text: '취소', style: 'cancel' },
    ]);
  };

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    addComment.mutate(text, {
      onSuccess: () => setBody(''),
      onError: (e) => showAlert('댓글을 달지 못했어요', e instanceof Error ? e.message : String(e)),
    });
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.fill}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.tap}>
            <View style={styles.chevron} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>{p?.projects.name ?? ''}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isMine ? '더 보기' : '신고'}
            disabled={!p}
            onPress={() => {
              if (!p) return;
              if (isMine) openMyMenu();
              else setReportTarget({ kind: 'post', id: p.id, author: p.owner_id });
            }}
            style={styles.tap}
          >
            <Text style={styles.more}>⋯</Text>
          </Pressable>
        </View>

        <FlatList
          data={comments.data ?? []}
          keyExtractor={(c) => c.id}
          ListHeaderComponent={
            <View>
              <View style={[styles.photo, { width, height: width }]}>
                {post.data?.videoUrl ? (
                  <VideoPlayer key={post.data.videoUrl} uri={post.data.videoUrl} poster={post.data.url ?? undefined} label="영상 기록" />
                ) : post.data?.url ? (
                  <Image source={{ uri: post.data.url }} contentFit="cover" style={StyleSheet.absoluteFill} />
                ) : null}
                {post.data?.videoUrl ? <VideoBadge durationMs={p?.duration_ms} /> : null}
              </View>
              <View style={styles.meta}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => p && router.push({ pathname: '/user/[username]', params: { username: p.profiles.username } })}
                >
                  <Text style={styles.author}>{p?.profiles.display_name ?? ''}</Text>
                </Pressable>
                <Text style={styles.time}>{p ? relativeTime(p.created_at) : ''}</Text>
              </View>
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={liked ? '좋아요 취소' : '좋아요'}
                  onPress={() => toggleLike.mutate({ postId: id, liked })}
                  style={styles.action}
                >
                  <View style={[styles.heart, liked && styles.heartOn]} />
                  <Text style={[styles.count, liked && styles.countOn]}>{p?.like_count ?? 0}</Text>
                </Pressable>
                <Text style={styles.count}>댓글 {p?.comment_count ?? 0}</Text>
              </View>
            </View>
          }
          ListEmptyComponent={comments.isPending ? null : <Text style={styles.noComments}>첫 댓글을 남겨 보세요</Text>}
          renderItem={({ item }) => {
            const mine = item.author_id === me || isMine;
            return (
              <View style={styles.comment}>
                <View style={styles.commentBody}>
                  <Text style={styles.commentAuthor}>
                    {item.profiles.display_name} <Text style={styles.time}>{relativeTime(item.created_at)}</Text>
                  </Text>
                  <Text style={styles.commentText}>{item.body}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={mine ? '삭제' : '신고'}
                  onPress={() =>
                    mine
                      ? showAlert('댓글을 삭제할까요?', '', [
                          { text: '취소', style: 'cancel' },
                          { text: '삭제', style: 'destructive', onPress: () => delComment.mutate(item.id) },
                        ])
                      : setReportTarget({ kind: 'comment', id: item.id, author: item.author_id })
                  }
                  style={styles.commentAction}
                >
                  <Text style={styles.commentActionText}>{mine ? '삭제' : '신고'}</Text>
                </Pressable>
              </View>
            );
          }}
        />

        <View style={styles.composer}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="댓글 달기"
            placeholderTextColor={color.textMuted}
            maxLength={300}
            style={styles.input}
            returnKeyType="send"
            onSubmitEditing={submit}
          />
          <Button label="등록" disabled={!body.trim() || addComment.isPending} onPress={submit} />
        </View>
      </View>

      <ReportSheet
        visible={!!reportTarget}
        target={reportTarget?.kind ?? 'post'}
        targetId={reportTarget?.id ?? ''}
        authorId={reportTarget?.author}
        onClose={() => setReportTarget(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md },
  tap: { width: size.tap, height: size.tap, alignItems: 'center', justifyContent: 'center' },
  chevron: {
    width: 12, height: 12, borderLeftWidth: 2, borderBottomWidth: 2,
    borderColor: color.text, transform: [{ rotate: '45deg' }], marginLeft: 4,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: fontSize.label, fontWeight: fontWeight.semibold, color: color.text },
  more: { fontSize: fontSize.heading, color: color.textMuted },
  photo: { backgroundColor: color.border },
  meta: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, paddingHorizontal: space.xl, paddingTop: space.md },
  author: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: color.text },
  time: { fontSize: fontSize.caption, color: color.textMuted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.xl, paddingHorizontal: space.xl, paddingVertical: space.sm },
  action: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: size.tap },
  heart: { width: 16, height: 16, borderRadius: radius.pill, borderWidth: 2, borderColor: color.textMuted },
  heartOn: { backgroundColor: color.accent, borderColor: color.accent },
  count: { fontSize: fontSize.caption, color: color.textMuted, fontVariant: ['tabular-nums'] },
  countOn: { color: color.accent, fontWeight: fontWeight.semibold },
  noComments: { padding: space.xl, fontSize: fontSize.caption, color: color.textMuted, textAlign: 'center' },
  comment: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.xl, paddingVertical: space.md },
  commentBody: { flex: 1, gap: space.xs },
  commentAuthor: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold, color: color.text },
  commentText: { fontSize: fontSize.label, color: color.text, lineHeight: fontSize.label * 1.5 },
  commentAction: { minHeight: size.tap, justifyContent: 'center' },
  commentActionText: { fontSize: fontSize.caption, color: color.textMuted },
  composer: {
    flexDirection: 'row', gap: space.sm, alignItems: 'center',
    paddingHorizontal: space.xl, paddingVertical: space.md,
    borderTopWidth: size.hairline, borderColor: color.border, backgroundColor: color.surface,
  },
  input: {
    flex: 1, height: size.inputHeight, borderWidth: size.hairline, borderColor: color.border,
    borderRadius: radius.button, backgroundColor: color.bg, paddingHorizontal: space.md,
    fontSize: fontSize.body, color: color.text,
  },
});
