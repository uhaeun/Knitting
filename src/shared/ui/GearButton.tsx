import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { JournalIcon } from '@/shared/ui/JournalIcon';
import { color, size } from '@/shared/ui/tokens';

export function GearButton() {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="설정"
      onPress={() => router.push('/settings')}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <JournalIcon name="settings" tint={color.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: size.tap, height: size.tap, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 },
});
