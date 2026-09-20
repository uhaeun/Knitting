import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import type { Profile } from '@/shared/types/remote';

/** 로그인 세션 + 내 프로필. 서버 상태지만 앱 전역에서 동기적으로 읽어야 해서 Zustand에 둔다. */
type AuthState = {
  ready: boolean; // 세션 복원 시도 끝남
  session: Session | null;
  profile: Profile | null; // null이면 온보딩 필요
  recovering: boolean; // 재설정 메일 링크로 들어옴. 비밀번호를 바꾸기 전에는 다른 화면으로 보내지 않는다
  recoveryError: string | null; // 링크가 만료된 경우
  setSession: (s: Session | null) => void;
  setProfile: (p: Profile | null) => void;
  setReady: () => void;
  setRecovering: (v: boolean, error?: string | null) => void;
};

export const useAuth = create<AuthState>((set) => ({
  ready: false,
  session: null,
  profile: null,
  recovering: false,
  recoveryError: null,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setReady: () => set({ ready: true }),
  setRecovering: (recovering, recoveryError = null) => set({ recovering, recoveryError }),
}));

/** 서버 기능(피드·동기화)을 쓸 수 있는 상태인가 */
export const useIsOnline = () => useAuth((s) => !!s.session && !!s.profile);

export const useUserId = () => useAuth((s) => s.session?.user.id ?? null);
