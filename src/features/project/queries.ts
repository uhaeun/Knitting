import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createProject, deleteProject, getProject, listProjects, setProjectVisibility } from '@/features/project/repository';
import type { Visibility } from '@/shared/types/models';

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
    mutationFn: (input: { name: string; started_at: string; default_visibility?: Visibility }) =>
      Promise.resolve(createProject(input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useSetVisibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; visibility: Visibility }) =>
      Promise.resolve(setProjectVisibility(v.id, v.visibility)),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: projectKeys.all });
      qc.invalidateQueries({ queryKey: projectKeys.posts(v.id) });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => Promise.resolve(deleteProject(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useProject(id: string) {
  return useQuery({ queryKey: [...projectKeys.all, id] as const, queryFn: () => getProject(id) });
}
