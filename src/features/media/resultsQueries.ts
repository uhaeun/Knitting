import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ComposedResult } from '@/features/media/composeResult';
import type { ResultKind, ResultRatio } from '@/features/media/resultPlan';
import { fetchFollowingResults, fetchResult, publishResult } from '@/features/media/resultsRepository';
import type { Visibility } from '@/shared/types/models';

/** 화면은 resultsRepository.ts를 직접 부르지 않고 이 훅만 쓴다. */

export function useFollowingResults() {
  return useQuery({ queryKey: ['feed', 'results', 'following'], queryFn: () => fetchFollowingResults() });
}

/** 결과물 하나를 크게 볼 때만 원본을 불러온다 (목록은 썸네일로 충분) */
export function useResult(id: string | null) {
  return useQuery({
    queryKey: ['feed', 'results', id] as const,
    queryFn: () => fetchResult(id as string),
    enabled: !!id,
  });
}

export function usePublishResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { projectId: string; kind: ResultKind; ratio: ResultRatio; visibility: Visibility; composed: ComposedResult }) =>
      publishResult(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feed', 'results'] }),
  });
}
