import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { usePosts } from '@/features/capture/queries';
import { composeResult } from '@/features/media/composeResult';
import { buildScene, minPhotosFor, outputKindOf, resolveRatio, type ResultKind, type ResultRatio } from '@/features/media/resultPlan';
import { useProject } from '@/features/project/queries';
import { showAlert } from '@/shared/lib/dialog';
import { saveOrShare } from '@/shared/lib/saveFile';

/** 결과 사진 화면의 상태. 종류를 고르면 합성하고, 같은 종류·같은 사진이면 다시 합성하지 않는다. */
export function useResultPhoto(projectId: string) {
  const project = useProject(projectId);
  const posts = usePosts(projectId);
  const photoCount = posts.data?.length ?? 0;
  // 고르기 전에는 사진 수에 맞는 가장 풍부한 종류 (사진을 다 불러온 뒤에 정해져야 해서 state 초기값으로 두지 않는다)
  const [chosen, setChosen] = useState<ResultKind | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [chosenRatio, setRatio] = useState<ResultRatio | null>(null);
  // 3분할 칸마다 위아래 자르는 위치 (0=위쪽 그대로 ~ 1=아래쪽 그대로). 종류를 바꾸면 가운데로 되돌린다
  const [focusY, setFocusY] = useState<number[]>([0.5, 0.5, 0.5]);
  const kind: ResultKind = chosen ?? (photoCount >= 3 ? 'triple' : photoCount === 2 ? 'beforeAfter' : 'single');
  // 3분할로 바꾸면 정사각·16:9는 고를 수 없어 9:16으로. 다시 다른 종류로 가면 고른 비율이 살아난다
  const ratio = resolveRatio(kind, chosenRatio);

  const lastPostId = posts.data?.[photoCount - 1]?.id ?? null;
  const result = useQuery({
    queryKey: ['projects', projectId, 'result', kind, ratio, photoCount, lastPostId, project.data?.name, focusY] as const,
    enabled: !!project.data && !!posts.data && photoCount >= minPhotosFor(kind),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0, // blob을 오래 들고 있지 않는다
    retry: false,
    queryFn: async ({ signal }) => {
      if (!project.data || !posts.data) throw new Error('편물을 불러오는 중이에요');
      const scene = buildScene({ kind, project: project.data, posts: posts.data, ratio, panelFocusY: focusY });
      // 종류를 바꾸면 React Query가 signal로 이전 합성을 취소한다. 취소된 합성은 진행률을 건드리지 않는다
      // 진행률은 MP4만 (JPEG는 한 번에 끝나 0%에 멈춰 보인다)
      setProgress(outputKindOf(scene) === 'mp4' ? 0 : null);
      try {
        return await composeResult(scene, projectId, kind, (r) => {
          if (!signal.aborted) setProgress(r);
        }, signal);
      } finally {
        if (!signal.aborted) setProgress(null);
      }
    },
  });

  // 바뀐 결과의 blob URL을 해제한다
  const uri = result.data?.uri ?? null;
  useEffect(() => {
    if (!uri) return;
    return () => URL.revokeObjectURL(uri);
  }, [uri]);

  /** 폰: 공유 창 → "이미지 저장". 공유 창이 없는 브라우저: 파일 내려받기 */
  const save = async () => {
    if (!result.data) return;
    const outcome = await saveOrShare(result.data.file, result.data.uri);
    if (outcome === 'saved') showAlert('사진첩에 저장했어요');
  };

  const STEP = 0.15;
  const nudgeFocus = (index: number, dir: -1 | 1) => {
    setFocusY((prev) => prev.map((v, i) => (i === index ? Math.min(1, Math.max(0, v + dir * STEP)) : v)));
  };

  return {
    projectName: project.data?.name ?? '',
    photoCount,
    loadingPhotos: project.isPending || posts.isPending,
    kind,
    choose: (k: ResultKind) => {
      setChosen(k);
      setFocusY([0.5, 0.5, 0.5]); // 다른 종류로 바꾸면 자르는 위치도 가운데로 되돌린다
    },
    ratio,
    chooseRatio: setRatio,
    focusY,
    nudgeFocus,
    uri,
    output: result.data?.output ?? null,
    progress,
    composing: result.isFetching,
    error: result.error ? (result.error instanceof Error ? result.error.message : String(result.error)) : null,
    retry: () => void result.refetch(),
    save,
  };
}
