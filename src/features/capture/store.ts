import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { GhostLevel } from '@/shared/ui/tokens';

export type CaptureMode = 'photo' | 'video';

/** 촬영 화면 로컬 설정. 이 기기에 기억한다 — 겹치기 진하기·격자·사진/영상은 사람마다 정해 두고 쓴다 */
type CaptureSettings = {
  ghost: GhostLevel;
  grid: boolean;
  mode: CaptureMode;
  setGhost: (g: GhostLevel) => void;
  toggleGrid: () => void;
  setMode: (m: CaptureMode) => void;
};

/** 시크릿 모드 등에서 localStorage가 막히면 기억하지 않고 기본값으로 쓴다 */
const safeStorage = createJSONStorage(() => {
  try {
    const probe = '__knitting_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
  }
});

export const useCaptureSettings = create<CaptureSettings>()(
  persist(
    (set) => ({
      ghost: 'low',
      grid: true,
      mode: 'photo',
      setGhost: (ghost) => set({ ghost }),
      toggleGrid: () => set((s) => ({ grid: !s.grid })),
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'knitting.capture',
      storage: safeStorage,
      partialize: (s) => ({ ghost: s.ghost, grid: s.grid, mode: s.mode }),
    },
  ),
);
