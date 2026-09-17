/**
 * 웹 전용. 웹에는 로컬 사진 파일이 없고, 저장소(repository.web.ts)가 경로 자리에 서명 URL을 넣어 준다.
 * 그래서 toUri는 받은 값을 그대로 돌려준다.
 */
export function toUri(pathOrUrl: string): string {
  return pathOrUrl;
}
