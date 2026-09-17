import { getSupabase, PHOTOS_BUCKET } from '@/shared/lib/supabase';
import type {
  Comment,
  FeedPost,
  Follow,
  FollowStatus,
  Profile,
  ReportTarget,
} from '@/shared/types/remote';

export const PAGE_SIZE = 12;
const SIGNED_URL_TTL = 3600;

const FEED_SELECT = `
  *,
  profiles!posts_owner_id_fkey ( id, username, display_name, is_private ),
  projects!posts_project_id_fkey ( id, name, started_at )
`;

/** 사진 경로 → 서명 URL. 피드는 반드시 배치로 발급한다 (개별 호출 N회 금지). */
export async function signPhotoUrls(paths: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await getSupabase().storage
    .from(PHOTOS_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL);
  if (error) throw new Error(error.message);
  const out = new Map<string, string>();
  for (const d of data ?? []) {
    if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  }
  return out;
}

export type FeedPage = { posts: FeedPost[]; urls: Map<string, string>; nextCursor: string | null };

async function toPage(rows: FeedPost[]): Promise<FeedPage> {
  const urls = await signPhotoUrls(rows.map((r) => r.photo_path));
  const last = rows[rows.length - 1];
  return { posts: rows, urls, nextCursor: rows.length === PAGE_SIZE && last ? last.created_at : null };
}

/** 팔로잉 피드. RLS가 가시성을 판정하므로 여기서 조건을 중복 작성하지 않는다. */
export async function fetchFollowingFeed(cursor: string | null): Promise<FeedPage> {
  const sb = getSupabase();
  const { data: follows, error: fe } = await sb.from('follows').select('followee_id').eq('status', 'accepted');
  if (fe) throw new Error(fe.message);
  const ids = (follows ?? []).map((f) => (f as { followee_id: string }).followee_id);
  if (ids.length === 0) return { posts: [], urls: new Map(), nextCursor: null };

  let q = sb
    .from('posts')
    .select(FEED_SELECT)
    .in('owner_id', ids)
    .is('deleted_at', null)
    .is('hidden_at', null)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);
  if (cursor) q = q.lt('created_at', cursor);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return toPage((data ?? []) as unknown as FeedPost[]);
}

/** 탐색 피드. 최신순 또는 인기순. 전체 공개 게시물만 (RLS가 걸러준다). */
export async function fetchExploreFeed(sort: 'recent' | 'popular', cursor: string | null): Promise<FeedPage> {
  let q = getSupabase()
    .from('posts')
    .select(FEED_SELECT)
    .eq('visibility', 'public')
    .is('deleted_at', null)
    .is('hidden_at', null)
    .limit(PAGE_SIZE);
  q = sort === 'popular'
    ? q.order('like_count', { ascending: false }).order('created_at', { ascending: false })
    : q.order('created_at', { ascending: false });
  if (cursor && sort === 'recent') q = q.lt('created_at', cursor);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as FeedPost[];
  const page = await toPage(rows);
  return sort === 'popular' ? { ...page, nextCursor: null } : page;
}

export async function fetchPost(postId: string): Promise<{ post: FeedPost; url: string | null; videoUrl: string | null }> {
  const { data, error } = await getSupabase().from('posts').select(FEED_SELECT).eq('id', postId).is('deleted_at', null).is('hidden_at', null).single();
  if (error) throw new Error(error.message);
  const post = data as unknown as FeedPost;
  const urls = await signPhotoUrls(post.video_path ? [post.photo_path, post.video_path] : [post.photo_path]);
  return {
    post,
    url: urls.get(post.photo_path) ?? null,
    videoUrl: post.video_path ? (urls.get(post.video_path) ?? null) : null,
  };
}

/** 특정 사용자의 게시물. 프로필 화면 그리드. */
export async function fetchUserPosts(userId: string, cursor: string | null): Promise<FeedPage> {
  let q = getSupabase()
    .from('posts')
    .select(FEED_SELECT)
    .eq('owner_id', userId)
    .is('deleted_at', null)
    .is('hidden_at', null)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);
  if (cursor) q = q.lt('created_at', cursor);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as FeedPost[];
  const urls = await signPhotoUrls(rows.map((r) => r.thumb_path));
  const last = rows[rows.length - 1];
  return { posts: rows, urls, nextCursor: rows.length === PAGE_SIZE && last ? last.created_at : null };
}

// --- 프로필 ---
export async function fetchProfileByUsername(username: string): Promise<Profile | null> {
  const { data, error } = await getSupabase().from('profiles').select('*').eq('username', username).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Profile | null) ?? null;
}

export async function searchProfiles(query: string): Promise<Profile[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('*')
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .is('deleted_at', null)
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as Profile[];
}

// --- 팔로우 ---
/** status는 서버 트리거가 정한다 (비공개면 pending). 클라이언트가 보내지 않는다. */
export async function follow(followeeId: string): Promise<FollowStatus> {
  const sb = getSupabase();
  const me = (await sb.auth.getUser()).data.user;
  if (!me) throw new Error('로그인이 필요해요');
  const { data, error } = await sb
    .from('follows')
    .insert({ follower_id: me.id, followee_id: followeeId })
    .select('status')
    .single();
  if (error) throw new Error(error.message);
  return (data as { status: FollowStatus }).status;
}

export async function unfollow(followeeId: string): Promise<void> {
  const sb = getSupabase();
  const me = (await sb.auth.getUser()).data.user;
  if (!me) throw new Error('로그인이 필요해요');
  const { error } = await sb.from('follows').delete().eq('follower_id', me.id).eq('followee_id', followeeId);
  if (error) throw new Error(error.message);
}

export async function fetchFollowState(followeeId: string): Promise<FollowStatus | null> {
  const sb = getSupabase();
  const me = (await sb.auth.getUser()).data.user;
  if (!me) return null;
  const { data, error } = await sb
    .from('follows')
    .select('status')
    .eq('follower_id', me.id)
    .eq('followee_id', followeeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { status: FollowStatus } | null)?.status ?? null;
}

/** 나에게 온 팔로우 요청 (비공개 계정) */
export async function fetchPendingRequests(): Promise<(Follow & { profiles: Profile })[]> {
  const sb = getSupabase();
  const me = (await sb.auth.getUser()).data.user;
  if (!me) return [];
  const { data, error } = await sb
    .from('follows')
    .select('*, profiles!follows_follower_id_fkey ( * )')
    .eq('followee_id', me.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as (Follow & { profiles: Profile })[];
}

export async function approveFollow(followerId: string): Promise<void> {
  const sb = getSupabase();
  const me = (await sb.auth.getUser()).data.user;
  if (!me) throw new Error('로그인이 필요해요');
  const { error } = await sb
    .from('follows')
    .update({ status: 'accepted' })
    .eq('follower_id', followerId)
    .eq('followee_id', me.id);
  if (error) throw new Error(error.message);
}

export async function rejectFollow(followerId: string): Promise<void> {
  const sb = getSupabase();
  const me = (await sb.auth.getUser()).data.user;
  if (!me) throw new Error('로그인이 필요해요');
  const { error } = await sb.from('follows').delete().eq('follower_id', followerId).eq('followee_id', me.id);
  if (error) throw new Error(error.message);
}

export async function fetchFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
  const sb = getSupabase();
  const [a, b] = await Promise.all([
    sb.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', userId).eq('status', 'accepted'),
    sb.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId).eq('status', 'accepted'),
  ]);
  return { followers: a.count ?? 0, following: b.count ?? 0 };
}

// --- 좋아요 ---
export async function like(postId: string): Promise<void> {
  const sb = getSupabase();
  const me = (await sb.auth.getUser()).data.user;
  if (!me) throw new Error('로그인이 필요해요');
  const { error } = await sb.from('reactions').insert({ post_id: postId, user_id: me.id, kind: 'like' });
  if (error && error.code !== '23505') throw new Error(error.message); // 이미 눌렀으면 무시
}

export async function unlike(postId: string): Promise<void> {
  const sb = getSupabase();
  const me = (await sb.auth.getUser()).data.user;
  if (!me) throw new Error('로그인이 필요해요');
  const { error } = await sb.from('reactions').delete().eq('post_id', postId).eq('user_id', me.id);
  if (error) throw new Error(error.message);
}

/** 여러 게시물에 대한 내 좋아요 여부를 한 번에 (피드용) */
export async function fetchMyLikes(postIds: readonly string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const sb = getSupabase();
  const me = (await sb.auth.getUser()).data.user;
  if (!me) return new Set();
  const { data, error } = await sb
    .from('reactions')
    .select('post_id')
    .eq('user_id', me.id)
    .in('post_id', [...postIds]);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => (r as { post_id: string }).post_id));
}

// --- 댓글 ---
export async function fetchComments(postId: string): Promise<(Comment & { profiles: Profile })[]> {
  const { data, error } = await getSupabase()
    .from('comments')
    .select('*, profiles!comments_author_id_fkey ( * )')
    .eq('post_id', postId)
    .is('deleted_at', null)
    .is('hidden_at', null)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as (Comment & { profiles: Profile })[];
}

export async function addComment(postId: string, body: string): Promise<void> {
  const sb = getSupabase();
  const me = (await sb.auth.getUser()).data.user;
  if (!me) throw new Error('로그인이 필요해요');
  const text = body.trim();
  if (text.length < 1 || text.length > 300) throw new Error('댓글은 1~300자');
  const { error } = await sb.from('comments').insert({ post_id: postId, author_id: me.id, body: text });
  if (error) throw new Error(error.message);
}

/** soft delete. 작성자 또는 게시물 소유자만 (RLS가 판정) */
export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', commentId);
  if (error) throw new Error(error.message);
}

// --- 안전: 신고 · 차단 ---
export async function report(target: ReportTarget, targetId: string, reason: string): Promise<void> {
  const sb = getSupabase();
  const me = (await sb.auth.getUser()).data.user;
  if (!me) throw new Error('로그인이 필요해요');
  const { error } = await sb
    .from('reports')
    .insert({ reporter_id: me.id, target_type: target, target_id: targetId, reason });
  if (error) {
    if (error.code === '23505') throw new Error('이미 신고하셨어요');
    throw new Error(error.message);
  }
}

export async function block(userId: string): Promise<void> {
  const sb = getSupabase();
  const me = (await sb.auth.getUser()).data.user;
  if (!me) throw new Error('로그인이 필요해요');
  const { error } = await sb.from('blocks').insert({ blocker_id: me.id, blocked_id: userId });
  if (error && error.code !== '23505') throw new Error(error.message);
}

export async function unblock(userId: string): Promise<void> {
  const sb = getSupabase();
  const me = (await sb.auth.getUser()).data.user;
  if (!me) throw new Error('로그인이 필요해요');
  const { error } = await sb.from('blocks').delete().eq('blocker_id', me.id).eq('blocked_id', userId);
  if (error) throw new Error(error.message);
}

export async function fetchBlocked(): Promise<Profile[]> {
  const sb = getSupabase();
  const me = (await sb.auth.getUser()).data.user;
  if (!me) return [];
  const { data, error } = await sb
    .from('blocks')
    .select('blocked_id, profiles!blocks_blocked_id_fkey ( * )')
    .eq('blocker_id', me.id);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => (r as unknown as { profiles: Profile }).profiles).filter(Boolean);
}
