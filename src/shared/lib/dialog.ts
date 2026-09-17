import type { AlertButton } from 'react-native';

/**
 * 확인·선택 대화상자. react-native-web의 Alert.alert는 아무것도 띄우지 않아서 브라우저 기본 대화상자로 흉내 낸다.
 * 화면은 Alert 대신 이 함수만 쓴다.
 * - 버튼 없음·하나: alert
 * - 실행 버튼 하나 + 취소: confirm
 * - 실행 버튼 여럿: prompt에 번호 목록
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  const text = [title, message].filter(Boolean).join('\n\n');
  const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');
  const cancel = (buttons ?? []).find((b) => b.style === 'cancel');

  if (actions.length === 0) {
    window.alert(text);
    return;
  }
  if (actions.length === 1 && !cancel) {
    window.alert(text);
    actions[0]?.onPress?.();
    return;
  }
  if (actions.length === 1) {
    if (window.confirm(`${text}\n\n[확인] ${actions[0]?.text ?? ''}`)) actions[0]?.onPress?.();
    else cancel?.onPress?.();
    return;
  }

  const list = actions.map((b, i) => `${i + 1}. ${b.text ?? ''}`).join('\n');
  const answer = window.prompt(`${text}\n\n${list}\n\n번호를 입력하세요`);
  const chosen = answer ? actions[Number.parseInt(answer, 10) - 1] : undefined;
  if (chosen) chosen.onPress?.();
  else cancel?.onPress?.();
}
