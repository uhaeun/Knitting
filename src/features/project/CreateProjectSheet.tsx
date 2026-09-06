import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCreateProject } from '@/features/project/queries';
import { formatMonthDay, todayIso } from '@/shared/lib/dates';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import type { Visibility } from '@/shared/types/models';
import { color, fontSize, fontWeight, radius, size, space } from '@/shared/ui/tokens';

const VISIBILITIES: { key: Visibility; label: string; hint: string }[] = [
  { key: 'private', label: '나만', hint: '기기와 내 계정에만 남습니다' },
  { key: 'followers', label: '팔로워', hint: '승인한 사람에게만 보여요' },
  { key: 'public', label: '전체', hint: '탐색 탭에 올라갑니다' },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated?: (projectId: string) => void;
};

/** 시안 1b. 1주차는 시작일 = 오늘 고정 (날짜 선택기는 나중). */
export function CreateProjectSheet({ visible, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const create = useCreateProject();
  const today = todayIso();
  const canSubmit = name.trim().length > 0 && !create.isPending;

  const submit = () => {
    create.mutate(
      { name, started_at: today, default_visibility: visibility },
      {
        onSuccess: (p) => {
          setName('');
          onClose();
          onCreated?.(p.id);
        },
        onError: (e) => Alert.alert('저장하지 못했어요', e instanceof Error ? e.message : String(e)),
      },
    );
  };

  return (
    <BottomSheet visible={visible} title="편물 만들기" onClose={onClose}>
      <Field
        label="편물 이름"
        value={name}
        onChangeText={setName}
        placeholder="예: 회색 라글란 스웨터"
        maxLength={50}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={canSubmit ? submit : undefined}
      />
      <View style={styles.field}>
        <Text style={styles.label}>시작일</Text>
        <View style={styles.dateRow}>
          <Text style={styles.dateText}>{formatMonthDay(today)}</Text>
          <Text style={styles.label}>오늘</Text>
        </View>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>공개 범위</Text>
        <View style={styles.segment}>
          {VISIBILITIES.map((v, i) => {
            const on = v.key === visibility;
            return (
              <Pressable
                key={v.key}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setVisibility(v.key)}
                style={[styles.seg, i > 0 && styles.segDivider, on && styles.segOn]}
              >
                <Text style={[styles.segText, on && styles.segTextOn]}>{v.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.label}>{VISIBILITIES.find((v) => v.key === visibility)?.hint}</Text>
      </View>
      <Button label="만들기" large onPress={submit} disabled={!canSubmit} style={styles.action} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.sm },
  label: { fontSize: fontSize.caption, color: color.textMuted },
  dateRow: {
    height: size.inputHeight,
    borderWidth: size.hairline,
    borderColor: color.border,
    borderRadius: radius.button,
    backgroundColor: color.bg,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: { fontSize: fontSize.body, color: color.text },
  action: { marginTop: space.sm },
  segment: {
    flexDirection: 'row', height: size.inputHeight, borderWidth: size.hairline,
    borderColor: color.border, borderRadius: radius.button, overflow: 'hidden',
  },
  seg: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  segDivider: { borderLeftWidth: size.hairline, borderLeftColor: color.border },
  segOn: { backgroundColor: color.accent },
  segText: { fontSize: fontSize.label, color: color.textMuted },
  segTextOn: { color: color.onDark, fontWeight: fontWeight.semibold },
});
