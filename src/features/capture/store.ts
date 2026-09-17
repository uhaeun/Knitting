import { create } from 'zustand';

import type { GhostLevel } from '@/shared/ui/tokens';

export type CaptureMode = 'photo' | 'video';

/** 촬영 화면 로컬 설정. 세션 동안 유지. (서버 상태 아님 → Zustand) */
type CaptureSettings = {
  ghost: GhostLevel;
  grid: boolean;
  mode: CaptureMode;
  setGhost: (g: GhostLevel) => void;
  toggleGrid: () => void;
  setMode: (m: CaptureMode) => void;
};

export const useCaptureSettings = create<CaptureSettings>((set) => ({
  ghost: 'low',
  grid: true,
  mode: 'photo',
  setGhost: (ghost) => set({ ghost }),
  toggleGrid: () => set((s) => ({ grid: !s.grid })),
  setMode: (mode) => set({ mode }),
}));
