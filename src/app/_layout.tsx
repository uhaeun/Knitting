import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { color } from '@/shared/ui/tokens';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.bg },
        }}
      />
    </>
  );
}
