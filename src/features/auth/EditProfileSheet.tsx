import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { validateDisplayName } from '@/features/auth/api';
import { useUpdateProfile } from '@/features/auth/queries';
import { useAuth } from '@/features/auth/store';
import { showAlert } from '@/shared/lib/dialog';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import { color, fontSize, space } from '@/shared/ui/tokens';

const BIO_MAX = 150;

type Props = { visible: boolean; onClose: () => void };

/** 표시 이름·소개 바꾸기. 아이디는 바꾸지 않는다 (다른 사람이 링크로 찾아오는 주소라서) */
export function EditProfileSheet({ visible, onClose }: Props) {
  const profile = useAuth((s) => s.profile);
  const update = useUpdateProfile();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');

  // 열 때마다 지금 값으로
  useEffect(() => {
    if (!visible) return;
    setName(profile?.display_name ?? '');
    setBio(profile?.bio ?? '');
  }, [visible, profile?.display_name, profile?.bio]);

  if (!profile) return null;
  const nameError = name.trim() ? validateDisplayName(name) : null;
  const changed = name.trim() !== profile.display_name || (bio.trim() || null) !== (profile.bio ?? null);
  const canSave = !!name.trim() && !nameError && changed && !update.isPending;

  const save = () =>
    update.mutate(
      { id: profile.id, patch: { display_name: name.trim(), bio: bio.trim() || null } },
      {
        onSuccess: onClose,
        onError: (e) => showAlert('저장하지 못했어요', e instanceof Error ? e.message : String(e)),
      },
    );

  return (
    <BottomSheet visible={visible} title="프로필 편집" onClose={onClose}>
      <View style={styles.block}>
        <Field label="표시 이름" value={name} onChangeText={setName} maxLength={30} placeholder="하은" />
        {nameError ? <Text style={styles.error}>{nameError}</Text> : null}
        <Field
          label={`소개 (${bio.length}/${BIO_MAX})`}
          value={bio}
          onChangeText={setBio}
          maxLength={BIO_MAX}
          multiline
          placeholder="예: 겨울 내내 스웨터 하나 뜨는 중"
          style={styles.bio}
        />
        <Text style={styles.hint}>아이디 @{profile.username}는 바꿀 수 없어요. 다른 사람이 나를 찾는 주소예요.</Text>
        <Button label={update.isPending ? '저장하는 중…' : '저장'} large disabled={!canSave} onPress={save} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.md },
  error: { fontSize: fontSize.caption, color: color.danger },
  bio: { minHeight: 80, textAlignVertical: 'top' },
  hint: { fontSize: fontSize.caption, color: color.textMuted, lineHeight: fontSize.caption * 1.5 },
});
