import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/store';
import { fetchResultCleanup } from './resultsRepository';
export function useResultCleanup() {
  const user = useAuth((s) => s.session?.user.id);
  return useQuery({ queryKey: ['results', 'cleanup', user], enabled: !!user,
    queryFn: fetchResultCleanup, staleTime: 60_000, gcTime: 0, retry: false });
}
