import { getDb } from '@/shared/lib/db';
import { newId } from '@/shared/lib/id';
import type { Project, ProjectSummary } from '@/shared/types/models';

/** 편물 데이터 접근은 이 파일에서만. 화면은 이 함수들만 부른다. */

export function listProjects(): ProjectSummary[] {
  return getDb().getAllSync<ProjectSummary>(`
    SELECT p.*,
      (SELECT COUNT(*) FROM posts x WHERE x.project_id = p.id AND x.deleted_at IS NULL) AS photo_count,
      (SELECT x.thumb_path FROM posts x
         WHERE x.project_id = p.id AND x.deleted_at IS NULL
         ORDER BY x.taken_at DESC, x.created_at DESC LIMIT 1) AS cover_thumb_path
    FROM projects p
    WHERE p.deleted_at IS NULL
    ORDER BY p.created_at DESC
  `);
}

export function getProject(id: string): Project | null {
  return getDb().getFirstSync<Project>(
    'SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL',
    id,
  );
}

export function createProject(input: { name: string; started_at: string }): Project {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 50) throw new Error('편물 이름은 1~50자');
  const now = new Date().toISOString();
  const project: Project = {
    id: newId(),
    name,
    started_at: input.started_at,
    finished_at: null,
    cover_post_id: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  getDb().runSync(
    `INSERT INTO projects (id, name, started_at, finished_at, cover_post_id, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, NULL, NULL, ?, ?, NULL)`,
    project.id,
    project.name,
    project.started_at,
    project.created_at,
    project.updated_at,
  );
  return project;
}

/** soft delete. 사진 파일은 남긴다 (복구 여지). 고아 정리는 별도. */
export function deleteProject(id: string): void {
  const now = new Date().toISOString();
  getDb().runSync('UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
}
