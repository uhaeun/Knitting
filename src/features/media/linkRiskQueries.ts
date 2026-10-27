import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/store';
import { fetchLegacyLinkRisks, retryLegacyLink } from '@/features/media/resultsRepository';
const lastRequest = new Map<string, number>();
const INTERVAL = 60_000;
export function useLinkRisks() {
  const user = useAuth((s) => s.session?.user.id);
  const client = useQueryClient();
  const manual = useRef(false);
  const key = ['results', 'link-risks', user] as const;
  const due = () => !user || performance.now() - (lastRequest.get(user) ?? -Infinity) >= INTERVAL;
  const q = useQuery({
    queryKey: key, enabled: !!user, retry: false, staleTime: INTERVAL,
    refetchOnWindowFocus: due, refetchOnReconnect: due, refetchOnMount: due,
    queryFn: async () => {
      const force = manual.current;
      manual.current = false;
      if (!user || (!force && !due())) throw new Error('링크 위험 상태를 아직 확인하지 못했어요');
      lastRequest.set(user, performance.now());
      return fetchLegacyLinkRisks();
    },
  });
  const recheck = async () => {
    if (client.getQueryState(key)?.fetchStatus !== 'fetching') manual.current = true;
    try { await q.refetch({ cancelRefetch: false }); } finally { manual.current = false; }
  };
  return { ...q, data: q.data?.risks, summary: q.data?.summary, recheck };
}

export function useRetryLegacyLink() {
  const user = useAuth((s) => s.session?.user.id);
  const qc = useQueryClient();
  return useMutation({ mutationFn: retryLegacyLink, onSuccess: async () => {
    lastRequest.delete(user ?? '');
    await qc.invalidateQueries({ queryKey: ['results', 'link-risks', user] });
  } });
}
