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

/** 서버·브라우저가 영어로 주는 흔한 오류를 사람 말로. 모르는 문구는 그대로 둔다 */
const FRIENDLY: readonly [RegExp, string][] = [
  [/failed to fetch|load failed|networkerror|network request failed|err_internet_disconnected/i, '인터넷 연결을 확인해 주세요.'],
  [/timeout|timed out/i, '응답이 늦어요. 잠시 후 다시 시도해 주세요.'],
  [/jwt expired|invalid jwt|refresh token/i, '로그인이 만료됐어요. 다시 로그인해 주세요.'],
  [/rate limit|too many requests/i, '잠시 후 다시 시도해 주세요.'],
  [/payload too large|exceeded the maximum allowed size|entity too large/i, '파일이 너무 커요.'],
  [/duplicate key|already exists/i, '이미 있어요.'],
  [/permission denied|not allowed|row-level security|violates row-level/i, '권한이 없어요.'],
  [/quota|no space left/i, '저장 공간이 부족해요.'],
];

export function friendlyMessage(message?: string): string | undefined {
  if (!message) return message;
  for (const [re, text] of FRIENDLY) if (re.test(message)) return text;
  return message;
}

export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  const list = buttons && buttons.length ? buttons : [{ text: '확인' }];
  useDialogs.getState().push({ title, message: friendlyMessage(message), buttons: list });
}

/** 버튼 순서: 실행 버튼들 → 취소는 맨 아래 */
export function orderButtons(buttons: readonly AlertButton[]): { actions: AlertButton[]; cancel: AlertButton | null } {
  const cancel = buttons.find((b) => b.style === 'cancel') ?? null;
  return { actions: buttons.filter((b) => b !== cancel), cancel };
}
