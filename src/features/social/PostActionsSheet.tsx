import { StyleSheet, View } from 'react-native';

import { useToggleBlock } from '@/features/social/queries';
import { showAlert } from '@/shared/lib/dialog';
import type { FeedPost } from '@/shared/types/remote';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { space } from '@/shared/ui/tokens';

type Props = {
  post: FeedPost | null;
  isMine: boolean;
  onClose: () => void;
  onReport: () => void;
  onDelete?: () => void;
};

/** 피드 카드 ⋯ 메뉴. 남의 글이면 신고·차단, 내 글이면 삭제. */
export function PostActionsSheet({ post, isMine, onClose, onReport, onDelete }: Props) {
  const blockUser = useToggleBlock();
  if (!post) return null;

  const confirmBlock = () => {
    showAlert(`${post.profiles.display_name} 님을 차단할까요?`, '서로의 게시물이 보이지 않고 팔로우가 해제됩니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '차단',
        style: 'destructive',
        onPress: () =>
          blockUser.mutate(
            { userId: post.owner_id, blocked: false },
            {
              onSuccess: onClose,
              onError: (e) => showAlert('차단하지 못했어요', e instanceof Error ? e.message : String(e)),
            },
          ),
      },
    ]);
  };

  return (
    <BottomSheet visible onClose={onClose} title={post.projects.name}>
      <View style={styles.block}>
        {isMine ? (
          onDelete ? <Button label="이 사진 삭제" variant="secondary" large onPress={onDelete} /> : null
        ) : (
          <>
            <Button label="신고하기" variant="secondary" large onPress={onReport} />
            <Button label="이 사람 차단" variant="secondary" large onPress={confirmBlock} />
          </>
        )}
        <Button label="닫기" variant="secondary" large onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({ block: { gap: space.sm } });
