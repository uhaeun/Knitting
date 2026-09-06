import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createProject, deleteProject, listProjects } from '@/features/project/repository';

/** 화면은 repository를 직접 부르지 않고 이 훅만 쓴다. 캐시 무효화가 한 곳에 모인다. */

export const projectKeys = {
  all: ['projects'] as const,
  posts: (projectId: string) => ['projects', projectId, 'posts'] as const,
};

export function useProjects() {
  return useQuery({ queryKey: projectKeys.all, queryFn: () => listProjects() });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; started_at: string }) => Promise.resolve(createProject(input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => Promise.resolve(deleteProject(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}
