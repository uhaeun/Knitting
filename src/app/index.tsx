import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Field } from '@/shared/ui/Field';
import { ProjectCard } from '@/shared/ui/ProjectCard';
import { color, fontSize, fontWeight, space } from '@/shared/ui/tokens';

// 임시: 공통 컴포넌트 확인용. 3단계(로컬 저장) 뒤 편물 목록으로 교체한다.
export default function ComponentPreview() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState('');

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>내 편물</Text>

        <ProjectCard
          name="회색 라글란 스웨터"
          subtitle="27일째 · 8월 8일 시작"
          photoCount={24}
          onPress={() => {}}
        />
        <ProjectCard name="엄마 목도리" subtitle="52일째 · 7월 14일 시작" photoCount={41} onPress={() => {}} />
        <ProjectCard name="양말 한 켤레" subtitle="6일째 · 8월 29일 시작" photoCount={6} onPress={() => {}} />

        <View style={styles.row}>
          <Button label="주요" onPress={() => setSheetOpen(true)} />
          <Button label="보조" variant="secondary" onPress={() => {}} />
        </View>

        <View style={styles.emptyBox}>
          <EmptyState
            title="첫 편물을 만들어 보세요"
            description="매일 같은 각도로 한 장씩. 사진이 쌓이면 편물이 자라나는 영상이 됩니다."
            actionLabel="편물 만들기"
            onAction={() => setSheetOpen(true)}
          />
        </View>
      </ScrollView>

      <BottomSheet visible={sheetOpen} title="편물 만들기" onClose={() => setSheetOpen(false)}>
        <Field label="편물 이름" value={name} onChangeText={setName} placeholder="예: 회색 라글란 스웨터" />
        <Button label="만들기" large onPress={() => setSheetOpen(false)} style={styles.sheetAction} />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, gap: space.md },
  title: {
    fontSize: fontSize.title,
    fontWeight: fontWeight.semibold,
    color: color.text,
    letterSpacing: -0.5,
    marginBottom: space.xs,
  },
  row: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  emptyBox: { height: 320 },
  sheetAction: { marginTop: space.sm },
});
