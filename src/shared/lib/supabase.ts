import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** .env가 없으면 서버 기능(계정·동기화·피드)만 꺼지고 앱은 로컬로 동작한다. */
export const supabaseConfigured = Boolean(url && anon);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseConfigured || !url || !anon) throw new Error('서버 설정이 없어요 (.env의 EXPO_PUBLIC_SUPABASE_*)');
  if (!client) {
    client = createClient(url, anon, {
      auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
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
