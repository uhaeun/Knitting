import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ComposedResult } from '@/features/media/composeResult';
import type { ResultKind, ResultRatio } from '@/features/media/resultPlan';
import { fetchFollowingResults, fetchResult, publishResult, fetchMyResults, deleteResult, renameResult, setResultVisibility } from '@/features/media/resultsRepository';
import { useAuth } from '@/features/auth/store';
import { forgetSignedUrls } from '@/shared/lib/remote';
import type { Visibility } from '@/shared/types/models';

/** 화면은 resultsRepository.ts를 직접 부르지 않고 이 훅만 쓴다. */

export function useFollowingResults() {
  const user = useAuth((s) => s.session?.user.id);
  return useQuery({ queryKey: ['feed', 'results', 'following', user], enabled: !!user, queryFn: () => fetchFollowingResults() });
}

/** 결과물 하나를 크게 볼 때만 원본을 불러온다 (목록은 썸네일로 충분) */
export function useResult(id: string | null) {
  const user = useAuth((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['feed', 'results', user, id] as const,
    queryFn: () => fetchResult(id as string),
    enabled: !!id,
  });
}

export function usePublishResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { projectId: string; kind: ResultKind | 'growth'; ratio: ResultRatio; visibility: Visibility; composed: ComposedResult; recipeHash: string; remakeRequest?: string | null }) =>
      publishResult(input),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['feed', 'results'] }), qc.invalidateQueries({ queryKey: ['results'] })]),
  });
}

export function useMyResults() {
  const user = useAuth((s) => s.session?.user.id);
  return useQuery({ queryKey: ['results', 'mine', user], enabled: !!user, queryFn: fetchMyResults });
}
export function useManageResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; action: 'delete' } | { id: string; action: 'rename'; title: string } | { id: string; action: 'visibility'; visibility: Visibility }) =>
      input.action === 'delete' ? deleteResult(input.id) : input.action === 'rename'
        ? renameResult(input.id, input.title) : setResultVisibility(input.id, input.visibility),
    onSuccess: () => { forgetSignedUrls(); void qc.invalidateQueries({ queryKey: ['results'] }); void qc.invalidateQueries({ queryKey: ['feed'] }); },
  });
}
