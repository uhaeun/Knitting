import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TourSheet } from '@/features/onboarding/TourSheet';
import { useTour } from '@/features/onboarding/useTour';
import { InstallBanner, InstallGuide } from '@/features/pwa/InstallGuide';
import { JournalIcon } from '@/shared/ui/JournalIcon';
import { GearButton } from '@/shared/ui/GearButton';
import { useInstall } from '@/features/pwa/useInstall';
import { CreateProjectSheet } from '@/features/project/CreateProjectSheet';
import { useProjects } from '@/features/project/queries';
import { PhotoCalendar } from '@/features/project/PhotoCalendar';
import { ProjectJournal } from '@/features/project/ProjectJournal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { color, fontSize, fontWeight, journalType, size, space } from '@/shared/ui/tokens';

/** 시안 1a / 1b — 편물 목록 (홈) */
export default function HomeScreen() {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const install = useInstall();
  const tour = useTour();

  // 처음 들어오면 사용법부터. 그걸 본 뒤에야 홈 화면 추가 안내를 띄운다
  const showInstall = installOpen || (tour.seen && install.autoOpen);
  const { create } = useLocalSearchParams<{ create?: string }>();

  // 편물이 없을 때 탭바 촬영 버튼이 ?create=1로 보낸다
  const closeCreate = () => {
    setSheetOpen(false);
    router.setParams({ create: undefined });
  };
  const projects = useProjects();
  const items = projects.data ?? [];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.masthead}>
        <View style={styles.brand}>
          <JournalIcon name="brand" tint={color.accent} dimension={size.journalMark} />
          <Text style={styles.brandName}>닛팅</Text>
        </View>
        <GearButton />
      </View>
      <ProjectJournal items={items}
        header={<>
          <PhotoCalendar onRecord={(id, recordId) => router.push({ pathname: '/project/[id]', params: { id, recordId } })} />
          <InstallBanner onOpen={() => setInstallOpen(true)} />
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>내 편물</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="편물 추가" onPress={() => setSheetOpen(true)}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
              <JournalIcon name="plus" tint={color.text} dimension={size.journalSmallGlyph} />
              <Text style={styles.addText}>새 편물</Text>
            </Pressable>
          </View>
        </>}
        emptyState={projects.isError ? <EmptyState title="목록을 불러오지 못했어요" description={String(projects.error)} /> :
          projects.isPending ? <ActivityIndicator accessibilityLabel="편물 불러오는 중" color={color.journalInk} /> :
          items.length === 0 ? <EmptyState title="첫 편물을 만들어 보세요" description="편물을 만들고 사진을 찍으면 월력에 담겨요."
            actionLabel="편물 만들기" onAction={() => setSheetOpen(true)} /> : undefined}
        onOpen={id => router.push({ pathname: '/project/[id]', params: { id } })}
        onCapture={id => router.push({ pathname: '/capture/[projectId]', params: { projectId: id } })} />

      <TourSheet visible={!tour.seen} onDone={tour.finish} />

      <InstallGuide visible={showInstall} onClose={() => { setInstallOpen(false); install.markSeen(); }} />

      <CreateProjectSheet
        visible={sheetOpen || create === '1'}
        onClose={closeCreate}
        onCreated={(id) => router.push({ pathname: '/project/[id]', params: { id } })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  masthead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl,
    paddingTop: space.sm, paddingBottom: space.xs, borderBottomWidth: size.hairline, borderColor: color.border },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  brandName: { color: color.journalInk, fontSize: fontSize.body, fontFamily: journalType.korean, fontWeight: journalType.medium },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm,
    paddingTop: space.lg, paddingBottom: space.xs },
  title: { color: color.journalInk, fontSize: fontSize.heading, fontFamily: journalType.korean, fontWeight: journalType.medium },
  addButton: { minHeight: size.tap, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  addText: { color: color.text, fontSize: fontSize.label, fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.75 },
});
