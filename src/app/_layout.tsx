import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { AuthProvider } from '@/features/auth/AuthProvider';
import { useAuth } from '@/features/auth/store';
import { cleanupOrphanFiles } from '@/features/capture/repository';
import { syncInBackground } from '@/features/sync/store';
import { supabaseConfigured } from '@/shared/lib/supabase';
import { EmptyState } from '@/shared/ui/EmptyState';
import { color, size } from '@/shared/ui/tokens';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
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
      <AuthProvider>
        <StatusBar style="dark" />
        <View style={Platform.OS === 'web' ? styles.webPage : styles.fill}>
          <View style={Platform.OS === 'web' ? styles.webColumn : styles.fill}>
            <AuthGate />
          </View>
        </View>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/** 세션·프로필 상태에 따라 로그인 → 온보딩 → 앱 순으로 보낸다. */
function AuthGate() {
  const { ready, session, profile, localOnly } = useAuth();
  const segments = useSegments();
  const inAuthGroup = segments[0] === '(auth)';

  // 로그인 직후 서버에 안 올라간 로컬 데이터를 밀어 올린다
  useEffect(() => {
    if (session && profile) syncInBackground(session.user.id);
  }, [session, profile]);

  if (!ready) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={color.accent} />
      </View>
    );
  }

  // 웹은 서버가 원본이다. 서버 설정 없이는 쓸 수 있는 것이 없다
  if (Platform.OS === 'web' && !supabaseConfigured) {
    return (
      <View style={styles.splash}>
        <EmptyState
          title="서버 설정이 필요해요"
          description="웹 버전은 사진을 서버에 저장합니다. .env에 EXPO_PUBLIC_SUPABASE_URL과 ANON_KEY를 넣어 주세요."
        />
      </View>
    );
  }

  const needsSignIn = supabaseConfigured && !session && !localOnly;
  const needsOnboarding = !!session && !profile;

  if (needsSignIn && !inAuthGroup) return <Redirect href="/(auth)/sign-in" />;
  if (needsOnboarding && segments[1] !== 'onboarding') return <Redirect href="/(auth)/onboarding" />;
  if (!needsSignIn && !needsOnboarding && inAuthGroup) return <Redirect href="/projects" />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}>
      <Stack.Screen name="(auth)/sign-in" />
      <Stack.Screen name="(auth)/onboarding" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="project/[id]" />
      <Stack.Screen name="post/[id]" />
      <Stack.Screen name="user/[username]" />
      <Stack.Screen name="settings/index" />
      <Stack.Screen name="settings/blocked" />
      <Stack.Screen name="settings/requests" />
      <Stack.Screen name="capture/[projectId]" options={{ presentation: 'fullScreenModal' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  webPage: { flex: 1, backgroundColor: color.bg },
  // 웹: 넓은 창에서도 폰 너비 한 칸 가운데에. 양옆은 경계선으로 구분 (그림자 금지)
  webColumn: {
    flex: 1, width: '100%', maxWidth: size.webColumn, alignSelf: 'center',
    borderLeftWidth: size.hairline, borderRightWidth: size.hairline, borderColor: color.border,
  },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg },
});
