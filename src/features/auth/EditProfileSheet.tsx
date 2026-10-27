import * as ImagePicker from 'expo-image-picker';
import { useState, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { validateDisplayName, validateUsername } from '@/features/auth/api';
import { removeAvatar, uploadAvatar } from '@/features/auth/avatar';
import { useUpdateProfile, useChangeUsername } from '@/features/auth/queries';
import { useAuth } from '@/features/auth/store';
import { showAlert } from '@/shared/lib/dialog';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { Avatar } from '@/shared/ui/Avatar';
import { Field } from '@/shared/ui/Field';
import { color, fontSize, space } from '@/shared/ui/tokens';

const BIO_MAX = 150;

type Props = { visible: boolean; onClose: () => void };

/** 프로필과 서버 재인증을 거치는 아이디 변경. */
export function EditProfileSheet({ visible, onClose }: Props) {
  // 닫을 때 편집 폼을 해제한다. 다시 열면 최신 프로필로 시작하며 취소한
  // 입력값을 effect로 뒤늦게 덮어쓰는 렌더가 생기지 않는다.
  return visible ? <EditProfileForm onClose={onClose} /> : null;
}

function EditProfileForm({ onClose }: Pick<Props, 'onClose'>) {
  const profile = useAuth((s) => s.profile);
  const update = useUpdateProfile();
  const rename = useChangeUsername();
  const [username, setUsername] = useState(profile?.username ?? '');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [busyPhoto, setBusyPhoto] = useState(false);

  const [now, setNow] = useState(() => Date.now());
  const nextChangeTime = profile?.last_username_changed_at
    ? new Date(profile.last_username_changed_at).getTime() + 720 * 60 * 60 * 1000 : null;
  useEffect(() => {
    if (!nextChangeTime || nextChangeTime <= now) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(Math.max(0, nextChangeTime - Date.now()), 2_147_000_000));
    return () => clearTimeout(timer);
  }, [nextChangeTime, now]);
  if (!profile) return null;
  const nextAllowed = profile.last_username_changed_at
    ? new Date(new Date(profile.last_username_changed_at).getTime() + 720 * 60 * 60 * 1000) : null;
  const usernameError = validateUsername(username);
  const renameAllowed = !nextAllowed || now >= nextAllowed.getTime();
  const nameError = name.trim() ? validateDisplayName(name) : null;
  const changed = name.trim() !== profile.display_name || (bio.trim() || null) !== (profile.bio ?? null);
  const canSave = !!name.trim() && !nameError && changed && !update.isPending;

  /** 앨범에서 고른 사진을 정사각으로 잘라 올리고 프로필에 붙인다 */
  const pickPhoto = async () => {
    if (!profile || busyPhoto) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    const picked = res.assets?.[0];
    if (res.canceled || !picked) return;
    setBusyPhoto(true);
    const old = profile.avatar_path;
    try {
      const path = await uploadAvatar(profile.id, picked.uri, picked.width, picked.height);
      update.mutate(
        { id: profile.id, patch: { avatar_path: path } },
        {
          onSuccess: () => void removeAvatar(old),
          onError: (e) => showAlert('저장하지 못했어요', e instanceof Error ? e.message : String(e)),
        },
      );
    } catch (e) {
      showAlert('사진을 바꾸지 못했어요', e instanceof Error ? e.message : String(e));
    } finally {
      setBusyPhoto(false);
    }
  };

  const clearPhoto = () => {
    if (!profile?.avatar_path) return;
    const old = profile.avatar_path;
    update.mutate(
      { id: profile.id, patch: { avatar_path: null } },
      { onSuccess: () => void removeAvatar(old), onError: (e) => showAlert('지우지 못했어요', e instanceof Error ? e.message : String(e)) },
    );
  };

  const save = () =>
    update.mutate(
      { id: profile.id, patch: { display_name: name.trim(), bio: bio.trim() || null } },
      {
        onSuccess: onClose,
        onError: (e) => showAlert('저장하지 못했어요', e instanceof Error ? e.message : String(e)),
      },
    );

  return (
    <BottomSheet visible title="프로필 편집" onClose={onClose}>
      <View style={styles.block}>
        <View style={styles.photoRow}>
          <Avatar path={profile.avatar_path} name={profile.display_name} size={64} />
          <View style={styles.photoButtons}>
            <Pressable accessibilityRole="button" onPress={() => void pickPhoto()} disabled={busyPhoto}>
              <Text style={styles.photoLink}>{busyPhoto ? '올리는 중…' : profile.avatar_path ? '사진 바꾸기' : '사진 넣기'}</Text>
            </Pressable>
            {profile.avatar_path ? (
              <Pressable accessibilityRole="button" onPress={clearPhoto}>
                <Text style={styles.photoRemove}>사진 지우기</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
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
        <Field label="아이디" value={username} onChangeText={(v) => setUsername(v.toLowerCase())} maxLength={20} autoCapitalize="none" />
        {usernameError ? <Text style={styles.error}>{usernameError}</Text> : null}
        <Text style={styles.hint}>첫 변경은 바로 가능해요. 이후 30일마다 바꿀 수 있고, 이전 아이디는 다시 사용할 수 없어요.</Text>
        {nextAllowed ? <Text style={styles.hint}>다음 변경 가능: {nextAllowed.toLocaleString()}</Text> : null}
        <Field label="현재 비밀번호" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
        <Button label={rename.isPending ? '변경 중…' : '아이디 변경'}
          disabled={!renameAllowed || !!usernameError || username === profile.username || !password || rename.isPending}
          onPress={() => rename.mutate({ username, password }, {
            onSuccess: () => { setPassword(''); showAlert('아이디를 바꿨어요'); },
            onError: (e) => { setPassword(''); showAlert('변경하지 못했어요', e.message); },
          })} />
        <Button label={update.isPending ? '저장하는 중…' : '저장'} large disabled={!canSave} onPress={save} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  photoButtons: { gap: space.xs },
  photoLink: { fontSize: fontSize.label, color: color.accent, minHeight: 28 },
  photoRemove: { fontSize: fontSize.caption, color: color.textMuted, minHeight: 28 },
  block: { gap: space.md },
  error: { fontSize: fontSize.caption, color: color.danger },
  bio: { minHeight: 80, textAlignVertical: 'top' },
  hint: { fontSize: fontSize.caption, color: color.textMuted, lineHeight: fontSize.caption * 1.5 },
});
