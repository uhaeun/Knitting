import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/Button';
import { color, fontSize, space } from '@/shared/ui/tokens';

// 임시. 5단계에서 촬영 화면으로 교체.
export default function CaptureScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.text}>촬영 (5단계) · {projectId}</Text>
      <Button label="닫기" variant="secondary" onPress={() => router.back()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.cameraBg, padding: space.xl, gap: space.lg },
  text: { fontSize: fontSize.caption, color: color.onDarkMuted },
});
