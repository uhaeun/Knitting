import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import * as api from '@/features/social/api';
import type { FeedPage } from '@/features/social/api';

export const socialKeys = {
  following: ['feed', 'following'] as const,
  explore: (sort: 'recent' | 'popular') => ['feed', 'explore', sort] as const,
  userPosts: (userId: string) => ['feed', 'user', userId] as const,
  post: (id: string) => ['post', id] as const,
  comments: (postId: string) => ['post', postId, 'comments'] as const,
  likes: (scope: string) => ['likes', scope] as const,
  profile: (username: string) => ['profile', username] as const,
  followState: (userId: string) => ['follow', userId] as const,
  followCounts: (userId: string) => ['follow', userId, 'counts'] as const,
  requests: ['follow', 'requests'] as const,
  blocked: ['blocked'] as const,
  search: (q: string) => ['search', q] as const,
  notifications: ['notifications'] as const,
  unread: ['notifications', 'unread'] as const,
};

const pageParams = {
  initialPageParam: null as string | null,
  getNextPageParam: (last: FeedPage) => last.nextCursor,
};

export function useFollowingFeed() {
  return useInfiniteQuery({
    queryKey: socialKeys.following,
    queryFn: ({ pageParam }) => api.fetchFollowingFeed(pageParam),
    ...pageParams,
  });
}

export function useExploreFeed(sort: 'recent' | 'popular') {
  return useInfiniteQuery({
    queryKey: socialKeys.explore(sort),
    queryFn: ({ pageParam }) => api.fetchExploreFeed(sort, pageParam),
    ...pageParams,
  });
}

export function useUserPosts(userId: string | undefined) {
  return useInfiniteQuery({
    queryKey: socialKeys.userPosts(userId ?? ''),
    queryFn: ({ pageParam }) => api.fetchUserPosts(userId!, pageParam),
    enabled: !!userId,
    ...pageParams,
  });
}

/** 피드 페이지들을 하나의 배열로. urls도 합친다. */
export function flattenFeed(data: InfiniteData<FeedPage> | undefined) {
  const posts = (data?.pages ?? []).flatMap((p) => p.posts);
  const urls = new Map<string, string>();
  for (const page of data?.pages ?? []) {
    for (const [k, v] of page.urls) urls.set(k, v);
  }
  return { posts, urls };
}

export function usePost(id: string) {
  return useQuery({ queryKey: socialKeys.post(id), queryFn: () => api.fetchPost(id) });
}

export function useComments(postId: string) {
  return useQuery({ queryKey: socialKeys.comments(postId), queryFn: () => api.fetchComments(postId) });
}

export function useAddComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.addComment(postId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: socialKeys.comments(postId) });
      qc.invalidateQueries({ queryKey: socialKeys.post(postId) });
    },
  });
}

export function useDeleteComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteComment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: socialKeys.comments(postId) });
      qc.invalidateQueries({ queryKey: socialKeys.post(postId) });
    },
  });
}

/** 피드에 보이는 게시물들의 내 좋아요 여부 */
export function useMyLikes(scope: string, postIds: readonly string[]) {
  return useQuery({
    queryKey: [...socialKeys.likes(scope), postIds.length] as const,
    queryFn: () => api.fetchMyLikes(postIds),
    enabled: postIds.length > 0,
  });
}

export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { postId: string; liked: boolean }) =>
      v.liked ? api.unlike(v.postId) : api.like(v.postId),
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: ['likes'] });
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: socialKeys.post(v.postId) });
    },
  });
}

export function useProfile(username: string) {
  return useQuery({
    queryKey: socialKeys.profile(username),
    queryFn: () => api.fetchProfileByUsername(username),
    enabled: !!username,
  });
}

export function useFollowState(userId: string | undefined) {
  return useQuery({
    queryKey: socialKeys.followState(userId ?? ''),
    queryFn: () => api.fetchFollowState(userId!),
    enabled: !!userId,
  });
}

export function useFollowCounts(userId: string | undefined) {
  return useQuery({
    queryKey: socialKeys.followCounts(userId ?? ''),
    queryFn: () => api.fetchFollowCounts(userId!),
    enabled: !!userId,
  });
}

export function useToggleFollow(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (following: boolean) => (following ? api.unfollow(userId) : api.follow(userId).then(() => {})),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: socialKeys.followState(userId) });
      qc.invalidateQueries({ queryKey: socialKeys.followCounts(userId) });
      qc.invalidateQueries({ queryKey: socialKeys.following });
    },
  });
}

export function usePendingRequests() {
  return useQuery({ queryKey: socialKeys.requests, queryFn: api.fetchPendingRequests });
}

export function useRespondRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { followerId: string; approve: boolean }) =>
      v.approve ? api.approveFollow(v.followerId) : api.rejectFollow(v.followerId),
    onSettled: () => qc.invalidateQueries({ queryKey: socialKeys.requests }),
  });
}

export function useSearchProfiles(query: string) {
  return useQuery({
    queryKey: socialKeys.search(query),
    queryFn: () => api.searchProfiles(query),
    enabled: query.trim().length >= 2,
  });
}

export function useReport() {
  return useMutation({
    mutationFn: (v: { target: Parameters<typeof api.report>[0]; targetId: string; reason: string }) =>
      api.report(v.target, v.targetId, v.reason),
  });
}

export function useBlocked() {
  return useQuery({ queryKey: socialKeys.blocked, queryFn: api.fetchBlocked });
}

export function useToggleBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; blocked: boolean }) =>
      v.blocked ? api.unblock(v.userId) : api.block(v.userId),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: socialKeys.blocked });
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['follow'] });
    },
  });
}

/** 소식 목록. 화면을 열면 한 번 새로 읽는다 */
export function useNotifications() {
  return useQuery({ queryKey: socialKeys.notifications, queryFn: api.fetchNotifications });
}

/** 안 읽은 소식 수. 피드 탭에서 30초마다 확인한다 */
export function useUnreadCount() {
  return useQuery({
    queryKey: socialKeys.unread,
    queryFn: api.countUnreadNotifications,
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.markNotificationsRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: socialKeys.unread });
      qc.invalidateQueries({ queryKey: socialKeys.notifications });
    },
  });
}
