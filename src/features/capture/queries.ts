import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { deletePost, latestPost, listPosts, savePost, saveVideoPost, updateCaption } from '@/features/capture/repository';
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

export function useSaveVideoPost(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { source: Blob; onProgress?: (stage: 'converting' | 'uploading', ratio: number) => void }) =>
      saveVideoPost({ projectId, ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.posts(projectId) });
      qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

/** 기록 메모 고치기. 편물 화면·게시물 상세 어디서 고쳐도 다른 화면에 옛 글이 남지 않게 한다 */
export function useUpdateCaption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { postId: string; caption: string }) => updateCaption(v.postId, v.caption),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.all });
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['post'] });
    },
  });
}

/** 기록 하나 지우기 (잘못 찍은 사진·영상). 목록에서만 사라지고 파일은 남는다.
 *  편물 화면·피드·게시물 상세 어디서 지워도 다른 화면에 남지 않게 관련 캐시를 전부 무효화한다. */
export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => deletePost(postId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.all });
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['post'] });
    },
  });
}
