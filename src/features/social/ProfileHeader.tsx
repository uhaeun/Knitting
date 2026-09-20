import { StyleSheet, Text, View } from 'react-native';

import type { Profile } from '@/shared/types/remote';
import { Avatar } from '@/shared/ui/Avatar';
import { color, fontSize, fontWeight, radius, size, space } from '@/shared/ui/tokens';

type Props = {
  profile: Profile;
  counts: { followers: number; following: number } | undefined;
  postCount: number | null;
  right?: React.ReactNode;
};

export function ProfileHeader({ profile, counts, postCount, right }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Avatar path={profile.avatar_path} name={profile.display_name} size={72} />
        <View style={styles.stats}>
          <Stat label="사진" value={postCount} />
          <Stat label="팔로워" value={counts?.followers ?? null} />
          <Stat label="팔로잉" value={counts?.following ?? null} />
        </View>
      </View>
      <View style={styles.text}>
        <Text style={styles.name}>{profile.display_name}</Text>
        <Text style={styles.handle}>@{profile.username}{profile.is_private ? ' · 비공개' : ''}</Text>
        {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value ?? '–'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg, gap: space.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.xl },
  avatar: {
    width: 72, height: 72, borderRadius: radius.pill, backgroundColor: color.surface,
    borderWidth: size.hairline, borderColor: color.border, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: fontSize.title, fontWeight: fontWeight.semibold, color: color.textMuted },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: color.text, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: fontSize.caption, color: color.textMuted },
  text: { gap: space.xs },
  name: { fontSize: fontSize.heading, fontWeight: fontWeight.semibold, color: color.text },
  handle: { fontSize: fontSize.caption, color: color.textMuted },
  bio: { fontSize: fontSize.label, color: color.text, lineHeight: fontSize.label * 1.5 },
  right: { paddingTop: space.xs },
});
