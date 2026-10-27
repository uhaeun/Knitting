import { useDeleteAccount } from '@/features/auth/queries';
import { useAuth } from '@/features/auth/store';
import { EmptyState } from '@/shared/ui/EmptyState';
import { showAlert } from '@/shared/lib/dialog';

export function AccountDeletionPending() {
  const userId = useAuth((s) => s.session?.user.id);
  const deletion = useDeleteAccount();
  return <EmptyState title={deletion.isPending ? '계정을 정리하는 중이에요' : '계정 삭제가 진행 중이에요'}
    description="일부 파일은 이미 정리됐을 수 있어요. 삭제를 완료할 때까지 새 기록을 추가할 수 없어요."
    actionLabel={deletion.isPending ? undefined : '삭제 다시 시도'}
    onAction={() => { if (userId && !deletion.isPending) deletion.mutate(userId, { onError: (e) => showAlert('삭제를 완료하지 못했어요', e.message) }); }} />;
}
