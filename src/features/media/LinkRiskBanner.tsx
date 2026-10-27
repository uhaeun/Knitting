import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useLinkRisks } from './linkRiskQueries';
import { Button } from '@/shared/ui/Button';
import { color, space, fontSize, size } from '@/shared/ui/tokens';
export function LinkRiskBanner({ resultId }: { resultId?: string }) {
  const q = useLinkRisks();
  const router = useRouter();
  const count = q.data?.length;
  if (resultId && q.isSuccess && !q.data.some((r) => r.id === resultId)) return null;
  return <View style={styles.box}>
    <Text style={styles.text}>{q.isError ? '링크 차단 위험: 확인 불가' : count === undefined ? '링크 차단 위험을 확인하는 중이에요' : resultId ? '기존 공유 링크의 차단이 확인되지 않았어요' : `미해결 링크 위험 ${count}건`}</Text>
    {(count ?? 0) > 0 ? <Text style={styles.text}>과거에 발급된 주소는 아직 열릴 수 있어요. 새 접근 권한 변경과 과거 링크 회수는 별도예요.</Text> : null}
    <Button label="링크 차단 문제 관리" variant="secondary" onPress={() => router.push('/results/links')} />
    {q.isError ? <Button label="다시 확인" variant="secondary" onPress={() => void q.recheck()} /> : null}
  </View>;
}
const styles = StyleSheet.create({ box: { padding: space.md, gap: space.sm, borderWidth: size.hairline, borderColor: color.border }, text: { color: color.text, fontSize: fontSize.caption } });
