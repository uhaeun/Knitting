import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { relativeTime } from '@/shared/lib/relativeTime';
import type { FeedPost } from '@/shared/types/remote';
import { Avatar } from '@/shared/ui/Avatar';
import { color, fontSize, fontWeight, radius, size, space } from '@/shared/ui/tokens';
import { VideoBadge } from '@/shared/ui/VideoBadge';

type Props = {
  post: FeedPost;
  photoUrl: string | undefined;
  liked: boolean;
  onToggleLike: () => void;
  onMore: () => void;
};

/** 피드 카드 하나. 사진이 주인공이라 UI는 최소. */
export function PostCard({ post, photoUrl, liked, onToggleLike, onMore }: Props) {
  const router = useRouter();
  const author = post.profiles;
  const openPost = () => router.push({ pathname: '/post/[id]', params: { id: post.id } });
  const openUser = () => router.push({ pathname: '/user/[username]', params: { username: author.username } });

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" onPress={openUser} style={styles.author}>
          <Avatar path={author.avatar_path} name={author.display_name} size={36} />
          <View style={styles.authorText}>
            <Text style={styles.name} numberOfLines={1}>{author.display_name}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {post.projects.name} · {relativeTime(post.created_at)}
            </Text>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="더 보기" onPress={onMore} style={styles.more}>
          <Text style={styles.moreText}>⋯</Text>
        </Pressable>
      </View>

      <Pressable accessibilityRole="button" onPress={openPost}>
        <View style={styles.photo}>
          {photoUrl ? <Image source={{ uri: photoUrl }} contentFit="cover" style={StyleSheet.absoluteFill} /> : null}
          {post.media_type === 'video' ? <VideoBadge /> : null}
        </View>
      </Pressable>

      {post.caption ? (
        <Text style={styles.caption} numberOfLines={2}>{post.caption}</Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={liked ? '좋아요 취소' : '좋아요'}
          accessibilityState={{ selected: liked }}
          onPress={onToggleLike}
          style={styles.action}
        >
          <View style={[styles.heart, liked && styles.heartOn]} />
          <Text style={[styles.count, liked && styles.countOn]}>{post.like_count}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="댓글" onPress={openPost} style={styles.action}>
          <View style={styles.bubble} />
          <Text style={styles.count}>{post.comment_count}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.surface, borderBottomWidth: size.hairline, borderColor: color.border },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md },
  author: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: size.tap },
  avatar: {
    width: 36, height: 36, borderRadius: radius.pill, backgroundColor: color.bg,
    borderWidth: size.hairline, borderColor: color.border, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: fontSize.label, fontWeight: fontWeight.semibold, color: color.textMuted },
  authorText: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.label, fontWeight: fontWeight.semibold, color: color.text },
  meta: { fontSize: fontSize.caption, color: color.textMuted },
  more: { width: size.tap, height: size.tap, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: fontSize.heading, color: color.textMuted },
  photo: { width: '100%', aspectRatio: 1, backgroundColor: color.border },
  caption: { paddingHorizontal: space.md, paddingTop: space.sm, fontSize: fontSize.label, color: color.text, lineHeight: fontSize.label * 1.6 },
  actions: { flexDirection: 'row', paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.xl },
  action: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: size.tap },
  heart: {
    width: 16, height: 16, borderRadius: radius.pill,
    borderWidth: 2, borderColor: color.textMuted,
  },
  heartOn: { backgroundColor: color.accent, borderColor: color.accent },
  bubble: {
    width: 16, height: 14, borderRadius: 4,
    borderWidth: 2, borderColor: color.textMuted,
  },
  count: { fontSize: fontSize.caption, color: color.textMuted, fontVariant: ['tabular-nums'] },
  countOn: { color: color.accent, fontWeight: fontWeight.semibold },
});
