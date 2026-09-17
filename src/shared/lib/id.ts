/** 모든 레코드·파일명의 ID. UUID v4. auto-increment 금지. (브라우저 내장 crypto.randomUUID) */
export function newId(): string {
  return crypto.randomUUID();
}
