import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePendingRequests, useRespondRequest } from '@/features/social/queries';
import { EmptyState } from '@/shared/ui/EmptyState';
import { color, fontSize, fontWeight, radius, size, space } from '@/shared/ui/tokens';

/** 비공개 계정에 온 팔로우 요청 승인·거절 */
export default function RequestsScreen() {
  const router = useRouter();
  const requests = usePendingRequests();
  const respond = useRespondRequest();

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.tap}>
          <View style={styles.chevron} />
        </Pressable>
        <Text style={styles.barTitle}>팔로우 요청</Text>
        <View style={styles.tap} />
      </View>

      <FlatList
        data={requests.data ?? []}
        keyExtractor={(r) => r.follower_id}
        contentContainerStyle={(requests.data?.length ?? 0) === 0 ? styles.emptyBox : undefined}
        ListEmptyComponent={
          requests.isPending ? null : <EmptyState title="새 요청이 없어요" description="비공개 계정일 때 여기로 요청이 옵니다." />
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/user/[username]', params: { username: item.profiles.username } })}
              style={styles.person}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.profiles.display_name.slice(0, 1)}</Text>
              </View>
              <View style={styles.text}>
                <Text style={styles.name}>{item.profiles.display_name}</Text>
                <Text style={styles.handle}>@{item.profiles.username}</Text>
              </View>
            </Pressable>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={respond.isPending}
                onPress={() => respond.mutate({ followerId: item.follower_id, approve: true })}
                style={styles.approve}
              >
                <Text style={styles.approveText}>승인</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={respond.isPending}
                onPress={() => respond.mutate({ followerId: item.follower_id, approve: false })}
                style={styles.reject}
              >
                <Text style={styles.rejectText}>거절</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
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
  emptyBox: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, paddingVertical: space.md },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: {
    width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.surface,
    borderWidth: size.hairline, borderColor: color.border, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: color.textMuted },
  text: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.body, color: color.text },
  handle: { fontSize: fontSize.caption, color: color.textMuted },
  actions: { flexDirection: 'row', gap: space.sm },
  approve: {
    minHeight: 36, justifyContent: 'center', paddingHorizontal: space.md,
    borderRadius: radius.button, backgroundColor: color.accent,
  },
  approveText: { fontSize: fontSize.caption, color: color.onDark, fontWeight: fontWeight.semibold },
  reject: {
    minHeight: 36, justifyContent: 'center', paddingHorizontal: space.md,
    borderRadius: radius.button, borderWidth: size.hairline, borderColor: color.border,
  },
  rejectText: { fontSize: fontSize.caption, color: color.textMuted },
});
