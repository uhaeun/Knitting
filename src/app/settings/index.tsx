import { useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signOut } from '@/features/auth/api';
import { useUpdateProfile } from '@/features/auth/queries';
import { useAuth } from '@/features/auth/store';
import { usePendingRequests } from '@/features/social/queries';
import { useSync } from '@/features/sync/store';
import { showAlert } from '@/shared/lib/dialog';
import { color, fontSize, fontWeight, size, space } from '@/shared/ui/tokens';

const SUPPORT_EMAIL = 'haeunmine@gmail.com';

export default function SettingsScreen() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const update = useUpdateProfile();
  const sync = useSync();
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
          </Section>
        ) : null}

        <Section title="데이터">
          <Row
            label="동기화 상태"
            value={sync.pending > 0 ? `올릴 것 ${sync.pending}개` : sync.status === 'error' ? '실패' : '서버와 같음'}
          />
          {session ? <Link label="지금 동기화" onPress={() => void sync.run(session.user.id)} /> : null}
        </Section>

        <Section title="약관과 문의">
          <Text style={styles.policy}>
            불쾌한 콘텐츠와 괴롭힘에 무관용입니다. 신고된 게시물은 검토 후 조치하며, 3회 이상 신고되면 자동으로 숨겨집니다.
            차단한 사람의 게시물은 서로에게 보이지 않습니다.
          </Text>
          <Link label={`문의: ${SUPPORT_EMAIL}`} onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
        </Section>

        {session ? (
          <Section title="">
            <Link label="로그아웃" danger onPress={() => void signOut().then(() => router.replace('/(auth)/sign-in'))} />
            <Link
              label="계정 삭제"
              danger
              onPress={() =>
                showAlert(
                  '계정을 삭제할까요?',
                  `아직 앱에서 바로 지울 수 없어요. ${SUPPORT_EMAIL}로 요청하시면 처리해 드립니다.`,
                  [
                    { text: '취소', style: 'cancel' },
                    { text: '메일 쓰기', onPress: () => void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=계정 삭제 요청`) },
                  ],
                )
              }
            />
          </Section>
        ) : null}
      </ScrollView>
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
