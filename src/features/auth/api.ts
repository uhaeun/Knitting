import { getSupabase } from '@/shared/lib/supabase';
import type { Profile } from '@/shared/types/remote';

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** 순수 함수. 테스트 가능. */
export function validateUsername(u: string): string | null {
  if (!USERNAME_RE.test(u)) return '영문 소문자·숫자·밑줄 3~20자';
  return null;
}
export function validateDisplayName(n: string): string | null {
  const t = n.trim();
  if (t.length < 1 || t.length > 30) return '1~30자';
  return null;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(friendlyAuthError(error.message));
}

export async function signUp(email: string, password: string): Promise<void> {
  const { data, error } = await getSupabase().auth.signUp({ email: email.trim(), password });
  if (error) throw new Error(friendlyAuthError(error.message));
  if (!data.session) throw new Error('가입은 됐지만 로그인되지 않았어요. 대시보드에서 Confirm email이 꺼져 있는지 확인해 주세요.');
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
}

export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await getSupabase().from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Profile | null) ?? null;
}

export async function createProfile(input: {
  id: string;
  username: string;
  display_name: string;
  is_private: boolean;
}): Promise<Profile> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .insert({ ...input, display_name: input.display_name.trim() })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('이미 쓰고 있는 아이디예요');
    throw new Error(error.message);
  }
  return data as Profile;
}

export async function updateProfile(id: string, patch: Partial<Pick<Profile, 'display_name' | 'bio' | 'is_private'>>): Promise<Profile> {
  const { data, error } = await getSupabase().from('profiles').update(patch).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  return data as Profile;
}

function friendlyAuthError(m: string): string {
  if (/invalid login credentials/i.test(m)) return '이메일 또는 비밀번호가 맞지 않아요';
  if (/password should be at least/i.test(m)) return '비밀번호는 6자 이상';
  if (/already registered/i.test(m)) return '이미 가입된 이메일이에요. 로그인해 주세요';
  if (/rate limit/i.test(m)) return '잠시 후 다시 시도해 주세요';
  return m;
}
