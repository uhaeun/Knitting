import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useReport, useToggleBlock } from '@/features/social/queries';
import { showAlert } from '@/shared/lib/dialog';
import type { ReportTarget } from '@/shared/types/remote';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { color, fontSize, radius, size, space } from '@/shared/ui/tokens';

const REASONS = ['부적절한 사진', '괴롭힘 또는 혐오', '스팸 또는 광고', '내 저작물 도용', '기타'] as const;

type Props = {
  visible: boolean;
  target: ReportTarget;
  targetId: string;
  /** 게시물·댓글 신고 시 함께 차단할 수 있는 작성자 */
  authorId?: string;
  onClose: () => void;
};

/** App Store 1.2 요건: 신고 + 차단. 신고 3회면 서버 트리거가 자동 숨김. */
export function ReportSheet({ visible, target, targetId, authorId, onClose }: Props) {
  const [reason, setReason] = useState<string | null>(null);
  const report = useReport();
  const blockUser = useToggleBlock();

  const submit = (alsoBlock: boolean) => {
    if (!reason) return;
    report.mutate(
      { target, targetId, reason },
      {
        onSuccess: async () => {
          if (alsoBlock && authorId) {
            await blockUser.mutateAsync({ userId: authorId, blocked: false }).catch(() => {});
          }
          setReason(null);
          onClose();
          showAlert('신고했어요', '검토 후 조치합니다. 같은 게시물이 3번 신고되면 자동으로 숨겨져요.');
        },
        onError: (e) => showAlert('신고하지 못했어요', e instanceof Error ? e.message : String(e)),
      },
    );
  };

  return (
    <BottomSheet visible={visible} title="신고하기" onClose={onClose}>
      <View style={styles.reasons}>
        {REASONS.map((r) => {
          const on = r === reason;
          return (
            <Pressable
              key={r}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => setReason(r)}
              style={[styles.reason, on && styles.reasonOn]}
            >
              <Text style={[styles.reasonText, on && styles.reasonTextOn]}>{r}</Text>
            </Pressable>
          );
        })}
      </View>
      <Button label="신고" large disabled={!reason || report.isPending} onPress={() => submit(false)} />
      {authorId ? (
        <Button
          label="신고하고 이 사람 차단"
          variant="secondary"
          large
          disabled={!reason || report.isPending}
          onPress={() => submit(true)}
        />
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  reasons: { gap: space.sm },
  reason: {
    minHeight: size.tap,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderWidth: size.hairline,
    borderColor: color.border,
    borderRadius: radius.button,
  },
  reasonOn: { borderColor: color.accent, backgroundColor: color.bg },
  reasonText: { fontSize: fontSize.body, color: color.text },
  reasonTextOn: { color: color.accent },
});
