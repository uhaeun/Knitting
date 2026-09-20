import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SOCIAL_LABEL, type SocialProvider } from '@/features/auth/api';
import { useEnabledSocials, useSocialSignIn } from '@/features/auth/queries';
import { showAlert } from '@/shared/lib/dialog';
import { color, fontSize, fontWeight, radius, size, space } from '@/shared/ui/tokens';

/** 카카오·구글로 로그인. 처음 들어오면 가입도 겸한다 (그쪽 계정의 메일 주소를 쓴다).
 *  서버에서 켜 둔 방법만 보여 준다 — 안 켠 버튼은 아예 그리지 않는다. */
export function SocialButtons() {
  const social = useSocialSignIn();
  const enabled = useEnabledSocials();
  const providers: SocialProvider[] = enabled.data ?? [];
  if (providers.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={styles.dividerText}>또는</Text>
        <View style={styles.line} />
      </View>
      {providers.map((p) => (
        <Pressable
          key={p}
          accessibilityRole="button"
          disabled={social.isPending}
          onPress={() =>
            social.mutate(p, {
              onError: (e) => showAlert('로그인하지 못했어요', e instanceof Error ? e.message : String(e)),
            })
          }
          style={({ pressed }) => [styles.button, p === 'kakao' ? styles.kakao : styles.google, pressed && styles.pressed]}
        >
          <Text style={[styles.label, p === 'kakao' ? styles.kakaoLabel : styles.googleLabel]}>
            {SOCIAL_LABEL[p]}로 계속하기
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  line: { flex: 1, height: size.hairline, backgroundColor: color.border },
  dividerText: { fontSize: fontSize.caption, color: color.textMuted },
  button: {
    height: size.primaryButtonHeight, borderRadius: radius.button,
    alignItems: 'center', justifyContent: 'center', borderWidth: size.hairline,
  },
  kakao: { backgroundColor: '#FEE500', borderColor: '#FEE500' },
  google: { backgroundColor: color.surface, borderColor: color.border },
  pressed: { opacity: 0.85 },
  label: { fontSize: fontSize.label, fontWeight: fontWeight.semibold },
  kakaoLabel: { color: '#191600' },
  googleLabel: { color: color.text },
});
