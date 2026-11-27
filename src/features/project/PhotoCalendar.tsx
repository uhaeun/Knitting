import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useCalendarRecords } from '@/features/capture/queries';
import { formatMonthDay, todayIso, toDateOnly } from '@/shared/lib/dates';
import { JournalIcon } from '@/shared/ui/JournalIcon';
import { color, fontSize, journalType, size, space } from '@/shared/ui/tokens';
import { calendarWeeks, dayCover, monthStart, recordsByDay, weekdays } from './calendar';

type Props = { onRecord: (projectId: string, recordId: string) => void };

export function PhotoCalendar({ onRecord }: Props) {
  const today = todayIso();
  const [selected, setSelected] = useState(today);
  const first = monthStart(selected);
  const query = useCalendarRecords(first.toISOString(), monthStart(selected, 1).toISOString());
  const days = useMemo(() => recordsByDay(query.data ?? []), [query.data]);
  const entries = days.get(selected) ?? [];
  const changeMonth = (offset: number) => {
    const next = toDateOnly(monthStart(selected, offset));
    setSelected(next.slice(0, 7) === today.slice(0, 7) ? today : next);
  };
  const selectedDay = new Date(selected + 'T00:00:00');
  return (
    <View>
      <View style={styles.header}>
        <View accessibilityRole="header" aria-label={first.getFullYear() + '년 ' + (first.getMonth() + 1) + '월'}>
          <Text style={styles.year}>{first.getFullYear()}</Text>
          <View style={styles.monthLine}>
            <Text style={styles.month}>{first.getMonth() + 1}</Text>
            <Text style={styles.monthUnit}>월</Text>
          </View>
        </View>
        <View style={styles.controls}>
          <Pressable accessibilityRole="button" accessibilityLabel="이전 달" onPress={() => changeMonth(-1)} style={styles.tap}>
            <JournalIcon name="back" dimension={size.journalSmallGlyph} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="오늘로 이동" onPress={() => setSelected(today)} style={styles.tap}>
            <Text style={styles.controlText}>오늘</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="다음 달" onPress={() => changeMonth(1)} style={styles.tap}>
            <View style={styles.next}><JournalIcon name="back" dimension={size.journalSmallGlyph} /></View>
          </Pressable>
        </View>
      </View>
      <View style={styles.weekdays}>
        {weekdays.map(day => <Text key={day} style={styles.weekday}>{day}</Text>)}
      </View>
      <View style={styles.grid}>
        {calendarWeeks(first).map((week, row) => (
          <View key={row} style={styles.week}>
            {week.map((date, column) => {
              if (!date) return <View key={column} style={styles.cell} />;
              const records = days.get(date) ?? [];
              const cover = dayCover(records);
              const isToday = date === today;
              return (
                <Pressable key={column} accessibilityRole="button" aria-pressed={date === selected}
                  accessibilityLabel={formatMonthDay(date) + (isToday ? ' 오늘' : '') + ', 기록 ' + records.length + '개'}
                  onPress={() => setSelected(date)} style={styles.cell}>
                  {cover && <Image source={{ uri: cover }} contentFit="cover" style={StyleSheet.absoluteFill} />}
                  <View style={[styles.dayStamp, cover ? styles.photoStamp : null, isToday && styles.todayStamp]}>
                    <Text style={[styles.dayNumber, isToday && styles.todayNumber]}>{Number(date.slice(-2))}</Text>
                  </View>
                  {records.length > 1 && <Text style={styles.extra}>+{records.length - 1}</Text>}
                  {date === selected && <View style={styles.selection} />}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.dayEntries}>
        <View style={styles.dayHeading}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>{formatMonthDay(selected)} {weekdays[selectedDay.getDay()]}요일</Text>
          {query.isSuccess && <Text style={styles.controlText}>기록 {entries.length}개</Text>}
        </View>
        {query.isError ? <Pressable accessibilityRole="button" onPress={() => void query.refetch()} style={styles.feedback}>
          <Text style={styles.controlText}>기록을 불러오지 못했어요 · 다시 시도</Text>
        </Pressable> : query.isPending ? <Text style={styles.note}>기록을 불러오는 중…</Text> :
          entries.length === 0 ? <Text style={styles.note}>이날은 아직 기록이 없어요.</Text> :
          entries.map(record => (
            <Pressable key={record.id} accessibilityRole="button" accessibilityLabel={record.projectName + ' ' + new Date(record.takenAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) + ' 기록 열기'}
              onPress={() => onRecord(record.projectId, record.id)} style={styles.entry}>
              <View style={styles.thumb}>
                {record.thumb && <Image source={{ uri: record.thumb }} contentFit="cover" style={StyleSheet.absoluteFill} />}
              </View>
              <View style={styles.entryBody}>
                <Text numberOfLines={2} style={styles.entryTitle}>{record.projectName}</Text>
                {record.caption && <Text numberOfLines={2} style={styles.entryMemo}>{record.caption}</Text>}
              </View>
              <Text style={styles.time}>{new Date(record.takenAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}</Text>
            </Pressable>
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: space.lg, paddingBottom: space.md },
  year: { fontFamily: journalType.number, fontWeight: journalType.medium, fontSize: fontSize.body, color: color.textMuted },
  monthLine: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  month: { fontFamily: journalType.number, fontWeight: journalType.medium, fontSize: fontSize.calendarMonth,
    lineHeight: fontSize.calendarMonth, color: color.text },
  monthUnit: { fontFamily: journalType.korean, fontSize: fontSize.heading, color: color.text },
  controls: { flexDirection: 'row', alignItems: 'center' },
  tap: { width: size.tap, minHeight: size.tap, alignItems: 'center', justifyContent: 'center' },
  controlText: { fontFamily: journalType.korean, fontSize: fontSize.caption, color: color.textMuted },
  next: { transform: [{ rotate: '180deg' }] },
  weekdays: { flexDirection: 'row', borderTopWidth: size.hairline, borderColor: color.border, paddingVertical: space.sm },
  weekday: { flex: 1, textAlign: 'center', fontSize: fontSize.caption, fontFamily: journalType.korean, color: color.textMuted },
  grid: { borderLeftWidth: size.hairline, borderTopWidth: size.hairline, borderColor: color.border },
  week: { flexDirection: 'row', width: '100%', aspectRatio: size.calendarWeekRatio },
  cell: { flex: 1, minWidth: 0, borderRightWidth: size.hairline, borderBottomWidth: size.hairline,
    borderColor: color.border, overflow: 'hidden', alignItems: 'flex-start' },
  dayStamp: { margin: space.xs, paddingHorizontal: space.xs },
  photoStamp: { backgroundColor: color.journalPaper },
  todayStamp: { backgroundColor: color.accent },
  dayNumber: { fontFamily: journalType.number, fontWeight: journalType.medium, fontSize: fontSize.calendarDay,
    lineHeight: fontSize.heading, color: color.text },
  todayNumber: { color: color.onDark },
  selection: { ...StyleSheet.absoluteFill, pointerEvents: 'none', borderWidth: size.tick.width, borderColor: color.accent },
  extra: { position: 'absolute', bottom: space.xs, right: space.xs, paddingHorizontal: space.xs,
    backgroundColor: color.journalPaper, color: color.text, fontSize: fontSize.caption, fontVariant: ['tabular-nums'] },
  dayEntries: { paddingTop: space.xl, paddingBottom: space.lg, borderBottomWidth: size.hairline, borderColor: color.border },
  dayHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm, marginBottom: space.sm },
  sectionTitle: { fontFamily: journalType.korean, fontWeight: journalType.medium, fontSize: fontSize.body, color: color.text },
  feedback: { minHeight: size.tap, justifyContent: 'center' },
  note: { fontSize: fontSize.label, color: color.textMuted, paddingVertical: space.sm },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, minHeight: size.tap },
  thumb: { height: size.tap, width: size.tap, backgroundColor: color.journalLinen },
  entryBody: { flex: 1, gap: space.xs, minWidth: 0 },
  entryTitle: { fontFamily: journalType.korean, fontSize: fontSize.label, color: color.text },
  entryMemo: { fontSize: fontSize.caption, color: color.textMuted },
  time: { fontFamily: journalType.number, fontWeight: journalType.medium, fontSize: fontSize.body, color: color.textMuted },
});
