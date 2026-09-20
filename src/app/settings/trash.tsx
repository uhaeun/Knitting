import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useRestoreTrash, useTrash } from '@/features/project/queries';
import { relativeTime } from '@/shared/lib/relativeTime';
import { showAlert } from '@/shared/lib/dialog';
import { EmptyState } from '@/shared/ui/EmptyState';
import { color, fontSize, fontWeight, radius, size, space } from '@/shared/ui/tokens';

/** 휴지통: 지운 편물·기록을 되돌린다. 파일은 서버에 남아 있어서 그대로 살아난다. */
export default function TrashScreen() {
  const router = useRouter();
  const trash = useTrash();
  const restore = useRestoreTrash();
  const items = trash.data ?? [];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.tap}>
          <View style={styles.chevron} />
        </Pressable>
        <Text style={styles.barTitle}>휴지통</Text>
        <View style={styles.tap} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => `${i.kind}-${i.id}`}
        contentContainerStyle={items.length === 0 ? styles.emptyBox : undefined}
        ListHeaderComponent={
          items.length > 0 ? <Text style={styles.hint}>되돌리면 원래 자리로 돌아가요.</Text> : null
        }
        ListEmptyComponent={
          trash.isPending ? null : (
            <EmptyState title="휴지통이 비어 있어요" description="지운 편물과 기록이 여기에 모입니다." />
          )
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            {item.thumbUrl ? (
              <Image source={{ uri: item.thumbUrl }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]}>
                <Text style={styles.thumbText}>편물</Text>
              </View>
            )}
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {item.subtitle} · {relativeTime(item.deletedAt)} 지움
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.title} 되돌리기`}
              disabled={restore.isPending}
              onPress={() =>
                restore.mutate(item, {
                  onError: (e) => showAlert('되돌리지 못했어요', e instanceof Error ? e.message : String(e)),
                })
              }
              style={({ pressed }) => [styles.restore, pressed && styles.restorePressed]}
            >
              <Text style={styles.restoreText}>되돌리기</Text>
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
  hint: { paddingHorizontal: space.xl, paddingVertical: space.md, fontSize: fontSize.caption, color: color.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, paddingVertical: space.sm },
  thumb: { width: 48, height: 48, borderRadius: radius.photo, backgroundColor: color.surface },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: size.hairline, borderColor: color.border },
  thumbText: { fontSize: fontSize.caption, color: color.textMuted },
  text: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.body, color: color.text },
  meta: { fontSize: fontSize.caption, color: color.textMuted },
  restore: {
    paddingHorizontal: space.md, height: 36, borderRadius: radius.button,
    borderWidth: size.hairline, borderColor: color.border, alignItems: 'center', justifyContent: 'center',
  },
  restorePressed: { backgroundColor: color.accentSoft },
  restoreText: { fontSize: fontSize.caption, color: color.text },
});
