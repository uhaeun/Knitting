import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinkRiskBanner } from '@/features/media/LinkRiskBanner';
import { useMyResults } from '@/features/media/resultsQueries';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Button } from '@/shared/ui/Button';
import { color, fontSize, space, radius } from '@/shared/ui/tokens';

export default function ResultsScreen() {
  const q = useMyResults();
  const router = useRouter();
  return <SafeAreaView style={styles.root}>
    <View style={styles.header}><Button label="뒤로" variant="secondary" onPress={() => router.back()} /><Text style={styles.title}>내 결과물</Text></View>
    {q.isError ? <EmptyState title="결과물을 불러오지 못했어요" description="연결을 확인하고 다시 시도해 주세요." actionLabel="다시 확인" onAction={() => void q.refetch()} /> :
      <FlatList ListHeaderComponent={<LinkRiskBanner />} data={q.data?.results ?? []} keyExtractor={(r) => r.id}
        ListEmptyComponent={q.isPending ? null : <EmptyState title="아직 발행한 결과물이 없어요" description="편물에서 결과 사진이나 성장 영상을 만든 뒤 피드에 올릴 수 있어요." />}
        renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/published/[id]', params: { id: item.id } })} style={styles.row}>
          <Image source={{ uri: q.data?.urls.get(item.thumb_path) }} style={styles.thumb} contentFit="cover" />
          <View style={styles.text}><Text style={styles.title}>{item.display_title_override ?? item.project_name_snapshot ?? '이전 결과물'}</Text>
            <Text>{item.kind === 'growth' ? '성장 영상' : item.output === 'mp4' ? '합성 영상' : '사진'} · {item.visibility === 'public' ? '전체' : item.visibility === 'followers' ? '팔로워' : '나만'}</Text>
            <Text>{new Date(item.created_at).toLocaleDateString()}</Text>
            {!item.projects || item.projects.deleted_at ? <Text>삭제된 편물</Text> : null}
          </View>
        </Pressable>} />}
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg }, header: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  title: { color: color.text, fontSize: fontSize.label }, row: { flexDirection: 'row', gap: space.md, padding: space.lg },
  thumb: { width: space.xl * 3, height: space.xl * 3, borderRadius: radius.photo }, text: { flex: 1, gap: space.xs },
});
