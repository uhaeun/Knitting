import { Image } from 'expo-image';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useFollowingResults, useResult } from '@/features/media/resultsQueries';
import { color, fontSize, fontWeight, radius, space } from '@/shared/ui/tokens';
import { VideoPlayer } from '@/shared/ui/VideoPlayer';

const THUMB_SIDE = 84;

/**
 * 팔로잉 피드 위, 발행된 결과물 가로 줄. v1이라 posts처럼 무한 스크롤은 아니고 최근 것만 보여준다.
 * 결과물이 없으면(아무도 아직 안 올렸으면) 아무것도 그리지 않는다.
 */
export function ResultStrip() {
  const results = useFollowingResults();
  const [openId, setOpenId] = useState<string | null>(null);
  const items = results.data?.results ?? [];
  if (items.length === 0) return null;

  return (
    <View style={styles.root}>
      <Text style={styles.title}>결과물</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={items}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`${item.profiles.display_name}의 결과물`} onPress={() => setOpenId(item.id)} style={styles.item}>
            <Image source={{ uri: results.data?.urls.get(item.thumb_path) }} contentFit="cover" style={styles.thumb} />
            <Text style={styles.name} numberOfLines={1}>{item.profiles.display_name}</Text>
          </Pressable>
        )}
      />
      <ResultViewer id={openId} onClose={() => setOpenId(null)} />
    </View>
  );
}

function ResultViewer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useResult(id);
  return (
    <Modal visible={!!id} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="닫기" style={styles.backdrop} onPress={onClose}>
        <View style={styles.viewerBox}>
          {q.data?.result.output === 'mp4' && q.data.url ? (
            <VideoPlayer key={q.data.url} uri={q.data.url} label="결과물" />
          ) : q.data?.url ? (
            <Image source={{ uri: q.data.url }} contentFit="contain" style={StyleSheet.absoluteFill} accessibilityLabel="결과물" />
          ) : null}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: space.md, gap: space.sm },
  title: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold, color: color.textMuted, paddingHorizontal: space.xl },
  list: { paddingHorizontal: space.xl, gap: space.md },
  item: { width: THUMB_SIDE, gap: space.xs },
  thumb: { width: THUMB_SIDE, height: THUMB_SIDE, borderRadius: radius.card, backgroundColor: color.border },
  name: { fontSize: fontSize.micro, color: color.textMuted, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: color.overlay, alignItems: 'center', justifyContent: 'center' },
  viewerBox: { width: '90%', height: '70%' },
});
