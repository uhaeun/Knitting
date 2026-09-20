/** 비밀번호 재설정 메일 링크 다루기. 화면 없이 테스트할 수 있게 순수 함수로 둔다. */

export type Recovery =
  | { kind: 'tokens'; type: 'recovery' | 'signup' | 'oauth'; accessToken: string; refreshToken: string }
  | { kind: 'error'; message: string };

/**
 * Supabase 메일 링크는 #access_token=...&type=recovery(비밀번호 재설정) 또는 type=signup(가입 확인) 꼴로 돌아온다.
 * 만료·재사용이면 #error=...&error_code=otp_expired.
 */
export function parseRecovery(url: string): Recovery | null {
  const hash = url.split('#')[1];
  if (!hash) return null;
  const p = new URLSearchParams(hash);
  if (p.get('error')) return { kind: 'error', message: recoveryError(p.get('error_code'), p.get('error_description')) };
  const accessToken = p.get('access_token');
  const refreshToken = p.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  const raw = p.get('type');
  // 구글·카카오에서 돌아올 때는 type이 없다. 그냥 로그인으로 본다
  const type = raw === 'recovery' || raw === 'signup' ? raw : raw === null ? 'oauth' : null;
  if (!type) return null;
  return { kind: 'tokens', type, accessToken, refreshToken };
}

function recoveryError(code: string | null, description: string | null): string {
  if (code === 'otp_expired' || /expired/i.test(description ?? '')) return '링크가 만료됐어요. 다시 보내 주세요.';
  return '링크를 쓸 수 없어요. 다시 보내 주세요.';
}

/** 서버(Supabase) 설정과 같은 값이어야 한다. 대시보드 Authentication → Policies에서도 8로 맞춘다 */
export const PASSWORD_MIN = 8;

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN) return `비밀번호는 ${PASSWORD_MIN}자 이상`;
  if (password !== confirm) return '두 번 입력한 비밀번호가 달라요';
  return null;
}

/** 메일 링크가 돌아올 주소. 앱 안에서는 웹 주소로 보낸다 (앱은 메일 링크를 받을 수 없다) */
export const SITE_URL = 'https://knitting-pied.vercel.app';

export function resetRedirectUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin && !window.location.origin.startsWith('capacitor')) {
    return window.location.origin;
  }
  return SITE_URL;
}
