import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useUpdateTakenAt } from '@/features/capture/queries';
import { formatDateTime, todayIso } from '@/shared/lib/dates';
import { showAlert } from '@/shared/lib/dialog';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { DateField } from '@/shared/ui/DateField';
import { color, fontSize, space } from '@/shared/ui/tokens';

type Props = {
  postId: string;
  /** 지금 저장된 촬영 시각 (ISO) */
  takenAt: string;
  onClose: () => void;
};

/** 앨범에서 가져온 사진이나 잘못 들어간 날짜를 고친다. 시각은 원래 값을 그대로 둔다. */
export function TakenAtSheet({ postId, takenAt, onClose }: Props) {
  const current = new Date(takenAt);
  const [day, setDay] = useState(toDayString(current));
  const update = useUpdateTakenAt();
  const changed = day !== toDayString(current);

  const submit = () => {
    const [y, m, d] = day.split('-').map(Number);
    if (!y || !m || !d) return;
    const next = new Date(current);
    next.setFullYear(y, m - 1, d);
    update.mutate(
      { postId, takenAt: next },
      {
        onSuccess: onClose,
        onError: (e) => showAlert('바꾸지 못했어요', e instanceof Error ? e.message : String(e)),
      },
    );
  };

  return (
    <BottomSheet visible title="찍은 날짜" onClose={onClose}>
      <View style={styles.block}>
        <Text style={styles.hint}>지금: {formatDateTime(takenAt)}</Text>
        <DateField label="날짜" value={day} onChange={setDay} max={todayIso()} />
        <Text style={styles.hint}>시각은 그대로 두고 날짜만 바꿔요. 타임라인 순서가 함께 바뀝니다.</Text>
        <Button
          label={update.isPending ? '바꾸는 중…' : '저장'}
          large
          disabled={!changed || update.isPending}
          onPress={submit}
        />
      </View>
    </BottomSheet>
  );
}

/** Date → 'YYYY-MM-DD' (기기 시간대 기준. DateField가 그렇게 읽는다) */
function toDayString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const styles = StyleSheet.create({
  block: { gap: space.md },
  hint: { fontSize: fontSize.caption, color: color.textMuted, lineHeight: fontSize.caption * 1.6 },
});
