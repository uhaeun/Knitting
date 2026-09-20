import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';

import { fetchMyProfile } from '@/features/auth/api';
import { parseRecovery } from '@/features/auth/recovery';
import { useAuth } from '@/features/auth/store';
import { getSupabase, supabaseConfigured } from '@/shared/lib/supabase';

/** 앱 시작 시 세션 복원, 이후 auth 변화를 스토어에 반영. 프로필도 같이 읽는다. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { setSession, setProfile, setReady, setRecovering } = useAuth();
  const queryClient = useQueryClient();
  const lastUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!supabaseConfigured) {
      setReady();
      return;
    }
    const sb = getSupabase();
    let cancelled = false;

    // 재설정 메일 링크로 들어왔으면 주소의 토큰으로 세션을 만들고, 주소창은 깨끗이 비운다
    const fromLink = typeof window !== 'undefined' ? parseRecovery(window.location.href) : null;
    if (fromLink) {
      window.history.replaceState(null, '', window.location.pathname);
      if (fromLink.kind === 'error') {
        setRecovering(true, fromLink.message);
      } else {
        setRecovering(true);
        void sb.auth.setSession({ access_token: fromLink.accessToken, refresh_token: fromLink.refreshToken });
      }
    }

    const load = async (userId: string | undefined) => {
      if (!userId) {
        setProfile(null);
        return;
      }
      try {
        const p = await fetchMyProfile(userId);
        if (!cancelled) setProfile(p);
      } catch (e) {
        console.warn('[auth] 프로필 읽기 실패', e);
      }
    };

    sb.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      await load(data.session?.user.id);
      setReady();
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      // 로그아웃·계정 전환 시 이전 계정의 편물·서명 URL이 캐시로 보이지 않게
      const userId = session?.user.id ?? null;
      if (lastUserId.current !== undefined && lastUserId.current !== userId) queryClient.clear();
      lastUserId.current = userId;
      setSession(session);
      void load(session?.user.id);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [queryClient, setProfile, setReady, setRecovering, setSession]);

  return <>{children}</>;
}
