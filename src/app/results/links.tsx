import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLinkRisks } from '@/features/media/linkRiskQueries';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Button } from '@/shared/ui/Button';
import { color, space, fontSize } from '@/shared/ui/tokens';
/** Text-only security evidence. Never displays or signs a deleted media object. */
export default function LinkRisksScreen() {
  const q = useLinkRisks();
  const router = useRouter();
  return <SafeAreaView style={styles.root}>
    <Button label="뒤로" variant="secondary" onPress={() => router.back()} />
    <Text style={styles.title}>링크 차단 문제 관리</Text>
    <Text style={styles.text}>과거 링크는 아직 열릴 수 있어요. 현재 차단 재시도 기능을 사용할 수 없습니다. 다시 확인은 차단 완료를 뜻하지 않아요.</Text>
    <Button label="다시 확인" variant="secondary" disabled={q.isFetching} onPress={() => void q.recheck()} />
    {q.isError ? <EmptyState title="확인 불가" description="현재 위험 건수를 확인하지 못했어요. 0건으로 판정하지 않습니다." /> :
      <FlatList data={q.data ?? []} keyExtractor={(r) => r.id}
        ListEmptyComponent={q.isPending ? null : <Text style={styles.text}>미해결 과거 링크 위험이 없어요.</Text>}
        renderItem={({ item }) => <View style={styles.row}>
          <Text style={styles.title}>{item.title}</Text><Text>{item.kind === 'growth' ? '성장 영상' : '발행 결과물'} · 차단 검증 미완료</Text>
          <Text>{item.deleted_at ? `삭제 시각: ${new Date(item.deleted_at).toLocaleString()}` : '현재 발행물의 과거 링크'}</Text>
        </View>} />}
  </SafeAreaView>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: color.bg, padding: space.lg, gap: space.md }, title: { fontSize: fontSize.label, color: color.text }, text: { color: color.textMuted, fontSize: fontSize.caption }, row: { paddingVertical: space.lg, gap: space.sm } });
