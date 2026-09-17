import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import type { Profile } from '@/shared/types/remote';

/** 로그인 세션 + 내 프로필. 서버 상태지만 앱 전역에서 동기적으로 읽어야 해서 Zustand에 둔다. */
type AuthState = {
  ready: boolean; // 세션 복원 시도 끝남
  session: Session | null;
  profile: Profile | null; // null이면 온보딩 필요
  setSession: (s: Session | null) => void;
  setProfile: (p: Profile | null) => void;
  setReady: () => void;
};

export const useAuth = create<AuthState>((set) => ({
  ready: false,
  session: null,
  profile: null,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setReady: () => set({ ready: true }),
}));

/** 서버 기능(피드·동기화)을 쓸 수 있는 상태인가 */
export const useIsOnline = () => useAuth((s) => !!s.session && !!s.profile);

export const useUserId = () => useAuth((s) => s.session?.user.id ?? null);
