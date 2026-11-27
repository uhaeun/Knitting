import { useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMonthDay } from '@/shared/lib/dates';
import type { ProjectSummary } from '@/shared/types/models';
import { useContentWidth } from '@/shared/ui/layout';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ProjectCard } from '@/shared/ui/ProjectCard';
import { color, fontSize, fontWeight, size, space } from '@/shared/ui/tokens';

type Filter = '전체' | '뜨는 중' | '완성';
const filters: readonly Filter[] = ['전체', '뜨는 중', '완성'];
type Props = {
  items: ProjectSummary[];
  header?: ReactNode;
  emptyState?: ReactNode;
  onOpen: (id: string) => void;
  onCapture: (id: string) => void;
};

export function ProjectJournal({ items, onOpen, onCapture, header, emptyState }: Props) {
  const narrow = useContentWidth() < size.narrowCalendarWidth;
  const [filter, setFilter] = useState<Filter>('전체');
  const completed = items.filter(project => project.finished_at);
  const active = items.filter(project => !project.finished_at);
  const counts = { 전체: items.length, '뜨는 중': active.length, 완성: completed.length };
  const visible = filter === '전체' ? items : filter === '완성' ? completed : active;
  const featured = filter === '전체' ? active[0] ?? visible[0] : visible[0];
  const ordered = featured ? [featured, ...visible.filter(project => project.id !== featured.id)] : [];

  return (
    <FlatList
      data={ordered}
      keyExtractor={project => project.id}
      contentContainerStyle={[styles.list, narrow && styles.narrowList]}
      ListHeaderComponent={
        <>
          {header}
          {items.length > 0 && <View accessibilityRole="tablist" accessibilityLabel="편물 상태" style={styles.filters}>
            {filters.map(option => (
              <Pressable key={option} accessibilityRole="tab" aria-selected={filter === option}
                accessibilityLabel={option + ' ' + counts[option] + '개'} onPress={() => setFilter(option)}
                style={[styles.filter, filter === option && styles.selected]}>
                <Text style={[styles.filterText, filter === option && styles.selectedText]}>{option} {counts[option]}</Text>
              </Pressable>
            ))}
          </View>}
        </>
      }
      ListEmptyComponent={emptyState ? <>{emptyState}</> : <EmptyState title={filter === '완성' ? '완성한 편물이 아직 없어요' : '뜨고 있는 편물이 없어요'}
        description={filter === '완성' ? '편물에서 완성일을 지정하면 여기에 모여요.' : '새 편물을 만들면 이곳에서 기록을 이어갈 수 있어요.'}
        actionLabel="전체 편물 보기" onAction={() => setFilter('전체')} />}
      renderItem={({ item, index }) => (
        <ProjectCard name={item.name} done={!!item.finished_at} featured={index === 0}
          subtitle={formatMonthDay(item.started_at) + ' 시작' + (item.finished_at ? ' · ' + formatMonthDay(item.finished_at) + ' 완성' : '')}
          photoCount={item.photo_count} thumbUri={item.cover_thumb_path ?? undefined}
          onPress={() => onOpen(item.id)} onCapture={() => onCapture(item.id)} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  narrowList: { paddingHorizontal: space.xs },
  filters: { flexDirection: 'row', gap: space.xl, marginBottom: space.lg, borderBottomWidth: size.hairline, borderColor: color.border },
  filter: { justifyContent: 'center', minHeight: size.tap, borderBottomWidth: size.tick.width, borderColor: 'transparent' },
  selected: { borderColor: color.journalInk },
  filterText: { fontSize: fontSize.label, color: color.textMuted },
  selectedText: { color: color.journalInk, fontWeight: fontWeight.semibold },
});
