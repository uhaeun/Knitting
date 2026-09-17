import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { latestPost, listPosts, savePost } from '@/features/capture/repository';
import { projectKeys } from '@/features/project/queries';

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
  return useMutation({
    mutationFn: (input: { sourceUri: string; width: number; height: number }) =>
      savePost({ projectId, ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.posts(projectId) });
      qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}
