import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { color, radius, size } from '@/shared/ui/tokens';

/** 설정으로 가는 톱니 버튼. 아이콘 글꼴 없이 도형으로 그린다 */
export function GearButton() {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="설정"
      onPress={() => router.push('/settings')}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Gear />
    </Pressable>
  );
}

function Gear() {
  // 톱니 8개 + 가운데 고리
  return (
    <View style={styles.gear}>
      {[0, 45, 90, 135].map((deg) => (
        <View key={deg} style={[styles.tooth, { transform: [{ rotate: `${deg}deg` }] }]} />
      ))}
      <View style={styles.ring} />
      <View style={styles.hole} />
    </View>
  );
}

const G = 20;
const styles = StyleSheet.create({
  button: {
    width: size.tap, height: size.tap, borderRadius: radius.button,
    borderWidth: size.hairline, borderColor: color.border, backgroundColor: color.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  pressed: { borderColor: color.accent },
  gear: { width: G, height: G, alignItems: 'center', justifyContent: 'center' },
  tooth: { position: 'absolute', width: G, height: 4.5, borderRadius: 1.5, backgroundColor: color.text },
  ring: { position: 'absolute', width: G - 5, height: G - 5, borderRadius: radius.pill, backgroundColor: color.text },
  hole: { position: 'absolute', width: 6.5, height: 6.5, borderRadius: radius.pill, backgroundColor: color.surface },
});
