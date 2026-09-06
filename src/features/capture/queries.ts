import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/store';
import { latestPost, listPosts, savePost } from '@/features/capture/repository';
import { projectKeys } from '@/features/project/queries';
import { syncInBackground } from '@/features/sync/store';

export function usePosts(projectId: string) {
  return useQuery({ queryKey: projectKeys.posts(projectId), queryFn: () => listPosts(projectId) });
}

export function useLatestPost(projectId: string) {
  return useQuery({
    queryKey: [...projectKeys.posts(projectId), 'latest'],
    queryFn: () => latestPost(projectId),
  });
}

export function useSavePost(projectId: string) {
  const qc = useQueryClient();
  const userId = useAuth((s) => s.session?.user.id ?? null);
  return useMutation({
    mutationFn: (input: { sourceUri: string; width: number; height: number }) =>
      savePost({ projectId, ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.posts(projectId) });
      qc.invalidateQueries({ queryKey: projectKeys.all });
      // 로컬 저장이 먼저 끝났고, 업로드는 실패해도 사진은 남는다
      syncInBackground(userId);
    },
  });
}
