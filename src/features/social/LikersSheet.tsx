import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useLikers } from '@/features/social/queries';
import { Avatar } from '@/shared/ui/Avatar';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { color, fontSize, fontWeight, space } from '@/shared/ui/tokens';

type Props = { postId: string; onClose: () => void };

/** 좋아요를 누른 사람들. 이름을 누르면 그 사람 프로필로 간다. */
export function LikersSheet({ postId, onClose }: Props) {
  const router = useRouter();
  const likers = useLikers(postId, true);
  const people = likers.data ?? [];

  return (
    <BottomSheet visible title={`좋아요 ${people.length > 0 ? people.length : ''}`.trim()} onClose={onClose}>
      <View style={styles.block}>
        {likers.isPending ? <ActivityIndicator color={color.accent} /> : null}
        {!likers.isPending && people.length === 0 ? (
          <Text style={styles.empty}>아직 좋아요가 없어요</Text>
        ) : null}
        {people.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              router.push({ pathname: '/user/[username]', params: { username: p.username } });
            }}
            style={styles.row}
          >
            <Avatar path={p.avatar_path} name={p.display_name} size={40} />
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1}>{p.display_name}</Text>
              <Text style={styles.handle} numberOfLines={1}>@{p.username}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.xs, maxHeight: 360 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  text: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.body, color: color.text, fontWeight: fontWeight.semibold },
  handle: { fontSize: fontSize.caption, color: color.textMuted },
  empty: { fontSize: fontSize.label, color: color.textMuted, paddingVertical: space.md },
});
