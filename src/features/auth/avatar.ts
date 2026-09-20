import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { centerSquare } from '@/features/capture/image';
import { getSupabase } from '@/shared/lib/supabase';

export const AVATARS_BUCKET = 'avatars';
export const AVATAR_SIDE = 400;

/** 공개 버킷이라 주소를 그대로 쓴다. 서명 URL을 사람 수만큼 발급하지 않는다 */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return getSupabase().storage.from(AVATARS_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * 고른 사진을 정사각 400 JPEG로 만들어 올리고 새 경로를 돌려준다.
 * 파일 이름에 시각을 넣어 브라우저가 옛 사진을 계속 보여 주지 않게 한다.
 */
export async function uploadAvatar(userId: string, uri: string, width: number, height: number): Promise<string> {
  const crop = centerSquare(width, height);
  const ref = await ImageManipulator.manipulate(uri)
    .crop(crop)
    .resize({ width: AVATAR_SIDE, height: AVATAR_SIDE })
    .renderAsync();
  const image = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  const blob = await fetch(image.uri).then((r) => r.blob());

  const path = `${userId}/avatar-${Date.now()}.jpg`;
  const bucket = getSupabase().storage.from(AVATARS_BUCKET);
  const { error } = await bucket.upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`사진을 올리지 못했어요: ${error.message}`);
  return path;
}

/** 옛 사진 지우기. 실패해도 새 사진은 이미 올라가 있어서 그냥 넘어간다 */
export async function removeAvatar(path: string | null | undefined): Promise<void> {
  if (!path) return;
  try {
    await getSupabase().storage.from(AVATARS_BUCKET).remove([path]);
  } catch {
    // 남은 파일은 계정 삭제 때 함께 지워진다
  }
}
