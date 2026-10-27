import { create } from 'zustand';
/** UI suspension only. No server payload, identity token or media is retained. */
export const useOperatorSecurity = create<{ blocked: string | null; deny: (session: string) => void; clear: (session: string) => void }>((set) => ({
  blocked: null, deny: (session) => set({ blocked: session }), clear: (session) => set((s) => s.blocked === session ? { blocked: null } : s),
}));
