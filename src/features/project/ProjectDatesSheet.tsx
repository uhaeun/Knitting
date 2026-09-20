import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useUpdateProjectDates } from '@/features/project/queries';
import { todayIso } from '@/shared/lib/dates';
import { showAlert } from '@/shared/lib/dialog';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { DateField } from '@/shared/ui/DateField';
import { color, fontSize, space } from '@/shared/ui/tokens';

type Props = {
  projectId: string;
  startedAt: string;
  finishedAt: string | null;
  onClose: () => void;
};

/** 시작일과 완성 여부. 열 때만 마운트해서 지금 값에서 시작한다. */
export function ProjectDatesSheet({ projectId, startedAt, finishedAt, onClose }: Props) {
  const today = todayIso();
  const [started, setStarted] = useState(startedAt);
  const [finished, setFinished] = useState<string | null>(finishedAt);
  const update = useUpdateProjectDates();

  const changed = started !== startedAt || finished !== finishedAt;
  const wrongOrder = !!finished && finished < started;

  const save = () =>
    update.mutate(
      { id: projectId, patch: { started_at: started, finished_at: finished } },
      {
        onSuccess: onClose,
        onError: (e) => showAlert('저장하지 못했어요', e instanceof Error ? e.message : String(e)),
      },
    );

  return (
    <BottomSheet visible title="날짜" onClose={onClose}>
      <View style={styles.block}>
        <DateField label="시작일" value={started} onChange={setStarted} max={today} />
        {finished ? (
          <>
            <DateField label="완성일" value={finished} onChange={setFinished} max={today} />
            <Button label="다시 진행 중으로" variant="secondary" large onPress={() => setFinished(null)} />
          </>
        ) : (
          <Button label="완성했어요" variant="secondary" large onPress={() => setFinished(today)} />
        )}
        {wrongOrder ? <Text style={styles.error}>완성일이 시작일보다 앞이에요</Text> : null}
        <Button
          label={update.isPending ? '저장 중…' : '저장'}
          large
          disabled={!changed || wrongOrder || update.isPending}
          onPress={save}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.md },
  error: { fontSize: fontSize.caption, color: color.danger },
});
