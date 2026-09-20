import { PASSWORD_MIN, resetRedirectUrl } from '@/features/auth/recovery';
import { LEGAL_VERSION } from '@/features/legal/policy';
import { getSupabase, PHOTOS_BUCKET } from '@/shared/lib/supabase';
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

/**
 * 가입. 이메일 확인이 켜져 있으면 세션 없이 돌아온다 → 화면이 "메일을 확인해 주세요"를 보여 준다.
 * 확인 메일의 링크를 누르면 AuthProvider가 주소의 토큰으로 로그인시킨다.
 */
export async function signUp(email: string, password: string): Promise<{ needsConfirm: boolean }> {
  const { data, error } = await getSupabase().auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: resetRedirectUrl() },
  });
  if (error) throw new Error(friendlyAuthError(error.message));
  return { needsConfirm: !data.session };
}

/** 확인 메일 다시 보내기 */
export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await getSupabase().auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: resetRedirectUrl() },
  });
  if (error) throw new Error(friendlyAuthError(error.message));
}

/** 재설정 메일 보내기. 가입 안 된 주소여도 Supabase는 성공으로 답한다 (계정 유무를 알려주지 않으려고) */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: resetRedirectUrl() });
  if (error) throw new Error(friendlyAuthError(error.message));
}

/**
 * 설정에서 비밀번호 바꾸기. 지금 비밀번호를 먼저 확인한다
 * (폰을 잠깐 빌려준 사이에 남이 바꾸지 못하게. Supabase는 세션만 있으면 그냥 바꿔 준다).
 */
export async function changePassword(email: string, current: string, next: string): Promise<void> {
  const { error: wrong } = await getSupabase().auth.signInWithPassword({ email, password: current });
  if (wrong) throw new Error('지금 비밀번호가 맞지 않아요');
  await updatePassword(next);
}

/** 메일 링크로 들어온 세션에서 새 비밀번호로 바꾼다 */
export async function updatePassword(password: string): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ password });
  if (error) throw new Error(friendlyAuthError(error.message));
}

/**
 * 계정 삭제. Storage 파일을 먼저 지우고(주인만 지울 수 있다) 서버 함수로 계정을 지운다.
 * auth.users가 사라지면 프로필·편물·기록·댓글·팔로우가 cascade로 함께 사라진다.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const sb = getSupabase();
  await removeMyFiles(userId);
  const { error } = await sb.rpc('delete_my_account');
  if (error) throw new Error(`계정을 지우지 못했어요: ${error.message}`);
  await sb.auth.signOut();
}

/** photos 버킷의 {uid}/{project}/{post} 파일을 모두 지운다. 실패해도 계정 삭제는 계속한다 */
async function removeMyFiles(userId: string): Promise<void> {
  const sb = getSupabase();
  try {
    const { data: folders } = await sb.storage.from(PHOTOS_BUCKET).list(userId);
    const paths: string[] = [];
    for (const folder of folders ?? []) {
      const { data: files } = await sb.storage.from(PHOTOS_BUCKET).list(`${userId}/${folder.name}`);
      for (const f of files ?? []) paths.push(`${userId}/${folder.name}/${f.name}`);
    }
    // 한 번에 너무 많이 보내지 않는다
    for (let i = 0; i < paths.length; i += 100) {
      await sb.storage.from(PHOTOS_BUCKET).remove(paths.slice(i, i + 100));
    }
  } catch (e) {
    console.warn('[account] 파일 삭제 실패, 계정 삭제는 계속합니다', e);
  }
}

export type SocialProvider = 'google' | 'kakao';

export const SOCIAL_LABEL: Record<SocialProvider, string> = { google: '구글', kakao: '카카오' };

/**
 * 구글·카카오로 로그인. 그쪽 화면으로 갔다가 다시 앱으로 돌아온다.
 * 돌아온 주소의 토큰은 AuthProvider가 받아 로그인 처리한다.
 */
/**
 * 서버에서 켜 둔 로그인 방법만 알아 온다. 안 켠 버튼을 누르면 낯선 오류 화면으로 가버려서
 * 화면에는 켜진 것만 보여 준다 (대시보드에서 켜면 앱을 고치지 않아도 나타난다).
 */
export async function fetchEnabledSocials(): Promise<SocialProvider[]> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
  if (!res.ok) return [];
  const body = (await res.json()) as { external?: Record<string, boolean> };
  return (['kakao', 'google'] as SocialProvider[]).filter((p) => body.external?.[p]);
}

export async function signInWithSocial(provider: SocialProvider): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider,
    options: { redirectTo: resetRedirectUrl() },
  });
  if (error) throw new Error(friendlyAuthError(error.message));
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
  // 가입할 때 동의한 약관 판을 같이 남긴다 (나중에 약관이 바뀌면 누가 옛 판에 동의했는지 알 수 있다)
  const { data, error } = await getSupabase()
    .from('profiles')
    .insert({ ...input, display_name: input.display_name.trim(), eula_version: LEGAL_VERSION })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('이미 쓰고 있는 아이디예요');
    throw new Error(error.message);
  }
  return data as Profile;
}

export async function updateProfile(id: string, patch: Partial<Pick<Profile, 'display_name' | 'bio' | 'is_private' | 'avatar_path'>>): Promise<Profile> {
  const { data, error } = await getSupabase().from('profiles').update(patch).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  return data as Profile;
}

function friendlyAuthError(m: string): string {
  if (/invalid login credentials/i.test(m)) return '이메일 또는 비밀번호가 맞지 않아요';
  if (/email not confirmed/i.test(m)) return '메일의 확인 링크를 먼저 눌러 주세요';
  if (/password should be at least/i.test(m)) return `비밀번호는 ${PASSWORD_MIN}자 이상`;
  if (/already registered/i.test(m)) return '이미 가입된 이메일이에요. 로그인해 주세요';
  if (/rate limit|too many requests|after \d+ seconds/i.test(m)) return '잠시 후 다시 시도해 주세요';
  // 실제 서버는 example.com 같은 주소를 거부한다
  if (/email address.*invalid|invalid email|email_address_invalid/i.test(m)) return '쓸 수 없는 메일 주소예요. 실제로 받을 수 있는 주소를 적어 주세요';
  if (/signups? not allowed|signup is disabled/i.test(m)) return '지금은 가입을 받지 않아요';
  if (/provider is not enabled|unsupported provider/i.test(m)) return '아직 준비 중인 로그인 방법이에요';
  if (/new password should be different/i.test(m)) return '지금 쓰는 비밀번호와 다른 것으로 정해 주세요';
  if (/auth session missing|session.*expired/i.test(m)) return '링크가 만료됐어요. 다시 보내 주세요.';
  return m;
}
