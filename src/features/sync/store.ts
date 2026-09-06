import { create } from 'zustand';

import { unsyncedCount } from '@/features/project/repository';
import { syncAll, type SyncReport } from '@/features/sync/sync';
import { supabaseConfigured } from '@/shared/lib/supabase';

type SyncState = {
  status: 'idle' | 'syncing' | 'ok' | 'error';
  message: string | null;
  lastAt: string | null;
  pending: number;
  refreshPending: () => void;
  run: (userId: string) => Promise<SyncReport | null>;
};

/** 동기화 상태. 화면은 pending·status만 보여주고 run()을 부른다. 동시 실행은 막는다. */
export const useSync = create<SyncState>((set, get) => ({
  status: 'idle',
  message: null,
  lastAt: null,
  pending: 0,
  refreshPending: () => set({ pending: safeCount() }),
  run: async (userId) => {
    if (!supabaseConfigured || get().status === 'syncing') return null;
    set({ status: 'syncing', message: null });
    try {
      const r = await syncAll(userId);
      set({ status: 'ok', lastAt: new Date().toISOString(), pending: safeCount(), message: null });
      return r;
    } catch (e) {
      set({ status: 'error', message: e instanceof Error ? e.message : String(e), pending: safeCount() });
      return null;
    }
  },
}));

function safeCount(): number {
  try {
    return unsyncedCount();
  } catch {
    return 0;
  }
}

/** 저장 직후 등에서 부르는 best-effort 동기화. 실패해도 조용히 pending만 남긴다. */
export function syncInBackground(userId: string | null): void {
  if (!userId) return;
  void useSync.getState().run(userId);
}
