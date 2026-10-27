import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { forgetOperatorData } from '../cache';
it('clears privileged data while keeping the live observer usable for an explicit fresh response',()=>{
  const client=new QueryClient();const key=['operator-run','session','job'];const observer=new QueryObserver(client,{queryKey:key,enabled:false,queryFn:async()=>{throw new Error('must not fetch');}});
  const stop=observer.subscribe(()=>undefined);client.setQueryData(key,{version:'1'});client.setQueryData(['operator-audit','session'],['private']);client.setQueryData(['ordinary'],['keep']);
  expect(observer.getCurrentResult().data).toEqual({version:'1'});forgetOperatorData(client);
  expect(observer.getCurrentResult().data).toBeUndefined();expect(client.getQueryData(['operator-audit','session'])).toBeUndefined();expect(client.getQueryData(['ordinary'])).toEqual(['keep']);
  client.setQueryData(key,{version:'2'});expect(observer.getCurrentResult().data).toEqual({version:'2'});stop();client.clear();
});
it('cancels pending reads, ignores their late response and creates no automatic recovery request',async()=>{
  const client=new QueryClient();let finish:((data:string)=>void)|undefined;const fetch=jest.fn(()=>new Promise<string>(resolve=>{finish=resolve;}));
  const key=['operator-cases','session'];const observer=new QueryObserver(client,{queryKey:key,queryFn:fetch,retry:false});const stop=observer.subscribe(()=>undefined);
  expect(fetch).toHaveBeenCalledTimes(1);forgetOperatorData(client);finish!('stale');await Promise.resolve();await Promise.resolve();
  expect(fetch).toHaveBeenCalledTimes(1);expect(client.getQueryData(key)).toBeUndefined();expect(observer.getCurrentResult().data).toBeUndefined();
  client.setQueryData(key,'fresh explicit read');expect(observer.getCurrentResult().data).toBe('fresh explicit read');stop();client.clear();
});
