import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { useRenameProject } from '@/features/project/queries';
import { showAlert } from '@/shared/lib/dialog';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import { space } from '@/shared/ui/tokens';

type Props = {
  visible: boolean;
  projectId: string;
  currentName: string;
  onClose: () => void;
};

/** 편물 이름 바꾸기. 만들기 시트와 같은 입력 규칙 (1~50자).
 *  열 때마다 지금 이름에서 시작하도록 부모가 열 때만 마운트한다. */
export function RenameProjectSheet({ visible, projectId, currentName, onClose }: Props) {
  const [name, setName] = useState(currentName);
  const rename = useRenameProject();

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && trimmed !== currentName && !rename.isPending;

  const submit = () => {
    rename.mutate(
      { id: projectId, name: trimmed },
      {
        onSuccess: onClose,
        onError: (e) => showAlert('이름을 바꾸지 못했어요', e instanceof Error ? e.message : String(e)),
      },
    );
  };

  return (
    <BottomSheet visible={visible} title="이름 바꾸기" onClose={onClose}>
      <Field
        label="편물 이름"
        value={name}
        onChangeText={setName}
        maxLength={50}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={canSubmit ? submit : undefined}
      />
      <Button label="저장" large onPress={submit} disabled={!canSubmit} style={styles.action} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({ action: { marginTop: space.sm } });
