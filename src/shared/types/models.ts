/** 화면이 쓰는 편물·사진. 서버(Supabase) 행에서 owner_id 등을 뺀 모양. 원본 행 타입은 remote.ts */

export type Visibility = 'private' | 'followers' | 'public';

export type Project = {
  id: string; // UUID v4
  name: string;
  started_at: string; // 'YYYY-MM-DD'
  finished_at: string | null;
  cover_post_id: string | null;
  default_visibility: Visibility;
  created_at: string; // ISO
  updated_at: string;
  deleted_at: string | null;
};

export type Post = {
  id: string;
  project_id: string;
  photo_path: string; // 읽어 온 값은 서명 URL. DB에는 Storage 키가 들어 있다 (repository.ts)
  thumb_path: string;
  width: number;
  height: number;
  taken_at: string; // ISO
  visibility: Visibility;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/** 목록 화면용. projects + 집계 */
export type ProjectSummary = Project & {
  photo_count: number;
  cover_thumb_path: string | null;
};
