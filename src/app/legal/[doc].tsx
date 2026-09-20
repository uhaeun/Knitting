import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LEGAL_DOCS } from '@/features/legal/policy';
import { EmptyState } from '@/shared/ui/EmptyState';
import { color, fontSize, fontWeight, space } from '@/shared/ui/tokens';

/** 약관·개인정보처리방침 읽기 화면. 본문은 features/legal/policy.ts 한 곳에서 온다. */
export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const router = useRouter();
  const found = doc === 'terms' || doc === 'privacy' ? LEGAL_DOCS[doc] : null;

  if (!found) {
    return (
      <SafeAreaView style={styles.root}>
        <EmptyState title="문서를 찾을 수 없어요" description="주소가 잘못됐습니다." actionLabel="뒤로" onAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.tap}>
          <View style={styles.chevron} />
        </Pressable>
        <Text style={styles.headerTitle}>{found.title}</Text>
        <View style={styles.tap} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>{found.intro}</Text>
        {found.sections.map((s) => (
          <View key={s.heading} style={styles.section}>
            <Text style={styles.heading}>{s.heading}</Text>
            {s.body.map((line) => (
              <Text key={line} style={styles.line}>{line}</Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm },
  headerTitle: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: color.text },
  tap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  chevron: { width: 10, height: 10, borderTopWidth: 2, borderLeftWidth: 2, borderColor: color.text, transform: [{ rotate: '-45deg' }] },
  content: { padding: space.xl, gap: space.xl, paddingBottom: space.xxxl },
  intro: { fontSize: fontSize.caption, color: color.textMuted },
  section: { gap: space.sm },
  heading: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: color.text },
  line: { fontSize: fontSize.label, color: color.text, lineHeight: fontSize.label * 1.7 },
});
