/** 로컬 SQLite 스키마와 1:1. 3주차 Supabase 전환 시 설계도 3장의 컬럼과 맞춘다. */

export type Project = {
  id: string; // UUID v4
  name: string;
  started_at: string; // 'YYYY-MM-DD'
  finished_at: string | null;
  cover_post_id: string | null;
  created_at: string; // ISO
  updated_at: string;
  deleted_at: string | null;
};

export type Post = {
  id: string;
  project_id: string;
  photo_path: string; // 문서 디렉터리 기준 상대 경로. 절대 URI 저장 금지(앱 재설치 시 바뀜)
  thumb_path: string;
  width: number;
  height: number;
  taken_at: string; // ISO
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/** 목록 화면용. projects + 집계 */
export type ProjectSummary = Project & {
  photo_count: number;
  cover_thumb_path: string | null;
};
