import { showAlert } from '@/shared/lib/dialog';

/** 기록 지우기 확인. 피드·게시물 상세에서 같은 문구를 쓴다 (편물 화면은 몇 번째인지까지 보여줘서 따로). */
export function confirmDeletePost(kind: '사진' | '영상', onConfirm: () => void) {
  showAlert(`이 ${kind}을 지울까요?`, '편물 기록과 결과물에서도 빠집니다. 되돌릴 수 없어요.', [
    { text: '취소', style: 'cancel' },
    { text: '지우기', style: 'destructive', onPress: onConfirm },
  ]);
}
