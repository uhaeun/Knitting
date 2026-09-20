import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useDeleteAccount } from '@/features/auth/queries';
import { useAuth } from '@/features/auth/store';
import { showAlert } from '@/shared/lib/dialog';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import { color, fontSize, space } from '@/shared/ui/tokens';

type Props = { visible: boolean; onClose: () => void };

/** 되돌릴 수 없는 일이라 아이디를 직접 적게 한다. */
export function DeleteAccountSheet({ visible, onClose }: Props) {
  const router = useRouter();
  const session = useAuth((s) => s.session);
  const profile = useAuth((s) => s.profile);
  const [typed, setTyped] = useState('');
  const del = useDeleteAccount();

  const username = profile?.username ?? '';
  const canDelete = typed.trim() === username && !!session && !del.isPending;

  const submit = () => {
    if (!session) return;
    del.mutate(session.user.id, {
      onSuccess: () => {
        onClose();
        showAlert('계정을 지웠어요', '그동안 고마웠어요.');
        router.replace('/(auth)/sign-in');
      },
      onError: (e) => showAlert('지우지 못했어요', e instanceof Error ? e.message : String(e)),
    });
  };

  return (
    <BottomSheet visible={visible} title="계정 삭제" onClose={onClose}>
      <View style={styles.block}>
        <Text style={styles.warn}>지우면 되돌릴 수 없어요.</Text>
        <Text style={styles.line}>편물과 기록, 사진과 영상 파일, 댓글과 팔로우가 모두 사라집니다.</Text>
        <Text style={styles.line}>만들어 둔 결과 사진이나 영상은 사진첩에 먼저 저장해 주세요.</Text>
        <Field
          label={`확인하려면 아이디(${username})를 적어 주세요`}
          value={typed}
          onChangeText={setTyped}
          placeholder={username}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={canDelete ? submit : undefined}
        />
        <Button
          label={del.isPending ? '지우는 중…' : '계정 지우기'}
          large
          danger
          disabled={!canDelete}
          onPress={submit}
        />
        <Button label="취소" variant="secondary" large onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.md },
  warn: { fontSize: fontSize.body, color: color.danger },
  line: { fontSize: fontSize.label, color: color.textMuted, lineHeight: fontSize.label * 1.6 },
});
