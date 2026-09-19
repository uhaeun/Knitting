/** 촬영 알림 규칙. 순수 함수 — 다음 알림 시각 계산과 문구. 예약은 useReminder가 한다. */

export type ReminderTime = { hour: number; minute: number };

/** 반복 방식. 요일은 0=일 … 6=토 */
export type ReminderRule =
  | { kind: 'daily' }
  | { kind: 'weekly'; days: number[] }
  | { kind: 'interval'; everyDays: number; anchor: string }; // anchor: 'YYYY-MM-DD' 첫 알림 날짜

export const DEFAULT_REMINDER: ReminderTime = { hour: 21, minute: 0 };
export const DEFAULT_RULE: ReminderRule = { kind: 'daily' };
export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;
export const INTERVAL_CHOICES = [2, 3, 4, 5, 7, 10, 14] as const;

/** 한꺼번에 예약해 두는 개수. iOS는 앱당 대기 알림 64개까지라 여유를 둔다 */
export const SCHEDULE_AHEAD = 48;

/** '오후 9:00' */
export function formatReminder(t: ReminderTime): string {
  const ampm = t.hour < 12 ? '오전' : '오후';
  const h12 = t.hour % 12 === 0 ? 12 : t.hour % 12;
  return `${ampm} ${h12}:${String(t.minute).padStart(2, '0')}`;
}

/** '매일 오후 9:00' · '매주 월·수·금 오후 9:00' · '3일마다 오후 9:00' */
export function describeRule(rule: ReminderRule, time: ReminderTime): string {
  const at = formatReminder(time);
  if (rule.kind === 'daily') return `매일 ${at}`;
  if (rule.kind === 'weekly') {
    const days = [...rule.days].sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d]).join('·');
    return days ? `매주 ${days} ${at}` : '요일을 골라 주세요';
  }
  return `${rule.everyDays}일마다 ${at}`;
}

function atTime(d: Date, t: ReminderTime): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.hour, t.minute, 0, 0);
}

function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** from 이후(초과)의 알림 시각을 limit개까지. 규칙이 비어 있으면 빈 목록 */
export function nextOccurrences(rule: ReminderRule, time: ReminderTime, from: Date, limit = SCHEDULE_AHEAD): Date[] {
  const out: Date[] = [];
  if (rule.kind === 'weekly' && rule.days.length === 0) return out;
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const anchor = rule.kind === 'interval' ? parseDay(rule.anchor) : null;
  // 최악은 매주 한 요일 → limit주. 넉넉히 날짜를 훑는다
  const maxDays = rule.kind === 'interval' ? limit * rule.everyDays + rule.everyDays : limit * 7 + 7;
  for (let i = 0; i <= maxDays && out.length < limit; i += 1) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    let hit = false;
    if (rule.kind === 'daily') hit = true;
    else if (rule.kind === 'weekly') hit = rule.days.includes(day.getDay());
    else if (anchor) {
      const diff = Math.round((day.getTime() - anchor.getTime()) / 86_400_000);
      hit = diff >= 0 && diff % rule.everyDays === 0;
    }
    if (!hit) continue;
    const when = atTime(day, time);
    if (when.getTime() > from.getTime()) out.push(when);
  }
  return out;
}

/** 알림 문구. 재촉하지 않는다 — 뜨개를 한 날에만 찍으면 된다 */
export const REMINDER_TITLE = '닛팅';
export const REMINDER_BODY = '오늘 뜨개했다면 한 장 남겨 볼까요?';
