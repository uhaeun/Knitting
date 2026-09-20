/**
 * 앱에서 터진 오류를 서버(client_errors)에 남긴다. 바깥 서비스로 보내지 않는다.
 * - 같은 오류가 쏟아질 때를 대비해 같은 문구는 1분에 한 번만 보낸다
 * - 오류 보고가 또 오류를 내면 조용히 포기한다 (화면을 방해하지 않는다)
 */
import { nativePlatform } from '@/shared/lib/platform';
import { getSupabase, supabaseConfigured } from '@/shared/lib/supabase';

const RECENT_MS = 60_000;
const recent = new Map<string, number>();

export function shouldReport(key: string, now: number = Date.now()): boolean {
  const last = recent.get(key);
  if (last !== undefined && now - last < RECENT_MS) return false;
  recent.set(key, now);
  // 오래된 것은 버린다 (메모리에 쌓이지 않게)
  for (const [k, t] of recent) if (now - t > RECENT_MS) recent.delete(k);
  return true;
}

/** 서버에 넣기 전 잘라내는 규칙. 길이 제한은 DB와 같다 */
export function trimForReport(input: {
  message: string;
  stack?: string | null;
  where?: string | null;
  agent?: string | null;
}) {
  const cut = (v: string | null | undefined, n: number) => (v ? v.slice(0, n) : null);
  return {
    message: (input.message || '알 수 없는 오류').slice(0, 500),
    stack: cut(input.stack, 4000),
    where_at: cut(input.where, 200),
    agent: cut(input.agent, 300),
  };
}

export async function reportError(error: unknown, where?: string): Promise<void> {
  if (!supabaseConfigured) return;
  const err = error instanceof Error ? error : new Error(String(error));
  const row = trimForReport({
    message: err.message,
    stack: err.stack,
    where: where ?? (typeof location !== 'undefined' ? location.pathname : null),
    agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  });
  if (!shouldReport(row.message)) return;

  try {
    const sb = getSupabase();
    const me = (await sb.auth.getUser()).data.user;
    await sb.from('client_errors').insert({
      ...row,
      user_id: me?.id ?? null,
      app: nativePlatform() ?? 'web',
    });
  } catch {
    // 보고 실패는 삼킨다. 오류 때문에 오류를 내면 안 된다
  }
}

/** 앱 시작 때 한 번. 어디서도 잡지 못한 오류를 줍는다 */
export function installErrorReporter(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => void reportError(e.error ?? e.message, location.pathname));
  window.addEventListener('unhandledrejection', (e) => void reportError(e.reason, location.pathname));
}
