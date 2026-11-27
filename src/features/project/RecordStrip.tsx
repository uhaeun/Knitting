import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Post } from '@/shared/types/models';
import { color, fontSize, fontWeight, radius, size, space } from '@/shared/ui/tokens';

const itemWidth = size.journalCompactThumb + space.sm;

export function RecordStrip({ posts, index, onSelect }: { posts: Post[]; index: number; onSelect: (index: number) => void }) {
  const list = useRef<FlatList<Post>>(null);
  useEffect(() => {
    if (posts[index]) list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false });
  }, [index, posts]);
  return (
    <FlatList ref={list} horizontal data={posts} extraData={index} keyExtractor={post => post.id}
      showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}
      getItemLayout={(_, position) => ({ length: itemWidth, offset: position * itemWidth, index: position })}
      renderItem={({ item, index: position }) => (
        <Pressable accessibilityRole="button" accessibilityLabel={position + 1 + '번째 기록'} aria-pressed={position === index}
          onPress={() => onSelect(position)} style={[styles.frame, position === index && styles.selected]}>
          <View style={styles.crop}>
            <Image source={{ uri: item.thumb_path || item.photo_path }} contentFit="cover" style={StyleSheet.absoluteFill} />
            {item.media_type === 'video' ? <Text style={styles.play}>▶</Text> : null}
          </View>
        </Pressable>
      )} />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.xl },
  frame: { width: size.journalCompactThumb, height: size.journalCompactThumb, marginRight: space.sm,
    borderWidth: size.tick.width, borderColor: color.border, borderRadius: radius.photo, padding: size.tick.width },
  selected: { borderColor: color.accent },
  crop: { flex: 1, overflow: 'hidden', borderRadius: space.xs, backgroundColor: color.journalLinen },
  play: { position: 'absolute', right: space.xs, bottom: space.xs, color: color.onDark,
    backgroundColor: color.photoLabelBg, paddingHorizontal: space.xs, fontSize: fontSize.micro, fontWeight: fontWeight.semibold },
});
