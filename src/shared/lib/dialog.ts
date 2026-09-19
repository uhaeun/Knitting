import type { AlertButton } from 'react-native';
import { create } from 'zustand';

/**
 * 확인·선택 대화상자. 브라우저 기본 대화상자(alert·confirm·prompt) 대신 앱 안 시트로 띄운다.
 * - 버튼 없음: 안내 + [확인]
 * - 실행 버튼 + 취소: 버튼을 세로로 늘어놓는다 (예전에는 번호를 입력해야 했다)
 * 화면은 Alert 대신 이 함수만 쓴다. 그리는 쪽은 DialogHost.
 */

export type DialogRequest = { id: number; title: string; message?: string; buttons: AlertButton[] };

type DialogState = {
  queue: DialogRequest[];
  push: (d: Omit<DialogRequest, 'id'>) => void;
  close: (id: number) => void;
};

let nextId = 1;

export const useDialogs = create<DialogState>((set) => ({
  queue: [],
  push: (d) => set((s) => ({ queue: [...s.queue, { ...d, id: nextId++ }] })),
  close: (id) => set((s) => ({ queue: s.queue.filter((q) => q.id !== id) })),
}));

export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  const list = buttons && buttons.length ? buttons : [{ text: '확인' }];
  useDialogs.getState().push({ title, message, buttons: list });
}

/** 버튼 순서: 실행 버튼들 → 취소는 맨 아래 */
export function orderButtons(buttons: readonly AlertButton[]): { actions: AlertButton[]; cancel: AlertButton | null } {
  const cancel = buttons.find((b) => b.style === 'cancel') ?? null;
  return { actions: buttons.filter((b) => b !== cancel), cancel };
}
