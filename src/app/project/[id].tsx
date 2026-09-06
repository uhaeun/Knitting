import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/Button';
import { color, fontSize, space } from '@/shared/ui/tokens';

// 임시. 6단계에서 타임라인으로 교체.
export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.text}>타임라인 (6단계) · {id}</Text>
      <Button label="뒤로" variant="secondary" onPress={() => router.back()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, padding: space.xl, gap: space.lg },
  text: { fontSize: fontSize.caption, color: color.textMuted },
});
