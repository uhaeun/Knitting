import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EditProfileSheet } from '@/features/auth/EditProfileSheet';
import { useAuth } from '@/features/auth/store';
import { flattenFeed, useFollowCounts, useUserPosts } from '@/features/social/queries';
import { ProfileHeader } from '@/features/social/ProfileHeader';
import { EmptyState } from '@/shared/ui/EmptyState';
import { GearButton } from '@/shared/ui/GearButton';
import { color, fontSize, fontWeight, size, space } from '@/shared/ui/tokens';
import { VideoBadge } from '@/shared/ui/VideoBadge';

/** 내 프로필. 로그인 안 했으면 로그인 유도. */
export default function MeScreen() {
  const [editOpen, setEditOpen] = useState(false);
  const router = useRouter();
  const { session, profile } = useAuth();
  const posts = useUserPosts(session?.user.id);
  const { posts: items, urls } = useMemo(() => flattenFeed(posts.data), [posts.data]);
  const counts = useFollowCounts(session?.user.id);

  if (!session || !profile) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <EmptyState
          title="로그인이 필요해요"
          description="로그인하면 내 편물과 다른 사람의 편물을 볼 수 있어요."
          actionLabel="로그인"
          onAction={() => router.replace('/(auth)/sign-in')}
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
              <GearButton />
            </View>
            <ProfileHeader profile={profile} counts={counts.data} postCount={items.length} />
            <Pressable accessibilityRole="button" onPress={() => setEditOpen(true)} style={({ pressed }) => [styles.edit, pressed && styles.editPressed]}>
              <Text style={styles.editText}>프로필 편집</Text>
            </Pressable>
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
            {item.media_type === 'video' ? <VideoBadge /> : null}
          </Pressable>
        )}
      />
      <EditProfileSheet visible={editOpen} onClose={() => setEditOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  edit: {
    marginHorizontal: space.xl, marginBottom: space.md, minHeight: 38, borderRadius: 10,
    borderWidth: size.hairline, borderColor: color.border, backgroundColor: color.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  editPressed: { borderColor: color.accent },
  editText: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold, color: color.text },
  root: { flex: 1, backgroundColor: color.bg },
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.sm,
  },
  title: { fontSize: fontSize.title, fontWeight: fontWeight.semibold, color: color.text, letterSpacing: -0.5 },
  cell: { flex: 1 / 3, aspectRatio: 1, backgroundColor: color.border, margin: 1 },
  empty: { padding: space.xl, fontSize: fontSize.caption, color: color.textMuted, textAlign: 'center' },
});
