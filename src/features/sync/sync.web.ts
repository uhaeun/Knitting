/** 웹 전용. 웹은 Supabase가 원본이라 동기화할 것이 없다. store.ts가 같은 이름으로 부른다. */

export type SyncReport = { pushedProjects: number; pushedPosts: number; pulledProjects: number; pulledPosts: number };

export async function syncAll(_userId: string): Promise<SyncReport> {
  return { pushedProjects: 0, pushedPosts: 0, pulledProjects: 0, pulledPosts: 0 };
}
