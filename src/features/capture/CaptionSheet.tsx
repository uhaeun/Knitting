import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useUpdateCaption } from '@/features/capture/queries';
import { showAlert } from '@/shared/lib/dialog';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { color, fontSize, radius, size, space } from '@/shared/ui/tokens';

export const CAPTION_MAX = 500;

type Props = {
  postId: string;
  current: string | null;
  onClose: () => void;
};

/** 기록에 남기는 한 줄 메모. 부모가 열 때만 마운트해서 지금 글에서 시작한다. */
export function CaptionSheet({ postId, current, onClose }: Props) {
  const [text, setText] = useState(current ?? '');
  const update = useUpdateCaption();
  const changed = text.trim() !== (current ?? '').trim();

  const submit = () => {
    update.mutate(
      { postId, caption: text },
      {
        onSuccess: onClose,
        onError: (e) => showAlert('저장하지 못했어요', e instanceof Error ? e.message : String(e)),
      },
    );
  };

  return (
    <BottomSheet visible title="메모" onClose={onClose}>
      <View style={styles.block}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="이 날 뭘 했는지, 실이나 바늘, 기분 아무거나"
          placeholderTextColor={color.textMuted}
          multiline
          maxLength={CAPTION_MAX}
          autoFocus
          style={styles.input}
          accessibilityLabel="메모"
        />
        <Text style={styles.count}>{text.trim().length} / {CAPTION_MAX}</Text>
        <Button
          label={update.isPending ? '저장 중…' : '저장'}
          large
          disabled={!changed || update.isPending}
          onPress={submit}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.sm },
  input: {
    minHeight: 110,
    borderWidth: size.hairline,
    borderColor: color.border,
    borderRadius: radius.button,
    backgroundColor: color.bg,
    padding: space.md,
    fontSize: fontSize.body,
    color: color.text,
    textAlignVertical: 'top',
  },
  count: { alignSelf: 'flex-end', fontSize: fontSize.caption, color: color.textMuted },
});
