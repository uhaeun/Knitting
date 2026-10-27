import { useAuth } from '@/features/auth/store';
import { getSupabase, PHOTOS_BUCKET } from '@/shared/lib/supabase';

/**
 * Supabase 공통 헬퍼. 로컬 DB·파일 없이 Supabase가 원본이다.
 * (브라우저 저장소는 Safari가 7일 뒤 지울 수 있어 사진 원본을 둘 수 없다)
 */

export const SIGNED_URL_TTL = 3600;
/** 남은 수명이 이보다 짧으면 새로 발급한다. 화면이 이 시간 안에 다시 불러오면 깨진 사진을 보지 않는다 */
const RENEW_BEFORE_MS = 15 * 60 * 1000;
/** PostgREST 기본 max_rows. 이보다 많은 행은 range로 나눠 읽는다 */
export const PAGE_ROWS = 1000;
const SIGN_BATCH = 500;

export function requireUserId(): string {
  const id = useAuth.getState().session?.user.id;
  if (!id) throw new Error('로그인이 필요해요');
  return id;
}

/**
 * 발급한 서명 URL을 만료 전까지 재사용한다.
 * 매번 새로 발급하면 주소가 바뀌어 expo-image 캐시가 빗나가고 사진을 다시 내려받는다.
 * 페이지를 새로 열면 비워진다 (메모리에만 둔다).
 */
const signed = new Map<string, { url: string; expiresAt: number }>();
let generation = 0;
export function forgetSignedUrls(): void {
  generation += 1;
  signed.clear();
  signedFor = null;
}
let signedFor: string | null = null; // 캐시를 채운 계정. 계정이 바뀌면 비운다

/** Storage 키 → 미디어 주소. 결과물은 권한을 재검사하는 게이트웨이, 원본 기록은 Storage 배치 서명을 사용한다. 실패한 키는 빠진다. */
export async function signPaths(keys: readonly string[]): Promise<Map<string, string>> {
  const userId = useAuth.getState().session?.user.id ?? null;
  if (userId !== signedFor) {
    forgetSignedUrls();
    signedFor = userId;
  }
  const requestGeneration = generation;
  const now = Date.now();
  const out = new Map<string, string>();
  const missing: string[] = [];
  for (const key of new Set(keys)) {
    const hit = signed.get(key);
    if (hit && hit.expiresAt - now > RENEW_BEFORE_MS) out.set(key, hit.url);
    else missing.push(key);
  }
  if (missing.length === 0) return out;

  const expiresAt = now + SIGNED_URL_TTL * 1000;
  // 사진이 수천 장인 편물에서 요청 하나가 너무 커지지 않게 나눈다
  for (let i = 0; i < missing.length; i += SIGN_BATCH) {
    const batch = missing.slice(i, i + SIGN_BATCH);
    const sb = getSupabase();
    const protectedReply = await sb.functions.invoke('revocable-media', { body: { keys: batch } });
    if (protectedReply.error) throw new Error('미디어 접근 권한을 확인하지 못했어요');
    const protectedUrls = (protectedReply.data as { urls: { path: string; url: string }[] }).urls;
    const protectedPaths = new Set(protectedUrls.map((u) => u.path));
    const daily = batch.filter((path) => !protectedPaths.has(path));
    const dailyReply = daily.length ? await sb.storage.from(PHOTOS_BUCKET).createSignedUrls(daily, SIGNED_URL_TTL) : { data: [], error: null };
    const data = [...(dailyReply.data ?? []), ...protectedUrls.map((u) => ({ path: u.path, signedUrl: u.url }))];
    const error = dailyReply.error;
    if (requestGeneration !== generation || useAuth.getState().session?.user.id !== userId) {
      throw new Error('계정이나 공개 범위가 바뀌었어요. 다시 확인해 주세요.');
    }
    if (error) throw new Error('사진 주소를 받지 못했어요');
    for (const d of data ?? []) {
      if (!d.path || !d.signedUrl) continue;
      signed.set(d.path, { url: d.signedUrl, expiresAt });
      out.set(d.path, d.signedUrl);
    }
  }
  return out;
}

/** from~to(포함) 범위를 읽는 함수를 받아 끝까지 모은다 */
export async function readAllPages<T>(
  readRange: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await readRange(from, from + PAGE_ROWS - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_ROWS) return rows;
  }
}
