import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinkRiskBanner } from '@/features/media/LinkRiskBanner';
import { useResult, useManageResult } from '@/features/media/resultsQueries';
import { useAuth } from '@/features/auth/store';
import { showAlert } from '@/shared/lib/dialog';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Field } from '@/shared/ui/Field';
import { VideoPlayer } from '@/shared/ui/VideoPlayer';
import { color, fontSize, space } from '@/shared/ui/tokens';
import type { Visibility } from '@/shared/types/models';

export default function PublishedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const q = useResult(id);
  const manage = useManageResult();
  const userId = useAuth((s) => s.session?.user.id);
  const [title, setTitle] = useState<string | null>(null);
  if (!q.data) return <EmptyState title={q.isError ? '결과물을 열 수 없어요' : '불러오는 중…'} description="권한이 없거나 삭제된 결과물일 수 있어요." actionLabel="뒤로" onAction={() => router.back()} />;
  const r = q.data.result;
  const own = r.owner_id === userId;
  const deletedProject = !r.projects || !!r.projects.deleted_at;
  const displayTitle = r.display_title_override ?? r.project_name_snapshot ?? '이전 결과물';
  const fail = (e: Error) => showAlert('변경하지 못했어요', e.message);
  const setVisibility = (visibility: Visibility) => {
    const save = () => manage.mutate({ action: 'visibility', id, visibility }, { onError: fail });
    if (visibility === 'public') showAlert('전체 공개로 바꿀까요?', '이 발행 결과물을 다른 사용자도 볼 수 있어요.', [
      { text: '취소', style: 'cancel' }, { text: '전체 공개', onPress: save },
    ]); else save();
  };
  return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.content}>
    <Button label="뒤로" variant="secondary" onPress={() => router.back()} />
    <Text style={styles.title}>{displayTitle}</Text>
    {own ? <LinkRiskBanner resultId={id} /> : null}
    {deletedProject ? <Text>삭제된 편물</Text> : <Button label="편물 열기" variant="secondary" onPress={() => router.push({ pathname: '/project/[id]', params: { id: r.project_id } })} />}
    <View style={styles.preview}>{r.output === 'mp4' && q.data.url ? <VideoPlayer key={q.data.url} uri={q.data.url} label="발행 결과물" /> : <Image source={{ uri: q.data.url ?? undefined }} style={StyleSheet.absoluteFill} contentFit="contain" />}</View>
    <Text>공개 대상: {r.visibility === 'private' ? '나만' : r.visibility === 'followers' ? '승인된 팔로워' : '전체'}</Text>
    {own ? <>
      <Field label="표시 제목" value={title ?? displayTitle} onChangeText={setTitle} maxLength={50} />
      <Button label="제목 저장" disabled={manage.isPending || !title?.trim()} onPress={() => manage.mutate({ action: 'rename', id, title: title ?? displayTitle }, { onError: fail })} />
      {deletedProject ? <>
        <Button label="나만" variant="secondary" disabled={manage.isPending} onPress={() => setVisibility('private')} />
        <Button label="팔로워" variant="secondary" disabled={manage.isPending} onPress={() => setVisibility('followers')} />
        <Button label="전체 공개" variant="secondary" disabled={manage.isPending} onPress={() => setVisibility('public')} />
      </> : null}
      <Button label="결과물 삭제" variant="secondary" disabled={manage.isPending} onPress={() => showAlert('발행한 결과물을 삭제할까요?', '피드에서 사라지고 이번 버전에서는 복원할 수 없어요. 편물과 원본 촬영 기록은 그대로 남습니다.', [
        { text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => manage.mutate({ action: 'delete', id }, { onError: fail, onSuccess: () => router.back() }) },
      ])} />
    </> : null}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg }, content: { padding: space.lg, gap: space.md },
  title: { color: color.text, fontSize: fontSize.title }, preview: { width: '100%', aspectRatio: 1 },
});
