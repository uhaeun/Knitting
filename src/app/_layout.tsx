import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AuthProvider } from '@/features/auth/AuthProvider';
import { useAuth } from '@/features/auth/store';
import { supabaseConfigured } from '@/shared/lib/supabase';
import { EmptyState } from '@/shared/ui/EmptyState';
import { color, size } from '@/shared/ui/tokens';
import { DialogHost } from '@/shared/ui/DialogHost';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="dark" />
        <View style={styles.page}>
          <View style={styles.column}>
            <AuthGate />
          </View>
        </View>
        <DialogHost />
      </AuthProvider>
    </QueryClientProvider>
  );
}

/** 앱을 연 뒤 첫 화면을 한 번만 정한다 (피드 탭을 누를 때마다 튕기면 안 된다) */
let landed = false;

/** 세션·프로필 상태에 따라 로그인 → 온보딩 → 앱 순으로 보낸다. */
function AuthGate() {
  const { ready, session, profile, recovering } = useAuth();
  const segments = useSegments();
  const inAuthGroup = segments[0] === '(auth)';

  if (!ready) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={color.accent} />
      </View>
    );
  }

  // 서버가 원본이다. 서버 설정 없이는 쓸 수 있는 것이 없다
  if (!supabaseConfigured) {
    return (
      <View style={styles.splash}>
        <EmptyState
          title="서버 설정이 필요해요"
          description="사진을 서버에 저장합니다. .env에 EXPO_PUBLIC_SUPABASE_URL과 ANON_KEY를 넣어 주세요."
        />
      </View>
    );
  }

  // 재설정 메일 링크로 들어왔으면 비밀번호를 바꾸기 전까지 이 화면에 머문다
  const onResetScreen = segments[0] === 'reset-password';
  if (recovering && !onResetScreen) return <Redirect href="/reset-password" />;
  if (recovering) return <ResetStack />;
  // 비밀번호를 바꾸고 나면 이 화면에 머물 이유가 없다
  if (onResetScreen && session) return <Redirect href="/projects" />;

  const needsSignIn = !session;
  const needsOnboarding = !!session && !profile;

  if (needsSignIn && !inAuthGroup) return <Redirect href="/(auth)/sign-in" />;
  if (needsOnboarding && segments[1] !== 'onboarding') return <Redirect href="/(auth)/onboarding" />;
  if (!needsSignIn && !needsOnboarding && inAuthGroup) return <Redirect href="/projects" />;
  // 앱을 열었을 때 첫 화면은 편물 목록 (주소가 '/'면 피드가 되는데, 아직 팔로우가 없으면 빈 화면이다).
  // 게시물 링크처럼 다른 주소로 들어오면 그대로 둔다
  if (!needsSignIn && !needsOnboarding && !landed) {
    landed = true;
    const atRoot = segments[0] === '(tabs)' && (segments.length === 1 || (segments as string[])[1] === 'index');
    if (atRoot) return <Redirect href="/projects" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}>
      <Stack.Screen name="(auth)/sign-in" />
      <Stack.Screen name="(auth)/forgot-password" />
      <Stack.Screen name="(auth)/onboarding" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="project/[id]" />
      <Stack.Screen name="post/[id]" />
      <Stack.Screen name="user/[username]" />
      <Stack.Screen name="settings/index" />
      <Stack.Screen name="settings/blocked" />
      <Stack.Screen name="settings/requests" />
      <Stack.Screen name="capture/[projectId]" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="result/[projectId]" />
    </Stack>
  );
}

/** 재설정 중에는 이 화면만 띄운다 */
function ResetStack() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}>
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.bg },
  // 넓은 창(데스크톱·VS Code)에서도 폰 너비 한 칸 가운데에. 양옆은 경계선으로 구분 (그림자 금지)
  column: {
    flex: 1, width: '100%', maxWidth: size.webColumn, alignSelf: 'center',
    borderLeftWidth: size.hairline, borderRightWidth: size.hairline, borderColor: color.border,
  },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg },
});
