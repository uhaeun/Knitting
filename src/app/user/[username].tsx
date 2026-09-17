import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/store';
import {
  flattenFeed,
  useFollowCounts,
  useFollowState,
  useProfile,
  useToggleBlock,
  useToggleFollow,
  useUserPosts,
} from '@/features/social/queries';
import { ProfileHeader } from '@/features/social/ProfileHeader';
import { ReportSheet } from '@/features/social/ReportSheet';
import { showAlert } from '@/shared/lib/dialog';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { color, fontSize, fontWeight, size, space } from '@/shared/ui/tokens';
import { VideoBadge } from '@/shared/ui/VideoBadge';

/** 타 사용자 프로필. 비공개 계정이면 승인 전까지 사진이 안 보인다 (RLS가 판정). */
export default function UserScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const me = useAuth((s) => s.session?.user.id);
  const profile = useProfile(username);
  const user = profile.data;
  const posts = useUserPosts(user?.id);
  const { posts: items, urls } = useMemo(() => flattenFeed(posts.data), [posts.data]);
  const counts = useFollowCounts(user?.id);
  const followState = useFollowState(user?.id);
  const toggleFollow = useToggleFollow(user?.id ?? '');
  const blockUser = useToggleBlock();
  const [reporting, setReporting] = useState(false);

  if (profile.isSuccess && !user) {
    return (
      <SafeAreaView style={styles.root}>
        <EmptyState title="없는 사용자예요" description="아이디를 다시 확인해 주세요." actionLabel="뒤로" onAction={() => router.back()} />
      </SafeAreaView>
    );
  }
  if (!user) return <SafeAreaView style={styles.root} />;

  const isMe = user.id === me;
  const status = followState.data;
  const followLabel = status === 'accepted' ? '팔로잉' : status === 'pending' ? '요청됨' : '팔로우';

  const confirmBlock = () => {
    showAlert(`${user.display_name} 님을 차단할까요?`, '서로의 게시물이 보이지 않고 팔로우가 해제됩니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '차단',
        style: 'destructive',
        onPress: () =>
          blockUser.mutate({ userId: user.id, blocked: false }, { onSuccess: () => router.back() }),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        numColumns={3}
        ListHeaderComponent={
          <>
            <View style={styles.bar}>
              <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.tap}>
                <View style={styles.chevron} />
              </Pressable>
              <Text style={styles.barTitle} numberOfLines={1}>@{user.username}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="더 보기"
                disabled={isMe}
                onPress={() =>
                  showAlert('', user.display_name, [
                    { text: '신고하기', onPress: () => setReporting(true) },
                    { text: '차단하기', style: 'destructive', onPress: confirmBlock },
                    { text: '취소', style: 'cancel' },
                  ])
                }
                style={styles.tap}
              >
                <Text style={[styles.more, isMe && styles.hidden]}>⋯</Text>
              </Pressable>
            </View>
            <ProfileHeader
              profile={user}
              counts={counts.data}
              postCount={items.length}
              right={
                isMe ? null : (
                  <Button
                    label={followLabel}
                    variant={status ? 'secondary' : 'primary'}
                    disabled={toggleFollow.isPending}
                    onPress={() => toggleFollow.mutate(status === 'accepted' || status === 'pending')}
                  />
                )
              }
            />
          </>
        }
        ListEmptyComponent={
          posts.isPending ? null : (
            <Text style={styles.empty}>
              {user.is_private && status !== 'accepted' && !isMe
                ? '비공개 계정이에요. 팔로우가 승인되면 사진이 보입니다.'
                : '아직 올린 사진이 없어요'}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/post/[id]', params: { id: item.id } })}
            style={styles.cell}
          >
            {urls.get(item.thumb_path) ? (
              <Image source={{ uri: urls.get(item.thumb_path) }} contentFit="cover" style={StyleSheet.absoluteFill} />
            ) : null}
            {item.media_type === 'video' ? <VideoBadge /> : null}
          </Pressable>
        )}
      />
      <ReportSheet visible={reporting} target="profile" targetId={user.id} authorId={user.id} onClose={() => setReporting(false)} />
    </SafeAreaView>
  );
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
  more: { fontSize: fontSize.heading, color: color.textMuted },
  hidden: { opacity: 0 },
  cell: { flex: 1 / 3, aspectRatio: 1, backgroundColor: color.border, margin: 1 },
  empty: { padding: space.xl, fontSize: fontSize.caption, color: color.textMuted, textAlign: 'center', lineHeight: fontSize.caption * 1.6 },
});
