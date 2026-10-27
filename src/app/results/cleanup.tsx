import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOperatorAccess } from '@/features/operator/queries';
import { useResultCleanup } from '@/features/media/cleanupQueries';
import { Button } from '@/shared/ui/Button';
import { color, space, fontSize } from '@/shared/ui/tokens';
const status: Record<string, string> = { blocked: '확인 대기', pending: '정리 대기', processing: '정리 중', partial: '일부 정리 · 미완료', failed: '재시도 대기', failed_exhausted: '자동 재시도 소진 · 미완료', confirmed: '정리 확인' };
const reason: Record<string, string> = { RETENTION_UNKNOWN: '보존 필요 여부 확인 대기', RETENTION_HOLD: '보존 대상 · 정리 보류', LINKS_UNCONFIRMED: '과거 링크 차단 확인 대기', ACCOUNT_DELETION: '계정 탈퇴 절차에서 처리 중', REVIEW_CHANGED: '보존 검토 변경 · 재확인 대기', UNSAFE_PATH: '파일 경로 확인 필요', OWNER_MISMATCH: '소유권 확인 필요', VERSIONING_UNSUPPORTED: '저장소 버전 보존 확인 필요' };
/** No publication titles, thumbnail URLs or destructive controls in this view. */
export default function ResultCleanupScreen() {
  const operator = useOperatorAccess(); const q = useResultCleanup(); const router = useRouter();
  return <SafeAreaView style={styles.root}>
    <Button label="뒤로" variant="secondary" onPress={() => router.back()} />
    <Text style={styles.heading}>삭제 결과물 정리 상태</Text>
    {operator.data?.allowed ? <Button label="운영자 결과물 정리" variant="secondary" onPress={() => router.push('/operations')} /> : null}
    <Text style={styles.text}>결과물 삭제와 저장 파일 정리는 별도예요. 과거 링크 차단과 보존 검토를 통과한 뒤 제목과 파일을 정리합니다.</Text>
    <Text style={styles.text}>이 화면의 정리 확인은 서비스의 해당 제목·파일만 뜻해요. 백업이나 이미 내려받은 파일·기기 캐시까지 삭제됐다는 뜻은 아닙니다.</Text>
    <Button label="다시 확인" variant="secondary" disabled={q.isFetching} onPress={() => void q.refetch()} />
    {q.isError ? <Text style={styles.text}>현재 상태를 확인하지 못했어요. 정리 완료로 판정하지 않습니다.</Text> :
      <FlatList data={q.data ?? []} keyExtractor={(r) => r.result_id} ListEmptyComponent={q.isPending ? <Text>확인 중</Text> : <Text>삭제한 결과물이 없어요.</Text>}
        renderItem={({ item }) => <View testID={`cleanup-${item.result_id}`} style={styles.row}>
          <Text>{item.kind === 'growth' ? '성장 영상' : item.output === 'mp4' ? '합성 영상' : '결과 사진'} · {new Date(item.deleted_at).toLocaleString()}</Text>
          <Text>{status[item.status] ?? '상태 확인 필요'}</Text>
          {reason[item.reason] ? <Text>{reason[item.reason]}</Text> : null}
          <Text>제목: {status[item.title_status] ?? '상태 확인 필요'}</Text>
          {item.objects.map((o) => <View key={`${o.location}-${o.asset}`}>
            <Text>{o.location === 'rotated' ? '회수 후 파일' : '기존 파일'} · {o.asset === 'thumb' ? '대표 이미지' : '원본'}: {status[o.status] ?? '상태 확인 필요'}</Text>
            <Text>최초 포함 {o.auto_attempts}/6회 · 추가 {o.additional_attempts}/5회</Text>
            {o.next_attempt_at && o.auto_attempts > 0 ? <Text>다음 시도: {new Date(o.next_attempt_at).toLocaleString()}</Text> : null}
          </View>)}
        </View>} />}
  </SafeAreaView>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: color.bg, padding: space.lg, gap: space.md }, heading: { color: color.text, fontSize: fontSize.label }, text: { color: color.textMuted, fontSize: fontSize.caption }, row: { paddingVertical: space.lg, gap: space.sm } });
