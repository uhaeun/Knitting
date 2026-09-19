/**
 * 결과 사진·영상 저장. 폰은 공유 창을 열어 사용자가 "이미지 저장"/"비디오 저장"을 누른다
 * (웹은 사진첩에 직접 쓸 수 없다). 공유 창이 없는 브라우저(대부분의 데스크톱)는 파일로 내려받는다.
 *
 * file은 버튼을 누르기 전에 만들어 둔다. iPhone Safari는 누른 직후가 아니면 공유 창을 막는데,
 * 누른 뒤에 파일을 내려받느라 await하면 그 "직후"가 지나가 버린다.
 */
import { Media } from '@capacitor-community/media';

import { isNativeApp, nativePlatform } from '@/shared/lib/platform';

export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled' | 'saved';

const ALBUM = '닛팅';

/**
 * 안드로이드는 저장할 앨범을 꼭 지정해야 한다 ('Album identifier required').
 * '닛팅' 앨범을 찾고, 없으면 만든다. 아이폰은 지정하지 않는다 — 그래야 '추가만' 권한으로 저장된다
 */
async function androidAlbum(): Promise<string> {
  const find = async () => {
    const [{ path }, { albums }] = await Promise.all([Media.getAlbumsPath(), Media.getAlbums()]);
    return albums.find((a) => a.name === ALBUM && a.identifier.startsWith(path))?.identifier;
  };
  const found = await find();
  if (found) return found;
  await Media.createAlbum({ name: ALBUM });
  const made = await find();
  if (!made) throw new Error('사진첩에 닛팅 앨범을 만들지 못했어요');
  return made;
}

/** 앱에서는 사진첩에 바로 넣는다. 공유 창을 한 번 더 누르지 않아도 된다 */
async function saveToLibrary(file: File): Promise<SaveOutcome> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('파일을 읽지 못했어요'));
    r.readAsDataURL(file);
  });
  const albumIdentifier = nativePlatform() === 'android' ? await androidAlbum() : undefined;
  const fileName = file.name.replace(/\.[^.]+$/, '');
  if (file.type.startsWith('video')) await Media.saveVideo({ path: dataUrl, albumIdentifier, fileName });
  else await Media.savePhoto({ path: dataUrl, albumIdentifier, fileName });
  return 'saved';
}

export async function saveOrShare(file: File, uri: string): Promise<SaveOutcome> {
  if (isNativeApp()) return saveToLibrary(file);
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'; // 사용자가 공유 창을 닫음
      throw e;
    }
  }
  const a = document.createElement('a');
  a.href = uri;
  a.download = file.name;
  a.click();
  return 'downloaded';
}

/** 공유 창을 쓸 수 있는가 (안내 문구용). 앱에서는 공유 창 없이 바로 저장한다 */
export function canShareFiles(): boolean {
  if (isNativeApp()) return false;
  try {
    return !!navigator.canShare?.({ files: [new File([], 'probe.jpg', { type: 'image/jpeg' })] });
  } catch {
    return false;
  }
}

/** 저장 버튼 문구. 앱과 공유 창이 있는 폰은 사진첩, 나머지는 파일 */
export function saveLabel(): string {
  return isNativeApp() || canShareFiles() ? '사진첩에 저장' : '파일로 저장';
}

/** 저장 버튼 아래 안내. 앱은 바로 저장되므로 안내가 없다 */
export function saveHint(kind: 'image' | 'video'): string | null {
  if (isNativeApp() || !canShareFiles()) return null;
  return `열리는 공유 창에서 "${kind === 'video' ? '비디오' : '이미지'} 저장"을 누르세요. 인스타그램 등으로 바로 보낼 수도 있어요.`;
}
