import { create } from 'zustand';

import type { GhostLevel } from '@/shared/ui/tokens';

/** 촬영 화면 로컬 설정. 세션 동안 유지. (서버 상태 아님 → Zustand) */
type CaptureSettings = {
  ghost: GhostLevel;
  grid: boolean;
  setGhost: (g: GhostLevel) => void;
  toggleGrid: () => void;
};

export const useCaptureSettings = create<CaptureSettings>((set) => ({
  ghost: 'low',
  grid: true,
  setGhost: (ghost) => set({ ghost }),
  toggleGrid: () => set((s) => ({ grid: !s.grid })),
}));
