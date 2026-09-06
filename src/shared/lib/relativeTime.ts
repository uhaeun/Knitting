/** 순수 함수. ISO → "방금", "3분", "2시간", "5일", "8월 8일" */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((now.getTime() - t) / 1000));
  if (diffSec < 60) return '방금';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}시간`;
  if (diffSec < 7 * 86_400) return `${Math.floor(diffSec / 86_400)}일`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
