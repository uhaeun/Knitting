/**
 * 확인 메일을 기다리는 주소를 이 기기에 적어 둔다.
 * 실제 서버는 "확인 안 된 계정"이라고 알려주지 않고 "맞지 않아요"로만 답하기 때문에,
 * 방금 가입한 주소로 로그인이 실패하면 메일부터 확인하라고 알려 주려고 쓴다.
 */
const KEY = 'knitting.pendingConfirm';

export function rememberPending(email: string): void {
  try {
    localStorage.setItem(KEY, email.trim().toLowerCase());
  } catch {
    // 사파리 비공개 모드 등. 기억 못 해도 가입은 된다
  }
}

export function isPending(email: string): boolean {
  try {
    return localStorage.getItem(KEY) === email.trim().toLowerCase();
  } catch {
    return false;
  }
}

export function forgetPending(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 지우지 못해도 로그인에는 영향이 없다
  }
}
