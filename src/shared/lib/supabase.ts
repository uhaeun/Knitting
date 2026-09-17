import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** .env가 없으면 아무것도 쓸 수 없다. _layout이 설정 안내 화면을 보여 준다. */
export const supabaseConfigured = Boolean(url && anon);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseConfigured || !url || !anon) throw new Error('서버 설정이 없어요 (.env의 EXPO_PUBLIC_SUPABASE_*)');
  if (!client) {
    client = createClient(url, anon, {
      // 로그인 세션은 브라우저 localStorage에 둔다 (supabase-js 기본값)
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    });
  }
  return client;
}

export const PHOTOS_BUCKET = 'photos';

/** 서버 Storage 경로 규칙: {owner}/{project}/{post}.jpg · _t.jpg */
export function remotePhotoPath(ownerId: string, projectId: string, postId: string): string {
  return `${ownerId}/${projectId}/${postId}.jpg`;
}
export function remoteThumbPath(ownerId: string, projectId: string, postId: string): string {
  return `${ownerId}/${projectId}/${postId}_t.jpg`;
}
