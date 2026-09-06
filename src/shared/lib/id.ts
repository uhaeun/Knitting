import { randomUUID } from 'expo-crypto';

/** 모든 레코드·파일명의 ID. auto-increment 금지. */
export function newId(): string {
  return randomUUID();
}
