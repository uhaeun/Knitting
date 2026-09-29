import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createProject, deleteProject, getProject, listProjects, listTrash, renameProject, restoreTrashItem, setPhotosHiddenFromOthers, setProjectVisibility, updateProjectDates, type TrashItem } from '@/features/project/repository';
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
      createProject(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useSetVisibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; visibility: Visibility }) =>
      setProjectVisibility(v.id, v.visibility),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: projectKeys.all });
      qc.invalidateQueries({ queryKey: projectKeys.posts(v.id) });
    },
  });
}

export function useSetPhotosHiddenFromOthers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; hidden: boolean }) => setPhotosHiddenFromOthers(v.id, v.hidden),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: projectKeys.all });
      qc.invalidateQueries({ queryKey: projectKeys.posts(v.id) });
      qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useRenameProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; name: string }) => renameProject(v.id, v.name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.all });
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['post'] });
    },
  });
}

export function useUpdateProjectDates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: { started_at?: string; finished_at?: string | null } }) =>
      updateProjectDates(v.id, v.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useTrash() {
  return useQuery({ queryKey: ['trash'], queryFn: () => listTrash() });
}

export function useRestoreTrash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: Pick<TrashItem, 'kind' | 'id'>) => restoreTrashItem(item),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trash'] });
      qc.invalidateQueries({ queryKey: projectKeys.all });
      qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useProject(id: string) {
  return useQuery({ queryKey: [...projectKeys.all, id] as const, queryFn: () => getProject(id) });
}
