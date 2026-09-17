import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signOut, validateDisplayName, validateUsername } from '@/features/auth/api';
import { useCreateProfile } from '@/features/auth/queries';
import { useAuth } from '@/features/auth/store';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import { color, fontSize, fontWeight, space } from '@/shared/ui/tokens';

/** 가입 직후 프로필이 없을 때. username + 표시 이름 + 공개 여부. */
export default function OnboardingScreen() {
  const session = useAuth((s) => s.session);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateProfile();

  const usernameError = username ? validateUsername(username) : null;
  const nameError = displayName ? validateDisplayName(displayName) : null;
  const canSubmit = !!username && !!displayName && !usernameError && !nameError && !create.isPending;

  const submit = () => {
    if (!session) return;
    setError(null);
    create.mutate(
      { id: session.user.id, username: username.toLowerCase(), display_name: displayName, is_private: isPrivate },
      { onError: (e) => setError(e instanceof Error ? e.message : String(e)) },
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.head}>
            <Text style={styles.title}>프로필 만들기</Text>
            <Text style={styles.subtitle}>다른 사람에게 보이는 이름이에요. 나중에 바꿀 수 있어요.</Text>
          </View>

          <Field
            label="아이디"
            value={username}
            onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="knitter_haeun"
            autoCapitalize="none"
            maxLength={20}
          />
          {usernameError ? <Text style={styles.hint}>{usernameError}</Text> : null}

          <Field
            label="표시 이름"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="하은"
            maxLength={30}
          />
          {nameError ? <Text style={styles.hint}>{nameError}</Text> : null}

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>비공개 계정</Text>
              <Text style={styles.hint}>켜면 승인한 사람만 내 편물을 볼 수 있어요</Text>
            </View>
            <Switch
              value={isPrivate}
              onValueChange={setIsPrivate}
              trackColor={{ true: color.accent, false: color.border }}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label={create.isPending ? '만드는 중…' : '시작하기'} large disabled={!canSubmit} onPress={submit} />

          <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signOut}>
            <Text style={styles.hint}>다른 계정으로 로그인</Text>
          </Pressable>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  fill: { flex: 1 },
  content: { flexGrow: 1, padding: space.xl, gap: space.lg, justifyContent: 'center' },
  head: { gap: space.sm, marginBottom: space.sm },
  title: { fontSize: fontSize.title, fontWeight: fontWeight.semibold, color: color.text, letterSpacing: -0.5 },
  subtitle: { fontSize: fontSize.label, color: color.textMuted, lineHeight: fontSize.label * 1.6 },
  hint: { fontSize: fontSize.caption, color: color.textMuted },
  error: { fontSize: fontSize.caption, color: color.danger },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  rowText: { flex: 1, gap: space.xs },
  rowTitle: { fontSize: fontSize.body, color: color.text },
  signOut: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
});
