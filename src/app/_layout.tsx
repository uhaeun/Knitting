import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { cleanupOrphanFiles } from '@/features/capture/repository';
import { color } from '@/shared/ui/tokens';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: 0 } }, // 로컬 DB: 캐시 무효화로만 갱신
});

export default function RootLayout() {
  useEffect(() => {
    try {
      const n = cleanupOrphanFiles();
      if (n > 0) console.log(`[files] 고아 파일 ${n}개 정리`);
    } catch (e) {
      console.warn('[files] 고아 파일 정리 실패', e);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="project/[id]" />
        <Stack.Screen name="capture/[projectId]" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
    </QueryClientProvider>
  );
}
