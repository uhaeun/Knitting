/**
 * 결과 사진·영상 저장. 폰은 공유 창을 열어 사용자가 "이미지 저장"/"비디오 저장"을 누른다
 * (웹은 사진첩에 직접 쓸 수 없다). 공유 창이 없는 브라우저(대부분의 데스크톱)는 파일로 내려받는다.
 *
 * file은 버튼을 누르기 전에 만들어 둔다. iPhone Safari는 누른 직후가 아니면 공유 창을 막는데,
 * 누른 뒤에 파일을 내려받느라 await하면 그 "직후"가 지나가 버린다.
 */
export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled';

export async function saveOrShare(file: File, uri: string): Promise<SaveOutcome> {
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

/** 공유 창을 쓸 수 있는 브라우저인가 (안내 문구용) */
export function canShareFiles(): boolean {
  try {
    return !!navigator.canShare?.({ files: [new File([], 'probe.jpg', { type: 'image/jpeg' })] });
  } catch {
    return false;
  }
}
