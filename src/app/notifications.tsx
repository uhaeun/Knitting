import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMarkNotificationsRead, useNotifications } from '@/features/social/queries';
import type { AppNotification } from '@/features/social/api';
import { relativeTime } from '@/shared/lib/relativeTime';
import { Avatar } from '@/shared/ui/Avatar';
import { EmptyState } from '@/shared/ui/EmptyState';
import { color, fontSize, fontWeight, radius, size, space } from '@/shared/ui/tokens';

/** 소식: 내 기록에 달린 좋아요·댓글과 팔로우. 열면 모두 읽음으로 바뀐다. */
export default function NotificationsScreen() {
  const router = useRouter();
  const list = useNotifications();
  const markRead = useMarkNotificationsRead();
  const items = list.data ?? [];
  const hasUnread = items.some((n) => !n.readAt);

  // 화면을 열면 읽음 처리 (배지를 지운다)
  useEffect(() => {
    if (hasUnread && !markRead.isPending) markRead.mutate();
    // markRead는 매 렌더 새로 만들어져 의존성에 넣지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnread]);

  const open = (n: AppNotification) => {
    if (n.kind === 'follow_request') return router.push('/settings/requests');
    if (n.postId) return router.push({ pathname: '/post/[id]', params: { id: n.postId } });
    return router.push({ pathname: '/user/[username]', params: { username: n.actor.username } });
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.tap}>
          <View style={styles.chevron} />
        </Pressable>
        <Text style={styles.barTitle}>소식</Text>
        <View style={styles.tap} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={items.length === 0 ? styles.emptyBox : undefined}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} tintColor={color.accent} />}
        ListEmptyComponent={
          list.isPending ? null : (
            <EmptyState title="아직 소식이 없어요" description="누가 내 기록에 좋아요나 댓글을 남기면 여기에 모여요." />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => open(item)}
            style={({ pressed }) => [styles.row, !item.readAt && styles.unread, pressed && styles.pressed]}
          >
            <Avatar path={item.actor.avatar_path} name={item.actor.display_name} size={40} />
            <View style={styles.text}>
              <Text style={styles.line} numberOfLines={2}>
                <Text style={styles.name}>{item.actor.display_name}</Text>
                {describe(item)}
              </Text>
              <Text style={styles.time}>{relativeTime(item.createdAt)}</Text>
            </View>
            {item.thumbUrl ? <Image source={{ uri: item.thumbUrl }} style={styles.thumb} contentFit="cover" /> : null}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function describe(n: AppNotification): string {
  switch (n.kind) {
    case 'like':
      return '님이 내 기록을 좋아해요';
    case 'comment':
      return n.commentBody ? `님이 댓글을 남겼어요: ${n.commentBody}` : '님이 댓글을 남겼어요';
    case 'follow':
      return '님이 나를 팔로우해요';
    case 'follow_request':
      return '님이 팔로우를 요청했어요';
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingTop: space.sm },
  tap: { width: size.tap, height: size.tap, alignItems: 'center', justifyContent: 'center' },
  chevron: {
    width: 12, height: 12, borderLeftWidth: 2, borderBottomWidth: 2,
    borderColor: color.text, transform: [{ rotate: '45deg' }], marginLeft: 4,
  },
  barTitle: { flex: 1, textAlign: 'center', fontSize: fontSize.label, fontWeight: fontWeight.semibold, color: color.text },
  emptyBox: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, paddingVertical: space.md },
  unread: { backgroundColor: color.accentSoft },
  pressed: { opacity: 0.8 },
  text: { flex: 1, gap: 2 },
  line: { fontSize: fontSize.label, color: color.text, lineHeight: fontSize.label * 1.5 },
  name: { fontWeight: fontWeight.semibold },
  time: { fontSize: fontSize.caption, color: color.textMuted },
  thumb: { width: 44, height: 44, borderRadius: radius.photo, backgroundColor: color.surface },
});
