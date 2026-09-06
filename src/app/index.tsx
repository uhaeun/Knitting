import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, fontSize, fontWeight, space } from '@/shared/ui/tokens';

// 임시 화면. 2단계(공통 컴포넌트) 뒤 편물 목록으로 교체한다.
export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>내 편물</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.md },
  title: {
    fontSize: fontSize.title,
    fontWeight: fontWeight.semibold,
    color: color.text,
    letterSpacing: -0.5,
  },
});
