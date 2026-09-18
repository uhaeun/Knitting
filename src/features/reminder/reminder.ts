/** 촬영 알림. 순수 부분만 — 시간 목록과 문구. 예약은 useReminder가 한다. */

export type ReminderTime = { hour: number; minute: number };

/** 고를 수 있는 시간. 뜨개를 많이 하는 저녁 위주 */
export const REMINDER_TIMES: readonly ReminderTime[] = [
  { hour: 8, minute: 0 },
  { hour: 12, minute: 30 },
  { hour: 19, minute: 0 },
  { hour: 21, minute: 0 },
  { hour: 22, minute: 30 },
] as const;

export const DEFAULT_REMINDER: ReminderTime = { hour: 21, minute: 0 };

/** '오후 9:00' */
export function formatReminder(t: ReminderTime): string {
  const ampm = t.hour < 12 ? '오전' : '오후';
  const h12 = t.hour % 12 === 0 ? 12 : t.hour % 12;
  return `${ampm} ${h12}:${String(t.minute).padStart(2, '0')}`;
}

/** 알림 문구. 재촉하지 않는다 — 뜨개를 한 날에만 찍으면 된다 */
export const REMINDER_TITLE = '닛팅';
export const REMINDER_BODY = '오늘 뜨개했다면 한 장 남겨 볼까요?';
