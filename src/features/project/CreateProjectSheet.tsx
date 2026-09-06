import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { useCreateProject } from '@/features/project/queries';
import { formatMonthDay, todayIso } from '@/shared/lib/dates';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import { color, fontSize, radius, size, space } from '@/shared/ui/tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated?: (projectId: string) => void;
};

/** 시안 1b. 1주차는 시작일 = 오늘 고정 (날짜 선택기는 나중). */
export function CreateProjectSheet({ visible, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const create = useCreateProject();
  const today = todayIso();
  const canSubmit = name.trim().length > 0 && !create.isPending;

  const submit = () => {
    create.mutate(
      { name, started_at: today },
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
});
