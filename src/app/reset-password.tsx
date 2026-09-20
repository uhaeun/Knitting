import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signOut } from '@/features/auth/api';
import { useUpdatePassword } from '@/features/auth/queries';
import { PASSWORD_MIN, validateNewPassword } from '@/features/auth/recovery';
import { useAuth } from '@/features/auth/store';
import { showAlert } from '@/shared/lib/dialog';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import { color, fontSize, fontWeight, space } from '@/shared/ui/tokens';

/** 재설정 메일 링크로 들어온 화면. 새 비밀번호를 정한다. (auth) 밖에 있어서 로그인 판정에 밀리지 않는다. */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const linkError = useAuth((s) => s.recoveryError);
  const setRecovering = useAuth((s) => s.setRecovering);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const update = useUpdatePassword();

  const invalid = password || confirm ? validateNewPassword(password, confirm) : null;
  const canSubmit = !invalid && password.length >= PASSWORD_MIN && !update.isPending;

  const submit = () => {
    setError(null);
    update.mutate(password, {
      // 바꾸면 recovering이 꺼지고 _layout이 편물 목록으로 보낸다
      onSuccess: () => showAlert('비밀번호를 바꿨어요'),
      onError: (e) => setError(e instanceof Error ? e.message : String(e)),
    });
  };

  const giveUp = () => {
    setRecovering(false);
    void signOut();
    router.replace('/(auth)/sign-in');
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.head}>
          <Text style={styles.title}>{linkError ? '링크를 쓸 수 없어요' : '새 비밀번호'}</Text>
          <Text style={styles.hint}>{linkError ?? '앞으로 로그인할 때 쓸 비밀번호를 정해 주세요.'}</Text>
        </View>

        {linkError ? (
          <Button label="다시 보내기" large onPress={giveUp} />
        ) : (
          <View style={styles.form}>
            <Field
              label="새 비밀번호"
              value={password}
              onChangeText={setPassword}
              placeholder={`${PASSWORD_MIN}자 이상`}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              autoFocus
            />
            <Field
              label="한 번 더"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="같은 비밀번호"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              returnKeyType="done"
              onSubmitEditing={canSubmit ? submit : undefined}
            />
            {invalid || error ? <Text style={styles.error}>{invalid ?? error}</Text> : null}
            <Button label={update.isPending ? '바꾸는 중…' : '비밀번호 바꾸기'} large disabled={!canSubmit} onPress={submit} />
            <Pressable accessibilityRole="button" onPress={giveUp} style={styles.switch}>
              <Text style={styles.switchText}>나중에 할게요</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { flexGrow: 1, padding: space.xl, justifyContent: 'center', gap: space.xxxl },
  head: { gap: space.sm },
  title: { fontSize: fontSize.title, fontWeight: fontWeight.semibold, color: color.text },
  hint: { fontSize: fontSize.label, color: color.textMuted, lineHeight: fontSize.label * 1.6 },
  form: { gap: space.lg },
  error: { fontSize: fontSize.caption, color: color.danger },
  switch: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  switchText: { fontSize: fontSize.caption, color: color.textMuted },
});
