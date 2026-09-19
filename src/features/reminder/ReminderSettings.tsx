import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import {
  describeRule,
  INTERVAL_CHOICES,
  WEEKDAY_LABELS,
  type ReminderRule,
} from '@/features/reminder/reminder';
import { useReminder } from '@/features/reminder/useReminder';
import { todayIso } from '@/shared/lib/dates';
import { showAlert } from '@/shared/lib/dialog';
import { color, fontSize, fontWeight, radius, space } from '@/shared/ui/tokens';

type Kind = ReminderRule['kind'];
const KINDS: { kind: Kind; label: string }[] = [
  { kind: 'daily', label: '매일' },
  { kind: 'weekly', label: '요일' },
  { kind: 'interval', label: '며칠마다' },
];

const pad = (n: number) => String(n).padStart(2, '0');

/** 설정 > 촬영 알림. 켜기, 반복(매일·요일·며칠마다), 시각. 앱에서만 보인다 */
export function ReminderSettings() {
  const r = useReminder();
  const fail = (e: unknown) => showAlert('알림을 바꾸지 못했어요', e instanceof Error ? e.message : String(e));
  const set = (patch: Parameters<typeof r.update>[0]) => void r.update(patch).catch(fail);

  if (!r.available) {
    return <Text style={styles.muted}>앱으로 설치하면 정한 때에 알림을 받을 수 있어요. 웹에서는 아직 지원하지 않아요.</Text>;
  }

  const chooseKind = (kind: Kind) => {
    if (kind === r.rule.kind) return;
    if (kind === 'daily') set({ rule: { kind: 'daily' } });
    else if (kind === 'weekly') set({ rule: { kind: 'weekly', days: [1, 3, 5] } });
    else set({ rule: { kind: 'interval', everyDays: 3, anchor: todayIso() } });
  };

  const toggleDay = (d: number) => {
    if (r.rule.kind !== 'weekly') return;
    const days = r.rule.days.includes(d) ? r.rule.days.filter((x) => x !== d) : [...r.rule.days, d];
    set({ rule: { kind: 'weekly', days } });
  };

  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.label}>알림 받기</Text>
          <Text style={styles.muted}>{r.on ? `${describeRule(r.rule, r.time)}. 뜨개한 날에만 찍으면 돼요` : '정한 때에 한 번씩 알려 드려요'}</Text>
        </View>
        <Switch value={r.on} onValueChange={(on) => set({ on })} trackColor={{ true: color.accent, false: color.border }} />
      </View>

      {r.on ? (
        <>
          <Text style={styles.caption}>반복</Text>
          <View style={styles.segment}>
            {KINDS.map(({ kind, label }) => {
              const on = r.rule.kind === kind;
              return (
                <Pressable key={kind} accessibilityRole="radio" aria-checked={on} onPress={() => chooseKind(kind)} style={[styles.seg, on && styles.segOn]}>
                  <Text style={[styles.segText, on && styles.segTextOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          {r.rule.kind === 'weekly' ? (
            <View style={styles.chips}>
              {WEEKDAY_LABELS.map((w, d) => {
                const on = r.rule.kind === 'weekly' && r.rule.days.includes(d);
                return (
                  <Pressable key={w} accessibilityRole="checkbox" aria-checked={on} onPress={() => toggleDay(d)} style={[styles.day, on && styles.chipOn]}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{w}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {r.rule.kind === 'interval' ? (
            <View style={styles.chips}>
              {INTERVAL_CHOICES.map((n) => {
                const on = r.rule.kind === 'interval' && r.rule.everyDays === n;
                return (
                  <Pressable
                    key={n}
                    accessibilityRole="radio"
                    aria-checked={on}
                    onPress={() => set({ rule: { kind: 'interval', everyDays: n, anchor: todayIso() } })}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{n}일마다</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <Text style={styles.caption}>시각</Text>
          {/* 앱 안 웹뷰에서는 기기 기본 시각 선택기가 뜬다 */}
          <input
            type="time"
            aria-label="알림 시각"
            value={`${pad(r.time.hour)}:${pad(r.time.minute)}`}
            onChange={(e) => {
              const [h, m] = e.currentTarget.value.split(':').map(Number);
              if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return;
              set({ time: { hour: h, minute: m } });
            }}
            style={{
              fontSize: fontSize.body, padding: `${space.sm}px ${space.md}px`, borderRadius: radius.button,
              border: `1px solid ${color.border}`, background: color.surface, color: color.text, alignSelf: 'flex-start',
              fontFamily: 'inherit',
            }}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.md, paddingVertical: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowText: { flex: 1, gap: 2 },
  label: { fontSize: fontSize.body, color: color.text },
  muted: { fontSize: fontSize.caption, color: color.textMuted, lineHeight: fontSize.caption * 1.5 },
  caption: { fontSize: fontSize.caption, color: color.textMuted, marginTop: space.xs },
  segment: { flexDirection: 'row', borderWidth: 1, borderColor: color.border, borderRadius: radius.button, overflow: 'hidden' },
  seg: { flex: 1, alignItems: 'center', paddingVertical: space.sm },
  segOn: { backgroundColor: color.accent },
  segText: { fontSize: fontSize.caption, color: color.text },
  segTextOn: { color: color.onDark, fontWeight: fontWeight.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border },
  day: { width: 38, height: 38, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: color.accent, borderColor: color.accent },
  chipText: { fontSize: fontSize.caption, color: color.text },
  chipTextOn: { color: color.onDark, fontWeight: fontWeight.semibold },
});
