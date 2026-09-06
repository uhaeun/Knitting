import { Directory, File, Paths } from 'expo-file-system';

/**
 * 사진 파일 저장소. DB에는 문서 디렉터리 기준 상대 경로만 저장한다.
 * (iOS는 앱 업데이트 때 컨테이너 절대 경로가 바뀔 수 있다)
 */
const PHOTOS = 'photos';
const THUMBS = 'thumbs';

function dir(name: string): Directory {
  const d = new Directory(Paths.document, name);
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

export const photoDir = (): Directory => dir(PHOTOS);
export const thumbDir = (): Directory => dir(THUMBS);

/** 상대 경로 → 표시·읽기용 절대 URI */
export function toUri(relativePath: string): string {
  return new File(Paths.document, relativePath).uri;
}

export function relPath(folder: typeof PHOTOS | typeof THUMBS, fileName: string): string {
  return `${folder}/${fileName}`;
}

/** 임시 URI의 파일을 지정 위치로 옮긴다. 실패하면 throw (호출부에서 롤백) */
export async function moveInto(tempUri: string, folder: Directory, fileName: string): Promise<void> {
  const src = new File(tempUri);
  const dst = new File(folder, fileName);
  await src.move(dst, { overwrite: false });
}

export function deleteIfExists(relativePath: string): void {
  const f = new File(Paths.document, relativePath);
  if (f.exists) f.delete();
}

/** 앱 시작 시 호출. DB에 없는 고아 파일을 지운다. */
export function pruneOrphans(keepRelativePaths: ReadonlySet<string>): number {
  let removed = 0;
  for (const [folder, d] of [
    [PHOTOS, photoDir()],
    [THUMBS, thumbDir()],
  ] as const) {
    for (const entry of d.list()) {
      if (!(entry instanceof File)) continue;
      if (keepRelativePaths.has(relPath(folder, entry.name))) continue;
      entry.delete();
      removed += 1;
    }
  }
  return removed;
}
