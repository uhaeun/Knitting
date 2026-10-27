import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLinkRisks, useRetryLegacyLink } from '@/features/media/linkRiskQueries';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Button } from '@/shared/ui/Button';
import { showAlert } from '@/shared/lib/dialog';
import { color, space, fontSize } from '@/shared/ui/tokens';
/** Text-only security evidence. Never displays or signs a deleted media object. */
export default function LinkRisksScreen() {
  const q = useLinkRisks();
  const router = useRouter();
  const retry = useRetryLegacyLink();
  return <SafeAreaView style={styles.root}>
    <Button label="뒤로" variant="secondary" onPress={() => router.back()} />
    <Text style={styles.title}>링크 차단 문제 관리</Text>
    <Button label="삭제 결과물 정리 상태" variant="secondary" onPress={() => router.push('/results/cleanup')} />
    <Text style={styles.text}>나만 설정과 과거 링크 차단은 별도예요. CDN 전파 중에는 과거 링크가 열릴 수 있어요. 이미 내려받은 파일·스크린샷·기기 캐시는 회수할 수 없습니다.</Text>
    <Button label="다시 확인" variant="secondary" disabled={q.isFetching} onPress={() => void q.recheck()} />
    {q.isError ? <EmptyState title="확인 불가" description="현재 위험 건수를 확인하지 못했어요. 0건으로 판정하지 않습니다." /> :
      <FlatList data={q.data ?? []} keyExtractor={(r) => r.id}
        ListEmptyComponent={q.isPending ? null : <Text style={styles.text}>미해결 과거 링크 위험이 없어요.</Text>}
        renderItem={({ item }) => <View testID={`link-risk-${item.id}`} style={styles.row}>
          <Text style={styles.title}>{item.title}</Text><Text>{item.kind === 'growth' ? '성장 영상 MP4' : item.output === 'mp4' ? '합성 영상 MP4' : '결과 사진 JPEG'} · {['failed', 'failed_exhausted'].includes(item.status) ? '조치 필요' : '처리 중'}</Text>
          <Text>{item.status === 'failed_exhausted' ? '추가 자동 5회를 모두 사용했어요. 수동으로 다시 시도할 수 있어요.' : item.status === 'retrying' ? '회수 작업을 처리하고 있어요.' : item.status === 'unverified' ? '접근 차단 검증 미완료' : item.status === 'failed' ? '링크 차단에 실패했어요.' : '회수 작업 대기 중'}</Text>
          <Text>구경로 차단 {item.origin_blocked}/2 · CDN 확인 {item.cdn_verified}/2</Text>
          {item.objects.map((o) => <Text key={o.asset}>{o.asset === 'file' ? '원본' : '대표 이미지'}: {o.cdn_verified ? 'CDN 접근 차단 확인' : o.origin_blocked ? '구경로 차단 · CDN 미확인' : '차단 미완료'}</Text>)}
          <Text>자동 시도 {item.auto_attempts}/6 · 수동 시도 {item.manual_attempts}회</Text>
          {item.next_attempt_at ? <Text>다음 자동 시도: {new Date(item.next_attempt_at).toLocaleString()}</Text> : null}
          <Button label="링크 차단 다시 시도" variant="secondary" disabled={retry.isPending || item.status === 'retrying'} onPress={() => retry.mutate(item.id, {
            onSuccess: () => showAlert('재시도를 요청했어요', '서버가 순서대로 처리합니다. 실제 접근 차단이 확인될 때까지 경고는 유지해요.'),
            onError: (e) => showAlert('요청하지 못했어요', e.message),
          })} />
          <Text>{item.deleted_at ? `삭제 시각: ${new Date(item.deleted_at).toLocaleString()}` : '현재 발행물의 과거 링크'}</Text>
        </View>} />}
  </SafeAreaView>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: color.bg, padding: space.lg, gap: space.md }, title: { fontSize: fontSize.label, color: color.text }, text: { color: color.textMuted, fontSize: fontSize.caption }, row: { paddingVertical: space.lg, gap: space.sm } });
