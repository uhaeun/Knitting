import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/store';
import { flattenFeed, useFollowCounts, useUserPosts } from '@/features/social/queries';
import { ProfileHeader } from '@/features/social/ProfileHeader';
import { useSync } from '@/features/sync/store';
import { supabaseConfigured } from '@/shared/lib/supabase';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { color, fontSize, fontWeight, size, space } from '@/shared/ui/tokens';

/** 내 프로필. 로그인 안 했으면 로그인 유도. */
export default function MeScreen() {
  const router = useRouter();
  const { session, profile, setLocalOnly } = useAuth();
  const sync = useSync();
  const posts = useUserPosts(session?.user.id);
  const { posts: items, urls } = useMemo(() => flattenFeed(posts.data), [posts.data]);
  const counts = useFollowCounts(session?.user.id);

  if (!session || !profile) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <EmptyState
          title={supabaseConfigured ? '로그인하면 더 할 수 있어요' : '서버 설정이 아직 없어요'}
          description={
            supabaseConfigured
              ? '기기가 바뀌어도 편물이 따라오고, 다른 사람의 편물도 볼 수 있어요.'
              : '.env에 EXPO_PUBLIC_SUPABASE_URL과 ANON_KEY를 넣으면 계정과 피드가 켜집니다.'
          }
          actionLabel={supabaseConfigured ? '로그인' : undefined}
          onAction={
            supabaseConfigured
              ? () => {
                  setLocalOnly(false);
                  router.replace('/(auth)/sign-in');
                }
              : undefined
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        numColumns={3}
        ListHeaderComponent={
          <>
            <View style={styles.bar}>
              <Text style={styles.title}>나</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/settings')} style={styles.gear}>
                <Text style={styles.gearText}>설정</Text>
              </Pressable>
            </View>
            <ProfileHeader profile={profile} counts={counts.data} postCount={items.length} />
            <View style={styles.syncRow}>
              <Text style={styles.syncText}>
                {sync.status === 'syncing'
                  ? '동기화 중…'
                  : sync.pending > 0
                    ? `서버에 올릴 것 ${sync.pending}개`
                    : sync.status === 'error'
                      ? `동기화 실패: ${sync.message ?? ''}`
                      : '서버와 같음'}
              </Text>
              <Button
                label="지금 동기화"
                variant="secondary"
                disabled={sync.status === 'syncing'}
                onPress={() => void sync.run(session.user.id)}
              />
            </View>
          </>
        }
        ListEmptyComponent={
          posts.isPending ? null : (
            <Text style={styles.empty}>아직 올린 사진이 없어요</Text>
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
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.sm,
  },
  title: { fontSize: fontSize.title, fontWeight: fontWeight.semibold, color: color.text, letterSpacing: -0.5 },
  gear: { minHeight: size.tap, justifyContent: 'center', paddingHorizontal: space.sm },
  gearText: { fontSize: fontSize.caption, color: color.textMuted },
  syncRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    paddingHorizontal: space.xl, paddingBottom: space.lg,
  },
  syncText: { flex: 1, fontSize: fontSize.caption, color: color.textMuted },
  cell: { flex: 1 / 3, aspectRatio: 1, backgroundColor: color.border, margin: 1 },
  empty: { padding: space.xl, fontSize: fontSize.caption, color: color.textMuted, textAlign: 'center' },
});
