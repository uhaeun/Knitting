import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOnline } from '@/features/auth/store';
import { useProjects } from '@/features/project/queries';
import { color, fontSize, fontWeight, radius, size, space } from '@/shared/ui/tokens';

/** 편물 · 피드 · 촬영(가운데) · 탐색 · 나. 로그인 안 했으면 서버 탭은 숨긴다. */
export default function TabsLayout() {
  const online = useIsOnline();
  // 홈 화면 앱으로 열면 아래 인디케이터 영역이 겹친다. 그만큼 탭바를 키운다
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.textMuted,
        tabBarStyle: [styles.bar, { height: styles.bar.height + insets.bottom, paddingBottom: insets.bottom }],
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        sceneStyle: { backgroundColor: color.bg },
      }}
    >
      <Tabs.Screen
        name="projects"
        options={{ title: '편물', tabBarIcon: ({ color: c, focused }) => (
            <Selected on={focused}>
              <Glyph kind="list" tint={c} />
            </Selected>
          ) }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: '피드',
          href: online ? undefined : null,
          tabBarIcon: ({ color: c, focused }) => (
            <Selected on={focused}>
              <Glyph kind="feed" tint={c} />
            </Selected>
          ),
        }}
      />
      <Tabs.Screen
        name="capture"
        options={{ title: '', tabBarIcon: () => <ShutterIcon />, tabBarButton: (p) => <CaptureButton {...p} /> }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: '탐색',
          href: online ? undefined : null,
          tabBarIcon: ({ color: c, focused }) => (
            <Selected on={focused}>
              <Glyph kind="search" tint={c} />
            </Selected>
          ),
        }}
      />
      <Tabs.Screen
        name="me"
        options={{ title: '나', tabBarIcon: ({ color: c, focused }) => (
            <Selected on={focused}>
              <Glyph kind="me" tint={c} />
            </Selected>
          ) }}
      />
    </Tabs>
  );
}

/** 탭바 가운데 촬영 버튼. 최근 편물로 바로 간다. */
function CaptureButton(_props: object) {
  const router = useRouter();
  const projects = useProjects();
  const go = () => {
    const first = projects.data?.[0];
    if (first) router.push({ pathname: '/capture/[projectId]', params: { projectId: first.id } });
    else router.push({ pathname: '/projects', params: { create: '1' } });
  };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="촬영" onPress={go} style={styles.captureButton}>
      <ShutterIcon />
    </Pressable>
  );
}

function ShutterIcon() {
  return (
    <View style={styles.shutter}>
      <View style={styles.shutterRing} />
    </View>
  );
}

/** 아이콘 폰트를 안 쓴다. 토큰 색만 참조하는 단순 도형. */
/** 지금 보고 있는 탭은 아이콘 뒤에 알약 배경을 깐다. 색만으로는 눈에 잘 안 띈다 */
function Selected({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <View style={[styles.slot, on && styles.slotOn]}>{children}</View>;
}

function Glyph({ kind, tint }: { kind: 'list' | 'feed' | 'search' | 'me'; tint: ColorValue }) {
  if (kind === 'list') return <View style={[styles.glyphBox, { borderColor: tint }]} />;
  if (kind === 'feed') {
    return (
      <View style={styles.glyphStack}>
        <View style={[styles.glyphLine, { backgroundColor: tint }]} />
        <View style={[styles.glyphLine, { backgroundColor: tint, width: 10 }]} />
        <View style={[styles.glyphLine, { backgroundColor: tint }]} />
      </View>
    );
  }
  if (kind === 'search') return <View style={[styles.glyphCircle, { borderColor: tint }]} />;
  return (
    <View style={styles.glyphMe}>
      <View style={[styles.glyphHead, { borderColor: tint }]} />
      <View style={[styles.glyphBody, { borderColor: tint }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: color.bg,
    borderTopWidth: size.hairline,
    borderTopColor: color.border,
    height: 84,
    paddingTop: space.sm,
  },
  label: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold },
  item: { paddingTop: 2 },
  slot: {
    width: 44, height: 28, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  slotOn: { backgroundColor: color.accentSoft },
  captureButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: space.sm },
  shutter: {
    width: size.tap, height: size.tap, borderRadius: radius.pill,
    backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center',
  },
  shutterRing: { width: 16, height: 16, borderRadius: radius.pill, borderWidth: 2, borderColor: color.onDark },
  glyphBox: { width: 18, height: 14, borderWidth: 1.5, borderRadius: 2 },
  glyphStack: { gap: 3, alignItems: 'flex-start' },
  glyphLine: { width: 16, height: 2, borderRadius: 1 },
  glyphCircle: { width: 16, height: 16, borderWidth: 1.5, borderRadius: radius.pill },
  glyphMe: { alignItems: 'center', gap: 2 },
  glyphHead: { width: 8, height: 8, borderWidth: 1.5, borderRadius: radius.pill },
  glyphBody: { width: 16, height: 8, borderWidth: 1.5, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
});
