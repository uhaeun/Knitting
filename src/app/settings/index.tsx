import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signOut } from '@/features/auth/api';
import { useUpdateProfile } from '@/features/auth/queries';
import { useAuth } from '@/features/auth/store';
import { usePendingRequests } from '@/features/social/queries';
import { DeleteAccountSheet } from '@/features/auth/DeleteAccountSheet';
import { EditProfileSheet } from '@/features/auth/EditProfileSheet';
import { TourSheet } from '@/features/onboarding/TourSheet';
import { ReminderSettings } from '@/features/reminder/ReminderSettings';
import { useTour } from '@/features/onboarding/useTour';
import { InstallGuide, useInstallGuideEntry } from '@/features/pwa/InstallGuide';
import { SUPPORT_EMAIL } from '@/features/legal/policy';
import { showAlert } from '@/shared/lib/dialog';
import { isNativeApp } from '@/shared/lib/platform';
import { color, fontSize, fontWeight, radius, size, space } from '@/shared/ui/tokens';


export default function SettingsScreen() {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const installEntry = useInstallGuideEntry();
  const [tourOpen, setTourOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const tour = useTour();
  const { session, profile } = useAuth();
  const update = useUpdateProfile();
  const requests = usePendingRequests();

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.tap}>
          <View style={styles.chevron} />
        </Pressable>
        <Text style={styles.barTitle}>설정</Text>
        <View style={styles.tap} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {profile ? (
          <Section title="계정">
            <Link label={`프로필 편집 · ${profile.display_name}`} onPress={() => setEditOpen(true)} />
            <Row label="아이디" value={`@${profile.username}`} />
            <Row label="이메일" value={session?.user.email ?? '–'} />
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.rowLabel}>비공개 계정</Text>
                <Text style={styles.hint}>승인한 사람만 내 편물을 볼 수 있어요</Text>
              </View>
              <Switch
                value={profile.is_private}
                disabled={update.isPending}
                onValueChange={(v) =>
                  update.mutate({ id: profile.id, patch: { is_private: v } }, {
                    onError: (e) => showAlert('바꾸지 못했어요', e instanceof Error ? e.message : String(e)),
                  })
                }
                trackColor={{ true: color.accent, false: color.border }}
              />
            </View>
            <Link
              label="팔로우 요청"
              badge={requests.data?.length ? String(requests.data.length) : undefined}
              onPress={() => router.push('/settings/requests')}
            />
            <Link label="차단한 사람" onPress={() => router.push('/settings/blocked')} />
            <Link label="휴지통" onPress={() => router.push('/settings/trash')} />
            {isNativeApp() ? null : <Link label={installEntry.label} onPress={installEntry.onPress(() => setInstallOpen(true))} />}
            <Link label="닛팅 쓰는 법 다시 보기" onPress={() => setTourOpen(true)} />
          </Section>
        ) : null}

        <Section title="촬영 알림">
          <ReminderSettings />
        </Section>

        <Section title="약관과 문의">
          <Text style={styles.policy}>
            불쾌한 콘텐츠와 괴롭힘에 무관용입니다. 신고된 게시물은 검토 후 조치하며, 3회 이상 신고되면 자동으로 숨겨집니다.
            차단한 사람의 게시물은 서로에게 보이지 않습니다.
          </Text>
          <Link label="이용약관" onPress={() => router.push('/legal/terms')} />
          <Link label="개인정보처리방침" onPress={() => router.push('/legal/privacy')} />
          <Link label={`문의: ${SUPPORT_EMAIL}`} onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
        </Section>

        {session ? (
          <Section title="">
            <Link label="로그아웃" danger onPress={() => void signOut().then(() => router.replace('/(auth)/sign-in'))} />
            <Link label="계정 삭제" danger onPress={() => setDeleteOpen(true)} />
          </Section>
        ) : null}
      </ScrollView>

      <EditProfileSheet visible={editOpen} onClose={() => setEditOpen(false)} />
      <DeleteAccountSheet visible={deleteOpen} onClose={() => setDeleteOpen(false)} />
      <TourSheet visible={tourOpen} onDone={() => { setTourOpen(false); tour.finish(); }} />
      <InstallGuide visible={installOpen} onClose={() => setInstallOpen(false)} />
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Link({ label, onPress, badge, danger }: { label: string; onPress: () => void; badge?: string; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <Text style={[styles.rowLabel, danger && styles.danger]}>{label}</Text>
      {badge ? <Text style={styles.badge}>{badge}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingTop: space.sm },
  tap: { width: size.tap, height: size.tap, alignItems: 'center', justifyContent: 'center' },
  chevron: {
    width: 12, height: 12, borderLeftWidth: 2, borderBottomWidth: 2,
    borderColor: color.text, transform: [{ rotate: '45deg' }], marginLeft: 4,
  },
  barTitle: { flex: 1, textAlign: 'center', fontSize: fontSize.label, fontWeight: fontWeight.semibold, color: color.text },
  content: { padding: space.xl, gap: space.xl },
  section: { gap: space.sm },
  sectionTitle: { fontSize: fontSize.caption, color: color.textMuted, paddingHorizontal: space.xs },
  card: {
    backgroundColor: color.surface, borderWidth: size.hairline, borderColor: color.border,
    borderRadius: 12, paddingHorizontal: space.md,
  },
  row: {
    minHeight: size.tap + 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: space.md, paddingVertical: space.sm,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  switchText: { flex: 1, gap: space.xs },
  rowLabel: { fontSize: fontSize.body, color: color.text },
  rowValue: { flex: 1, textAlign: 'right', fontSize: fontSize.caption, color: color.textMuted },
  hint: { fontSize: fontSize.caption, color: color.textMuted },
  danger: { color: color.danger },
  badge: { fontSize: fontSize.caption, color: color.accent, fontWeight: fontWeight.semibold },
  policy: {
    fontSize: fontSize.caption, color: color.textMuted, lineHeight: fontSize.caption * 1.7,
    paddingVertical: space.md,
  },
});
