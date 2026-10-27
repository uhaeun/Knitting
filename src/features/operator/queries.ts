import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { useAuth } from '@/features/auth/store';
import { fetchAutomaticAudit, fetchManualAudit, fetchOperatorAccess, fetchOperatorCases, fetchOperatorRun, operatorSessionKey, previewManualCleanup, reportSnapshotIssue, requestManualCleanup } from './api';
import { OperatorPoller, type PollState } from './poller';
import { forgetOperatorData } from './cache';
import { useOperatorSecurity } from './security';
import { isProcessing, type RunSnapshot } from './snapshot';
const suspended = new Map<string, Pick<PollState, 'paused' | 'failures'>>();
useAuth.subscribe((state, previous) => {
  if (operatorSessionKey(state.session) !== operatorSessionKey(previous.session)) { suspended.clear();useOperatorSecurity.setState({ blocked: null }); }
});
function useSession() {
  const session = useAuth((s) => s.session);const key = operatorSessionKey(session);
  return key;
}
export function useOperatorAccess() {
  const session=useSession();const client=useQueryClient();const blocked=useOperatorSecurity((s)=>s.blocked===session && !!session);
  const query=useQuery({ queryKey: ['operator-access',session],enabled:!!session,queryFn:fetchOperatorAccess,retry:false,gcTime:0,staleTime:0 });
  useEffect(()=>{if(blocked)forgetOperatorData(client);},[blocked,client]);
  return {...query,blocked,recheckRights:async()=>{const reply=await query.refetch();if(session && reply.data?.allowed && !reply.isError)useOperatorSecurity.getState().clear(session);}};
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
  const blocked=useOperatorSecurity((s)=>!!session && s.blocked===session);
  const key = useMemo(() => ['operator-run', session, jobId] as const, [session, jobId]);
  const query = useQuery<RunSnapshot>({ queryKey: key, queryFn: skipToken, enabled: false, retry: false, gcTime: 0 });
  const meta = useMemo(() => createStore<PollState>(() => ({ fetching: false, unknown: true, failures: 0, paused: null, lastCheckedAt: null, ...(session && jobId ? suspended.get(`${session}:${jobId}`) : undefined) })), [session, jobId]);
  const state = useStore(meta);
  const holder=useRef<{session:string;jobId:string;poller:OperatorPoller}|null>(null);
  const appActive=useRef(true);
  const sync=useCallback(()=>holder.current?.poller.setActive(routeActive.current && appActive.current && (typeof document==='undefined' || document.visibilityState==='visible' && document.hasFocus())),[]);
  useFocusEffect(useCallback(()=>{
    routeActive.current=true;sync();return()=>{routeActive.current=false;sync();forgetOperatorData(client,key);};
  },[client,key,sync]));
  // Construct and destroy the controller in the same effect lifetime. React's
  // development effect replay must never reuse a permanently disposed instance.
  useEffect(()=>{
    if(!jobId || !session || !allowed)return;
    const identity=`${session}:${jobId}`;
    const controller=new OperatorPoller(jobId,{
      fetch:(nonce,signal)=>fetchOperatorRun(jobId,nonce,signal,session),
      accept:(s)=>{const previous=client.getQueryData<RunSnapshot>(key);client.setQueryData(key,s);if(!isProcessing(s) && previous?.status_version!==s.status_version)void client.invalidateQueries({queryKey:['operator-cases']});},
      clear:(reason)=>forgetOperatorData(client,reason==='auth'?undefined:key),
      change:(s)=>{meta.setState(s);if(s.paused || s.failures)suspended.set(identity,{paused:s.paused,failures:s.failures});else suspended.delete(identity);},
      report:(id,s)=>{void reportSnapshotIssue(jobId,id,s).catch(()=>undefined);},
    },suspended.get(identity));
    const entry={session,jobId,poller:controller};holder.current=entry;
    appActive.current=AppState.currentState!=='background' && AppState.currentState!=='inactive';
    const app=AppState.addEventListener('change',(s)=>{appActive.current=s==='active';sync();});
    if(typeof window!=='undefined'){window.addEventListener('focus',sync);window.addEventListener('blur',sync);document.addEventListener('visibilitychange',sync);}
    sync();return()=>{
      app.remove();if(typeof window!=='undefined'){window.removeEventListener('focus',sync);window.removeEventListener('blur',sync);document.removeEventListener('visibilitychange',sync);}
      controller.dispose();if(holder.current===entry)holder.current=null;
    };
  },[session,jobId,allowed,client,key,meta,sync]);
  useEffect(()=>{
    if(blocked && session && jobId){const failures=meta.getState().failures;suspended.set(`${session}:${jobId}`,{paused:'auth',failures});meta.setState({fetching:false,unknown:true,paused:'auth',lastCheckedAt:null});}
  },[blocked,session,jobId,meta]);
  return {data:allowed?query.data:undefined,...state,recheck:()=>{const entry=holder.current;if(entry?.session===session && entry.jobId===jobId)entry.poller.manual();}};

}

/** One fresh preview for each explicit dialog opening; never refetch on focus. */
export function useCleanupPreview(rid: string | null, confirmationId: string | null) {
  const session = useSession();return useQuery({ queryKey: ['operator-preview', session, rid, confirmationId], enabled: !!session && !!rid && !!confirmationId,
    queryFn: ({ signal }) => previewManualCleanup(rid!, signal), retry: false, gcTime: 0, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false });
}
export { operatorSessionKey } from './api';
