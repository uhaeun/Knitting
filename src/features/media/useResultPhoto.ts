import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { usePosts } from '@/features/capture/queries';
import { postPhotoUri } from '@/features/capture/repository';
import { composeResult, saveResult, shareResult } from '@/features/media/composeResult';
import { buildScene, minPhotosFor, resultFileName, type ResultKind } from '@/features/media/resultPlan';
import { useProject } from '@/features/project/queries';

/**
 * 결과 사진 화면의 상태. 종류를 고르면 합성하고, 같은 종류·같은 사진이면 다시 합성하지 않는다.
 * 합성·저장·공유 구현은 플랫폼별 composeResult(.web).ts.
 */
export function useResultPhoto(projectId: string) {
  const project = useProject(projectId);
  const posts = usePosts(projectId);
  const photoCount = posts.data?.length ?? 0;
  // 고르기 전에는 사진 수에 맞는 가장 풍부한 종류 (사진을 다 불러온 뒤에 정해져야 해서 state 초기값으로 두지 않는다)
  const [chosen, setChosen] = useState<ResultKind | null>(null);
  const kind: ResultKind = chosen ?? (photoCount >= 3 ? 'triple' : photoCount === 2 ? 'beforeAfter' : 'single');
  const [saved, setSaved] = useState<ResultKind | null>(null);

  const lastPostId = posts.data?.[photoCount - 1]?.id ?? null;
  const fileName = resultFileName(projectId, kind);
  const result = useQuery({
    queryKey: ['projects', projectId, 'result', kind, photoCount, lastPostId, project.data?.name] as const,
    enabled: !!project.data && !!posts.data && photoCount >= minPhotosFor(kind),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0, // 파일·blob을 오래 들고 있지 않는다
    retry: false,
    queryFn: () => {
      if (!project.data || !posts.data) throw new Error('편물을 불러오는 중이에요');
      const scene = buildScene({ kind, project: project.data, posts: posts.data, uriOf: postPhotoUri });
      return composeResult(scene, fileName);
    },
  });

  // 웹: 바뀐 결과의 blob URL을 해제한다 (앱은 캐시 파일이라 덮어쓴다)
  const uri = result.data ?? null;
  useEffect(() => {
    if (Platform.OS !== 'web' || !uri) return;
    return () => URL.revokeObjectURL(uri);
  }, [uri]);

  const choose = (k: ResultKind) => {
    setChosen(k);
    setSaved(null);
  };

  const save = async () => {
    if (!result.data) return;
    await saveResult(result.data, fileName);
    setSaved(kind);
  };

  const share = async () => {
    if (!result.data) return;
    await shareResult(result.data, fileName);
  };

  return {
    projectName: project.data?.name ?? '',
    photoCount,
    loadingPhotos: project.isPending || posts.isPending,
    kind,
    choose,
    uri,
    composing: result.isFetching,
    error: result.error ? (result.error instanceof Error ? result.error.message : String(result.error)) : null,
    retry: () => void result.refetch(),
    saved: saved === kind,
    save,
    share,
  };
}
