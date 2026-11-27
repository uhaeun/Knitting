import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOnline } from '@/features/auth/store';
import { useProjects } from '@/features/project/queries';
import { JournalIcon, type JournalIconName } from '@/shared/ui/JournalIcon';
import { showAlert } from '@/shared/lib/dialog';
import { color, fontSize, fontWeight, size, space } from '@/shared/ui/tokens';

/** 편물 · 피드 · 촬영(가운데) · 탐색 · 나. 로그인 안 했으면 서버 탭은 숨긴다. */
export default function TabsLayout() {
  const online = useIsOnline();
  // 홈 화면 앱으로 열면 아래 인디케이터 영역이 겹친다. 그만큼 탭바를 키운다
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.journalInk,
        tabBarInactiveTintColor: color.textMuted,
        tabBarStyle: [styles.bar, { height: styles.bar.height + insets.bottom, paddingBottom: insets.bottom }],
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        sceneStyle: { backgroundColor: color.bg },
      }}
    >
      <Tabs.Screen name="projects" options={{ title: '월력', tabBarIcon: tabIcon('calendar') }} />
      <Tabs.Screen name="index" options={{ title: '피드', href: online ? undefined : null, tabBarIcon: tabIcon('feed') }} />
      <Tabs.Screen name="capture" options={{ title: '촬영', tabBarButton: () => <CaptureButton /> }} />
      <Tabs.Screen name="explore" options={{ title: '탐색', href: online ? undefined : null, tabBarIcon: tabIcon('explore') }} />
      <Tabs.Screen name="me" options={{ title: '나', tabBarIcon: tabIcon('me') }} />
    </Tabs>
  );
}

/** 탭바 가운데 촬영 버튼. 최근 편물로 바로 간다. */
function CaptureButton() {
  const router = useRouter();
  const projects = useProjects();
  const go = () => {
    const list = projects.data ?? [];
    const open = (id: string) => router.push({ pathname: '/capture/[projectId]', params: { projectId: id } });
    if (list.length === 0) return router.push({ pathname: '/projects', params: { create: '1' } });
    if (list.length === 1 && list[0]) return open(list[0].id);
    // 여럿이면 어느 편물에 찍을지 고른다 (최근에 만든 순, 5개까지)
    showAlert('어느 편물을 찍을까요?', undefined, [
      ...list.slice(0, 5).map((p) => ({ text: p.name, onPress: () => open(p.id) })),
      { text: '취소', style: 'cancel' as const },
    ]);
  };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="촬영" onPress={go} style={styles.captureButton}>
      <JournalIcon name="camera" tint={color.textMuted} />
      <Text style={styles.captureLabel}>촬영</Text>
    </Pressable>
  );
}

function tabIcon(name: JournalIconName) {
  return function TabIcon({ focused }: { focused: boolean }) {
    return (
      <View style={styles.slot}>
        <JournalIcon name={name} tint={focused ? color.journalInk : color.textMuted} selected={focused} />
        {focused && <View style={styles.underline} />}
      </View>
    );
  };
}

const styles = StyleSheet.create({
  bar: { backgroundColor: color.bg, borderTopWidth: size.hairline, borderTopColor: color.border,
    height: size.journalTabHeight, paddingTop: space.xs },
  label: { fontSize: fontSize.caption, fontWeight: fontWeight.regular },
  item: { minHeight: size.tap },
  slot: { alignItems: 'center', justifyContent: 'center' },
  underline: { position: 'absolute', bottom: -space.xs, width: space.md, height: size.tick.width, backgroundColor: color.journalInk },
  captureButton: { flex: 1, minHeight: size.tap, alignItems: 'center', justifyContent: 'center', gap: space.xs },
  captureLabel: { color: color.textMuted, fontSize: fontSize.caption },
});
