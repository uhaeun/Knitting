import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { avatarUrl } from '@/features/auth/avatar';
import { color, fontSize, fontWeight } from '@/shared/ui/tokens';

type Props = {
  /** profiles.avatar_path. 없으면 이름 첫 글자를 보여 준다 */
  path?: string | null;
  name: string;
  size?: number;
};

/** 프로필 사진 동그라미. 사진이 없던 시절의 첫 글자 표시를 그대로 기본값으로 쓴다. */
export function Avatar({ path, name, size = 36 }: Props) {
  const url = avatarUrl(path);
  const box = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[styles.base, box]}>
      {url ? (
        <Image source={{ uri: url }} contentFit="cover" style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]} />
      ) : (
        <Text style={[styles.letter, { fontSize: Math.max(fontSize.caption, size * 0.4) }]}>{name.slice(0, 1)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: color.accentSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  letter: { fontWeight: fontWeight.semibold, color: color.textMuted },
});
