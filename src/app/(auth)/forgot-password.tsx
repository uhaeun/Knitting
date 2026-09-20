import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useRequestPasswordReset } from '@/features/auth/queries';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import { color, fontSize, fontWeight, space } from '@/shared/ui/tokens';

/** 비밀번호를 잊었을 때. 메일로 재설정 링크를 보낸다. */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRequestPasswordReset();
  const canSubmit = email.includes('@') && !request.isPending;

  const submit = () => {
    setError(null);
    request.mutate(email, {
      onSuccess: () => setSent(true),
      onError: (e) => setError(e instanceof Error ? e.message : String(e)),
    });
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.head}>
          <Text style={styles.title}>비밀번호 찾기</Text>
          <Text style={styles.hint}>
            {sent
              ? '메일을 보냈어요. 링크를 누르면 새 비밀번호를 정할 수 있어요. 10분 안에 눌러 주세요.'
              : '가입한 메일 주소를 적으면 재설정 링크를 보내 드려요.'}
          </Text>
        </View>

        {sent ? (
          <View style={styles.form}>
            <Text style={styles.sentTo}>{email.trim()}</Text>
            <Text style={styles.hint}>메일이 안 보이면 스팸함도 확인해 주세요.</Text>
            <Button label="로그인으로 돌아가기" large onPress={() => router.replace('/(auth)/sign-in')} />
            <Pressable accessibilityRole="button" onPress={() => setSent(false)} style={styles.switch}>
              <Text style={styles.switchText}>다른 주소로 다시 보내기</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <Field
              label="이메일"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              inputMode="email"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={canSubmit ? submit : undefined}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button label={request.isPending ? '보내는 중…' : '재설정 메일 보내기'} large disabled={!canSubmit} onPress={submit} />
            <Pressable accessibilityRole="button" onPress={() => router.replace('/(auth)/sign-in')} style={styles.switch}>
              <Text style={styles.switchText}>로그인으로 돌아가기</Text>
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
  sentTo: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: color.text },
  form: { gap: space.lg },
  error: { fontSize: fontSize.caption, color: color.danger },
  switch: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  switchText: { fontSize: fontSize.caption, color: color.textMuted },
});
