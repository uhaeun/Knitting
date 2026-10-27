import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { useAuth } from '@/features/auth/store';
import { fetchAutomaticAudit, fetchManualAudit, fetchOperatorAccess, fetchOperatorCases, fetchOperatorRun, operatorSessionKey, previewManualCleanup, reportSnapshotIssue, requestManualCleanup } from './api';
import { OperatorPoller, type PollState } from './poller';
import type { RunSnapshot } from './snapshot';
const suspended = new Map<string, Pick<PollState, 'paused' | 'failures'>>();
useAuth.subscribe((state, previous) => {
  if (operatorSessionKey(state.session) !== operatorSessionKey(previous.session)) suspended.clear();
});
function useSession() {
  const session = useAuth((s) => s.session);const key = operatorSessionKey(session);
  return key;
}
export function useOperatorAccess() {
  const session = useSession();return useQuery({ queryKey: ['operator-access', session], enabled: !!session, queryFn: fetchOperatorAccess, retry: false, gcTime: 0, staleTime: 0 });
}
export function useOperatorCases(allowed: boolean) {
  const session = useSession();return useQuery({ queryKey: ['operator-cases', session], enabled: !!session && allowed, queryFn: fetchOperatorCases, retry: false, gcTime: 0 });
}
export function useOperatorAudit(runId: string | null, allowed: boolean, version?: string) {
  const session = useSession();return useQuery({ queryKey: ['operator-audit', session, runId, version], enabled: !!session && !!runId && allowed, queryFn: () => fetchManualAudit(runId!), retry: false, gcTime: 0 });
}
export function useAutomaticAudit(rid: string | null) {
  const session = useSession();return useQuery({ queryKey: ['operator-auto-audit', session, rid], enabled: !!session && !!rid, queryFn: () => fetchAutomaticAudit(rid!), retry: false, gcTime: 0 });
}
export function useRequestManualCleanup() {
  const client = useQueryClient();return useMutation({ mutationFn: requestManualCleanup, retry: false, onSuccess: () => client.invalidateQueries({ queryKey: ['operator-cases'] }) });
}
export function useOperatorRun(jobId: string | null, allowed: boolean) {
  const session = useSession();const client = useQueryClient();const routeActive = useRef(false);
  const key = useMemo(() => ['operator-run', session, jobId] as const, [session, jobId]);
  const query = useQuery<RunSnapshot>({ queryKey: key, queryFn: skipToken, enabled: false, retry: false, gcTime: 0 });
  const meta = useMemo(() => createStore<PollState>(() => ({ fetching: false, unknown: true, failures: 0, paused: null, lastCheckedAt: null, ...(session && jobId ? suspended.get(`${session}:${jobId}`) : undefined) })), [session, jobId]);
  const state = useStore(meta);
  const poller = useMemo(() => {
    if (!jobId || !session || !allowed) return null;
    const identity = `${session}:${jobId}`;
    return new OperatorPoller(jobId, {
      fetch: (nonce, signal) => fetchOperatorRun(jobId, nonce, signal, session),
      accept: (s) => client.setQueryData(key, s),
      clear: (reason) => {
        if (reason === 'auth') { const predicate = (q: { queryKey: readonly unknown[] }) => String(q.queryKey[0]).startsWith('operator-');void client.cancelQueries({ predicate });client.removeQueries({ predicate }); }
        else client.removeQueries({ queryKey: key, exact: true });
      },
      change: (s) => { meta.setState(s);if (s.paused || s.failures) suspended.set(identity, { paused: s.paused, failures: s.failures });else suspended.delete(identity); },
      report: (id, s) => { void reportSnapshotIssue(jobId, id, s).catch(() => undefined); },
    }, suspended.get(identity));
  }, [session, jobId, allowed, client, key, meta]);
  useEffect(() => () => poller?.dispose(), [poller]);
  useFocusEffect(useCallback(() => {
    routeActive.current = true;if (!poller) return () => { routeActive.current = false; };
    let appActive = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
    const sync = () => poller.setActive(routeActive.current && appActive && (typeof document === 'undefined' || document.visibilityState === 'visible' && document.hasFocus()));
    const app = AppState.addEventListener('change', (s) => { appActive = s === 'active';sync(); });
    if (typeof window !== 'undefined') { window.addEventListener('focus', sync);window.addEventListener('blur', sync);document.addEventListener('visibilitychange', sync); }
    sync();return () => {
      routeActive.current = false;app.remove();if (typeof window !== 'undefined') { window.removeEventListener('focus', sync);window.removeEventListener('blur', sync);document.removeEventListener('visibilitychange', sync); }
      poller.setActive(false);client.removeQueries({ queryKey: key, exact: true });
    };
  }, [poller, client, key]));
  return { data: allowed ? query.data : undefined, ...state, recheck: () => poller?.manual() };
}

/** One fresh preview for each explicit dialog opening; never refetch on focus. */
export function useCleanupPreview(rid: string | null, confirmationId: string | null) {
  const session = useSession();return useQuery({ queryKey: ['operator-preview', session, rid, confirmationId], enabled: !!session && !!rid && !!confirmationId,
    queryFn: ({ signal }) => previewManualCleanup(rid!, signal), retry: false, gcTime: 0, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false });
}
export { operatorSessionKey } from './api';
