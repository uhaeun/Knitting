import { getDb } from '@/shared/lib/db';
import { newId } from '@/shared/lib/id';
import type { Project, ProjectSummary, Visibility } from '@/shared/types/models';

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

export function createProject(input: {
  name: string;
  started_at: string;
  default_visibility?: Visibility;
}): Project {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 50) throw new Error('편물 이름은 1~50자');
  const now = new Date().toISOString();
  const project: Project = {
    id: newId(),
    name,
    started_at: input.started_at,
    finished_at: null,
    cover_post_id: null,
    default_visibility: input.default_visibility ?? 'private',
    created_at: now,
    updated_at: now,
    deleted_at: null,
    synced_at: null,
  };
  getDb().runSync(
    `INSERT INTO projects (id, name, started_at, finished_at, cover_post_id, default_visibility, created_at, updated_at, deleted_at, synced_at)
     VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, NULL, NULL)`,
    project.id,
    project.name,
    project.started_at,
    project.default_visibility,
    project.created_at,
    project.updated_at,
  );
  return project;
}

/** 공개 범위 변경. 기존 사진에도 같이 적용한다 (편물 단위로 생각하는 게 자연스럽다). */
export function setProjectVisibility(id: string, v: Visibility): void {
  const now = new Date().toISOString();
  getDb().withTransactionSync(() => {
    getDb().runSync(
      'UPDATE projects SET default_visibility = ?, updated_at = ?, synced_at = NULL WHERE id = ?',
      v, now, id,
    );
    getDb().runSync(
      'UPDATE posts SET visibility = ?, updated_at = ?, synced_at = NULL WHERE project_id = ? AND deleted_at IS NULL',
      v, now, id,
    );
  });
}

/** soft delete. 사진 파일은 남긴다 (복구 여지). synced_at을 비워 삭제도 서버에 반영되게 한다. */
export function deleteProject(id: string): void {
  const now = new Date().toISOString();
  getDb().withTransactionSync(() => {
    getDb().runSync(
      'UPDATE projects SET deleted_at = ?, updated_at = ?, synced_at = NULL WHERE id = ?', now, now, id,
    );
    getDb().runSync(
      'UPDATE posts SET deleted_at = ?, updated_at = ?, synced_at = NULL WHERE project_id = ? AND deleted_at IS NULL',
      now, now, id,
    );
  });
}

/** 동기화용 */
export function unsyncedProjects(): Project[] {
  return getDb().getAllSync<Project>('SELECT * FROM projects WHERE synced_at IS NULL ORDER BY created_at ASC');
}
export function markProjectSynced(id: string, at: string): void {
  getDb().runSync('UPDATE projects SET synced_at = ? WHERE id = ?', at, id);
}
export function insertProjectFromRemote(p: Project): void {
  getDb().runSync(
    `INSERT OR IGNORE INTO projects (id, name, started_at, finished_at, cover_post_id, default_visibility, created_at, updated_at, deleted_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    p.id, p.name, p.started_at, p.finished_at, p.cover_post_id, p.default_visibility,
    p.created_at, p.updated_at, p.deleted_at, p.synced_at,
  );
}
export function projectExists(id: string): boolean {
  return !!getDb().getFirstSync<{ id: string }>('SELECT id FROM projects WHERE id = ?', id);
}
export function unsyncedCount(): number {
  const a = getDb().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM projects WHERE synced_at IS NULL')?.n ?? 0;
  const b = getDb().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM posts WHERE synced_at IS NULL')?.n ?? 0;
  return a + b;
}
