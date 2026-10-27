/** 순수 함수만. 브라우저 의존 없음 → 단위 테스트 가능. */

export function todayIso(): string {
  return toDateOnly(new Date());
}

/** Date → 'YYYY-MM-DD' (로컬 시간대) */
export function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'YYYY-MM-DD' → 시작일 포함 며칠째. 시작 당일 = 1 */
export function daysSince(dateOnly: string, now: Date = new Date()): number {
  const [y, m, d] = dateOnly.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return 1;
  const start = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, diff + 1);
}

/** 'YYYY-MM-DD' 또는 ISO → '8월 8일' */
export function formatMonthDay(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** ISO → '9월 18일 오후 2:32'. 기록을 언제 찍었는지 캡션에 쓴다 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${ampm} ${h12}:${min}`;
}

/** ISO → '9월 18일' 또는 해가 다르면 '2025년 9월 18일' */
export function formatDateWithYear(iso: string, now: Date = new Date()): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  const sameYear = d.getFullYear() === now.getFullYear();
  return sameYear ? formatMonthDay(iso) : `${d.getFullYear()}년 ${formatMonthDay(iso)}`;
}

export function currentTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
export function validProjectDate(value: string, today = todayIso()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function validateProjectDates(start: string, finished: string | null, today = todayIso()): string | null {
  if (!validProjectDate(start, today) || (finished !== null && !validProjectDate(finished, today))) return '과거 또는 오늘의 유효한 날짜를 선택해 주세요';
  if (finished !== null && finished < start) return '완성일이 시작일보다 앞이에요';
  return null;
}
