/**
 * 서버(Supabase) 행 타입. supabase/migrations/0001_init.sql과 1:1.
 * TODO: CLI가 연결되면 `supabase gen types`로 database.ts를 생성하고 이 파일을 대체한다.
 */
import type { MediaType, Visibility } from '@/shared/types/models';

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_path: string | null;
  is_private: boolean;
  eula_version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type RemoteProject = {
  id: string;
  owner_id: string;
  name: string;
  cover_post_id: string | null;
  started_at: string;
  finished_at: string | null;
  default_visibility: Visibility;
  /** true면 이 편물의 일상 사진(posts)은 본인 말고는 못 본다. 발행한 결과물(results)은 영향 없음 */
  photos_hidden_from_others: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type RemotePost = {
  id: string;
  project_id: string;
  owner_id: string;
  media_type: MediaType;
  video_path: string | null; // 'photos' 버킷 내 .mp4 경로. 사진이면 null
  duration_ms: number | null;
  photo_path: string; // 'photos' 버킷 내 경로
  thumb_path: string;
  width: number;
  height: number;
  caption: string | null;
  taken_at: string;
  visibility: Visibility;
  like_count: number;
  comment_count: number;
  hidden_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/** 발행한 결과물(결과 사진·영상). posts와 달리 좋아요·댓글이 없다 */
export type RemoteResult = {
  id: string;
  project_id: string;
  owner_id: string;
  kind: string; // 'single' | 'beforeAfter' | 'triple' (features/media/resultPlan.ts의 ResultKind)
  ratio: string; // '1:1' | '4:5' | '9:16' | '16:9' (ResultRatio)
  output: 'jpeg' | 'mp4';
  file_path: string; // 'photos' 버킷 내 경로
  thumb_path: string; // 대표 이미지. mp4여도 항상 jpeg
  visibility: Visibility;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type FollowStatus = 'pending' | 'accepted';
export type Follow = { follower_id: string; followee_id: string; status: FollowStatus; created_at: string };

export type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  parent_id: string | null; // 답글이면 원 댓글 id (한 단계만)
  edited_at: string | null;
  hidden_at: string | null;
  created_at: string;
  deleted_at: string | null;
};

export type ReportTarget = 'post' | 'comment' | 'profile';

/** 피드 카드 하나. posts + 작성자 + 편물 이름 조인 */
export type FeedPost = RemotePost & {
  profiles: Pick<Profile, 'id' | 'username' | 'display_name' | 'is_private' | 'avatar_path'>;
  projects: Pick<RemoteProject, 'id' | 'name' | 'started_at'>;
};

/** 발행한 결과물 카드 하나. results + 작성자 + 편물 이름 조인 */
export type FeedResult = RemoteResult & {
  profiles: Pick<Profile, 'id' | 'username' | 'display_name' | 'is_private' | 'avatar_path'>;
  projects: Pick<RemoteProject, 'id' | 'name' | 'started_at'>;
};
