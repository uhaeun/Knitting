import { useQuery } from '@tanstack/react-query';
import { useProject } from '@/features/project/queries';
import { usePublishResult } from '@/features/media/resultsQueries';
import { prepareEdition } from '@/features/media/resultsRepository';
import { newId } from '@/shared/lib/id';
import { useCallback, useEffect, useRef, useState } from 'react';

import { makeVideo, type EncodeResult } from '@/features/media/makeVideo';
import type { VideoOptions } from '@/features/media/plan';
import { showAlert } from '@/shared/lib/dialog';
import { saveOrShare } from '@/shared/lib/saveFile';

export type MakeVideoState =
  | { status: 'idle' }
  | { status: 'encoding'; progress: number }
  | { status: 'done'; result: EncodeResult }
  | { status: 'error'; message: string };

/** 타임라인 "영상 만들기"의 상태 머신. 화면은 이 훅만 쓴다. 화면을 떠나면 만들던 영상을 취소하고 결과 URL을 해제한다. */
export function useMakeVideo(projectId: string) {
  const project = useProject(projectId);
  const [remakeRequest, setRemakeRequest] = useState<string | null>(null);
  const [state, setState] = useState<MakeVideoState>({ status: 'idle' });
  const job = useRef<AbortController | null>(null);
  const doneUri = useRef<string | null>(null);
  /** 다시 시도할 때 같은 설정을 쓴다 */
  const lastOptions = useRef<VideoOptions>({});

  const releaseDone = () => {
    if (doneUri.current) URL.revokeObjectURL(doneUri.current);
    doneUri.current = null;
  };

  useEffect(
    () => () => {
      job.current?.abort();
      releaseDone();
    },
    [],
  );

  const start = useCallback(async (options?: VideoOptions) => {
    if (options) {
      if (JSON.stringify(options) !== JSON.stringify(lastOptions.current)) setRemakeRequest(null);
      lastOptions.current = options;
    }
    job.current?.abort();
    releaseDone();
    const controller = new AbortController();
    job.current = controller;
    const { signal } = controller;
    setState({ status: 'encoding', progress: 0 });
    try {
      const result = await makeVideo(
        projectId,
        lastOptions.current,
        (p) => {
          if (!signal.aborted) setState({ status: 'encoding', progress: p.progress });
        },
        signal,
      );
      if (signal.aborted) {
        URL.revokeObjectURL(result.uri);
        return;
      }
      doneUri.current = result.uri;
      setState({ status: 'done', result });
    } catch (e) {
      if (signal.aborted) return;
      setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      if (job.current === controller) job.current = null;
    }
  }, [projectId]);

  /** 폰: 공유 창 → "비디오 저장". 공유 창이 없는 브라우저: 파일 내려받기 */
  const save = useCallback(async () => {
    if (state.status !== 'done') return;
    const outcome = await saveOrShare(state.result.file, state.result.uri);
    if (outcome === 'saved') showAlert('사진첩에 저장했어요');
  }, [state]);

  const reset = useCallback(() => {
    job.current?.abort();
    releaseDone();
    setState({ status: 'idle' });
  }, []);

  const result = state.status === 'done' ? state.result : null;
  const edition = useQuery({
    queryKey: ['results', 'growth-edition', projectId, result?.recipeHash, remakeRequest],
    enabled: !!result,
    queryFn: () => prepareEdition(projectId, result!.recipeHash, remakeRequest),
    retry: false,
  });
  const publish = usePublishResult();
  const publishToFeed = () => {
    if (!result || !project.data || edition.data?.state !== 'unpublished') return;
    publish.mutate({ projectId, kind: 'growth', ratio: '1:1', visibility: project.data.default_visibility,
      composed: { ...result, output: 'mp4' }, recipeHash: result.recipeHash, remakeRequest }, {
      onSuccess: () => showAlert('피드에 올렸어요'),
      onError: (e) => showAlert('발행하지 못했어요', e.message),
    });
  };
  return { state, start, save, reset, publishToFeed,
    publishing: publish.isPending,
    published: edition.data?.state === 'published',
    canPublish: !!result && !edition.isFetching && edition.data?.state === 'unpublished',
    editionError: edition.isError ? edition.error.message : edition.data?.state === 'deleted' ? '삭제한 제작 버전이에요. 다시 제작한 뒤 발행해 주세요.' : null,
    recheckEdition: () => void edition.refetch(),
    visibilityLabel: project.data?.default_visibility === 'public' ? '전체' : project.data?.default_visibility === 'followers' ? '승인된 팔로워' : '나만',
    remake: () => { setRemakeRequest(newId()); void start(); },
  };
}
