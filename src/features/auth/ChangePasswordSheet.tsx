import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useChangePassword } from '@/features/auth/queries';
import { PASSWORD_MIN, validateNewPassword } from '@/features/auth/recovery';
import { useAuth } from '@/features/auth/store';
import { showAlert } from '@/shared/lib/dialog';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import { color, fontSize, space } from '@/shared/ui/tokens';

type Props = { onClose: () => void };

/** 로그인한 채로 비밀번호 바꾸기. 지금 비밀번호를 먼저 확인한다. */
export function ChangePasswordSheet({ onClose }: Props) {
  const email = useAuth((s) => s.session?.user.email ?? '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const change = useChangePassword();

  const invalid = next || confirm ? validateNewPassword(next, confirm) : null;
  const sameAsOld = !!next && next === current;
  const canSubmit = !!current && !!next && !invalid && !sameAsOld && !change.isPending;

  const submit = () => {
    setError(null);
    change.mutate(
      { email, current, next },
      {
        onSuccess: () => {
          showAlert('비밀번호를 바꿨어요', '다음 로그인부터 새 비밀번호를 쓰세요.');
          onClose();
        },
        onError: (e) => setError(e instanceof Error ? e.message : String(e)),
      },
    );
  };

  return (
    <BottomSheet visible title="비밀번호 바꾸기" onClose={onClose}>
      <View style={styles.block}>
        <Field
          label="지금 비밀번호"
          value={current}
          onChangeText={setCurrent}
          placeholder="지금 쓰는 비밀번호"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
        />
        <Field
          label="새 비밀번호"
          value={next}
          onChangeText={setNext}
          placeholder={`${PASSWORD_MIN}자 이상`}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
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
        {sameAsOld ? <Text style={styles.error}>지금 쓰는 비밀번호와 달라야 해요</Text> : null}
        {invalid || error ? <Text style={styles.error}>{invalid ?? error}</Text> : null}
        <Button label={change.isPending ? '바꾸는 중…' : '바꾸기'} large disabled={!canSubmit} onPress={submit} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.md },
  error: { fontSize: fontSize.caption, color: color.danger },
});
