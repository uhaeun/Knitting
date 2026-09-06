import { useEffect, type ReactNode } from 'react';

import { fetchMyProfile } from '@/features/auth/api';
import { useAuth } from '@/features/auth/store';
import { getSupabase, supabaseConfigured } from '@/shared/lib/supabase';

/** 앱 시작 시 세션 복원, 이후 auth 변화를 스토어에 반영. 프로필도 같이 읽는다. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { setSession, setProfile, setReady } = useAuth();

  useEffect(() => {
    if (!supabaseConfigured) {
      setReady();
      return;
    }
    const sb = getSupabase();
    let cancelled = false;

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
      setSession(session);
      void load(session?.user.id);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [setProfile, setReady, setSession]);

  return <>{children}</>;
}
