import { PASSWORD_MIN, resetRedirectUrl } from '@/features/auth/recovery';
import { LEGAL_VERSION } from '@/features/legal/policy';
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
 * 계정 삭제는 서버의 재시도 가능한 작업으로 수행한다.
 * 본인 파일의 부재를 확인한 뒤에만 Auth 계정과 종속 데이터를 정리한다.
 */
export async function deleteAccount(_userId: string): Promise<void> {
  const sb = getSupabase();
  const { data, error } = await sb.functions.invoke('delete-account', { body: {} });
  if (error || !(data as { completed?: boolean } | null)?.completed) {
    throw new Error('삭제를 완료하지 못했어요. 일부 파일은 이미 정리됐을 수 있어요. 다시 시도해 주세요.');
  }
  await sb.auth.signOut();
}

export type SocialProvider = 'google' | 'kakao';

export const SOCIAL_LABEL: Record<SocialProvider, string> = { google: '구글', kakao: '카카오' };

/**
 * 구글·카카오로 로그인. 그쪽 화면으로 갔다가 다시 앱으로 돌아온다.
 * 돌아온 주소의 토큰은 AuthProvider가 받아 로그인 처리한다.
 */
/**
 * 10월 MVP는 이메일·비밀번호만 노출한다. 기존 소셜 계정의 서버 설정은 변경하지 않는다.
 */
export async function fetchEnabledSocials(): Promise<SocialProvider[]> {
  return []; // AUTH-003: email/password only in the October MVP.
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

/** Password verification and the only username-changing capability live on the server. */
export async function changeUsername(username: string, password: string): Promise<Profile> {
  const { data, error } = await getSupabase().functions.invoke('change-username', { body: { username, password } });
  if (error) {
    const context = 'context' in error ? error.context as Response | undefined : undefined;
    const body = await context?.json().catch(() => null) as { error?: string } | null | undefined;
    throw new Error(body?.error ?? '아이디를 바꾸지 못했어요. 프로필을 다시 확인해 주세요.');
  }
  return (data as { profile: Profile }).profile;
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
