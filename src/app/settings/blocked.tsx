import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useBlocked, useToggleBlock } from '@/features/social/queries';
import { Avatar } from '@/shared/ui/Avatar';
import { EmptyState } from '@/shared/ui/EmptyState';
import { color, fontSize, fontWeight, radius, size, space } from '@/shared/ui/tokens';

export default function BlockedScreen() {
  const router = useRouter();
  const blocked = useBlocked();
  const toggle = useToggleBlock();

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.tap}>
          <View style={styles.chevron} />
        </Pressable>
        <Text style={styles.barTitle}>차단한 사람</Text>
        <View style={styles.tap} />
      </View>

      <FlatList
        data={blocked.data ?? []}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={
          blocked.isPending ? null : (
            <EmptyState title="차단한 사람이 없어요" description="게시물의 ⋯ 메뉴에서 차단할 수 있어요." />
          )
        }
        contentContainerStyle={(blocked.data?.length ?? 0) === 0 ? styles.emptyBox : undefined}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Avatar path={item.avatar_path} name={item.display_name} size={40} />
            <View style={styles.text}>
              <Text style={styles.name}>{item.display_name}</Text>
              <Text style={styles.handle}>@{item.username}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={toggle.isPending}
              onPress={() => toggle.mutate({ userId: item.id, blocked: true })}
              style={styles.unblock}
            >
              <Text style={styles.unblockText}>차단 해제</Text>
            </Pressable>
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
  avatar: {
    width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.surface,
    borderWidth: size.hairline, borderColor: color.border, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: color.textMuted },
  text: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.body, color: color.text },
  handle: { fontSize: fontSize.caption, color: color.textMuted },
  unblock: { minHeight: size.tap, justifyContent: 'center', paddingHorizontal: space.md },
  unblockText: { fontSize: fontSize.caption, color: color.accent, fontWeight: fontWeight.semibold },
});
