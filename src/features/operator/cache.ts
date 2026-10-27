import type { QueryClient, QueryKey } from '@tanstack/react-query';
/** Clear payloads without detaching live observers or causing a refetch.
 * Removing an observed disabled query leaves it watching a discarded instance. */
export function forgetOperatorData(client: QueryClient, key?: QueryKey) {
  const filters=key?{queryKey:key,exact:true}:{predicate:(q:{queryKey:readonly unknown[]})=>String(q.queryKey[0]).startsWith('operator-') && q.queryKey[0]!=='operator-access'};
  client.getQueryCache().findAll(filters).forEach((query)=>query.reset());
}
