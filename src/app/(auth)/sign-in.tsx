import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useResendConfirmation, useSignIn, useSignUp } from '@/features/auth/queries';
import { Checkbox } from '@/shared/ui/Checkbox';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import { color, fontSize, fontWeight, space } from '@/shared/ui/tokens';

/** 이메일 + 비밀번호. Apple·Google 로그인은 콘솔 설정이 끝난 뒤 추가한다. */
export default function SignInScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null); // 확인 메일을 보낸 주소

  const signIn = useSignIn();
  const signUp = useSignUp();
  const resend = useResendConfirmation();
  const busy = signIn.isPending || signUp.isPending;
  const canSubmit = email.includes('@') && password.length >= 6 && !busy && (mode === 'in' || agreed);

  const submit = () => {
    setError(null);
    if (mode === 'in') {
      signIn.mutate({ email, password }, { onError: (e) => setError(e instanceof Error ? e.message : String(e)) });
      return;
    }
    signUp.mutate(
      { email, password },
      {
        // 이메일 확인이 켜져 있으면 세션이 없다. 메일을 기다리는 화면으로 바꾼다
        onSuccess: (r) => { if (r.needsConfirm) setSentTo(email.trim()); },
        onError: (e) => setError(e instanceof Error ? e.message : String(e)),
      },
    );
    // 확인이 꺼져 있으면 AuthProvider가 세션을 받아 _layout이 알아서 화면을 바꾼다
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.growing}>
              {[10, 16, 24, 34].map((h) => (
                <View key={h} style={[styles.bar, { height: h }]} />
              ))}
            </View>
            <Text style={styles.title}>닛팅</Text>
            <Text style={styles.subtitle}>
              편물을 같은 각도로 찍어 두면{'\n'}자라나는 영상이 됩니다
            </Text>
          </View>

          {sentTo ? (
            <View style={styles.form}>
              <Text style={styles.subtitle}>
                {sentTo}로 확인 메일을 보냈어요.{'\n'}메일의 링크를 누르면 가입이 끝나요.
              </Text>
              <Text style={styles.hint}>메일이 안 보이면 스팸함도 확인해 주세요.</Text>
              <Button
                label={resend.isPending ? '보내는 중…' : '메일 다시 보내기'}
                large
                variant="secondary"
                disabled={resend.isPending}
                onPress={() =>
                  resend.mutate(sentTo, {
                    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
                  })
                }
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable accessibilityRole="button" onPress={() => { setSentTo(null); setMode('in'); setError(null); }} style={styles.switch}>
                <Text style={styles.switchText}>로그인으로 돌아가기</Text>
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
            />
            <Field
              label="비밀번호"
              value={password}
              onChangeText={setPassword}
              placeholder="6자 이상"
              secureTextEntry
              autoCapitalize="none"
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              returnKeyType="done"
              onSubmitEditing={canSubmit ? submit : undefined}
            />
            {mode === 'up' ? (
              <Checkbox checked={agreed} onChange={setAgreed} label="약관과 개인정보처리방침에 동의합니다">
                <View style={styles.legalLinks}>
                  <Pressable accessibilityRole="button" onPress={() => router.push('/legal/terms')}>
                    <Text style={styles.legalLink}>이용약관 보기</Text>
                  </Pressable>
                  <Text style={styles.legalDot}>·</Text>
                  <Pressable accessibilityRole="button" onPress={() => router.push('/legal/privacy')}>
                    <Text style={styles.legalLink}>개인정보처리방침 보기</Text>
                  </Pressable>
                </View>
              </Checkbox>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              label={busy ? '잠시만요…' : mode === 'in' ? '로그인' : '가입하기'}
              large
              disabled={!canSubmit}
              onPress={submit}
            />
            {mode === 'in' ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/(auth)/forgot-password')} style={styles.switch}>
                <Text style={styles.switchText}>비밀번호를 잊었어요</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMode(mode === 'in' ? 'up' : 'in');
                setError(null);
              }}
              style={styles.switch}
            >
              <Text style={styles.switchText}>
                {mode === 'in' ? '계정이 없어요, 가입할게요' : '이미 계정이 있어요'}
              </Text>
            </Pressable>
          </View>
          )}

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  fill: { flex: 1 },
  content: { flexGrow: 1, padding: space.xl, justifyContent: 'center', gap: space.xxxl },
  hero: { alignItems: 'center', gap: space.md },
  growing: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs, opacity: 0.35 },
  bar: { width: 3, backgroundColor: color.text },
  title: { fontSize: fontSize.title, fontWeight: fontWeight.semibold, color: color.text, letterSpacing: -0.5 },
  subtitle: {
    fontSize: fontSize.label,
    color: color.textMuted,
    textAlign: 'center',
    lineHeight: fontSize.label * 1.6,
  },
  form: { gap: space.lg },
  error: { fontSize: fontSize.caption, color: color.danger },
  hint: { fontSize: fontSize.caption, color: color.textMuted, textAlign: 'center' },
  legalLinks: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  legalLink: { fontSize: fontSize.caption, color: color.textMuted, textDecorationLine: 'underline' },
  legalDot: { fontSize: fontSize.caption, color: color.textMuted },
  switch: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  switchText: { fontSize: fontSize.caption, color: color.textMuted },
  skip: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  skipText: { fontSize: fontSize.caption, color: color.textMuted, textDecorationLine: 'underline' },
});
